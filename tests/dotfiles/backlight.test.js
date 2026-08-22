const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Backlight = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/backlight.js");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

test("backlight commands always constrain brightnessctl to the backlight class", () => {
    assert.deepStrictEqual(Backlight.readCommand(), ["brightnessctl", "--class=backlight", "--machine-readable", "info"]);
    assert.deepStrictEqual(Backlight.writeCommand(240), ["brightnessctl", "--class=backlight", "--machine-readable", "set", "240"]);
});

test("backlight output identifies the selected device and confirmed state", () => {
    assert.deepStrictEqual(
        Backlight.parse("intel_backlight,backlight,240,48%,500"),
        { current: 240, maximum: 500 },
    );
    assert.strictEqual(Backlight.parse("input3::capslock,leds,1,100%,1"), null);
    assert.strictEqual(Backlight.parse("broken output"), null);
    assert.strictEqual(Backlight.parse("intel_backlight,backlight,240junk,48%,500"), null);
    assert.strictEqual(Backlight.parse("intel_backlight,backlight,240,48oops,500"), null);
    assert.strictEqual(Backlight.parse("intel_backlight,backlight,240,48%,500x"), null);
    assert.strictEqual(Backlight.parse(`intel_backlight,backlight,1,1%,${"9".repeat(400)}`), null);
});

test("backlight state serializes repeated adjustments from confirmed values", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.queueAdjustment(state, 5);

    const firstTargetRaw = Backlight.rawForPercent(state.percent + 5, 500);
    const first = Backlight.takeAdjustment(state);
    assert.deepStrictEqual(first.command, Backlight.writeCommand(firstTargetRaw));
    assert.strictEqual(first.state.pendingAdjustment, 0);

    state = Backlight.queueAdjustment(first.state, 5);
    assert.strictEqual(state.pendingAdjustment, 5);
    assert.strictEqual(Backlight.takeAdjustment(state), null, "a second write waits for confirmation");
    // The device echoes back exactly the raw value the first write asked for.
    state = Backlight.settleWrite(state, 0, { current: firstTargetRaw, maximum: 500 }).state;

    const secondTargetRaw = Backlight.rawForPercent(state.percent + 5, 500);
    const second = Backlight.takeAdjustment(state);
    assert.deepStrictEqual(second.command, Backlight.writeCommand(secondTargetRaw));
});

test("the slider's absolute target collapses rapid requests to the latest value", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.queueTarget(state, 60);
    state = Backlight.queueTarget(state, 65);
    state = Backlight.queueTarget(state, 70);

    assert.strictEqual(state.requested, 70, "the thumb tracks the latest requested value immediately");

    const write = Backlight.takeAbsolute(state);
    assert.deepStrictEqual(write.command, Backlight.writeCommand(Backlight.rawForPercent(70, 500)));
    assert.strictEqual(write.state.pendingTarget, null);
    assert.strictEqual(Backlight.takeAbsolute(write.state), null, "a second write waits for confirmation");
});

test("an absolute target and a relative step never both queue -- the newest request wins", () => {
    const confirmed = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });

    const afterTarget = Backlight.queueTarget(Backlight.queueAdjustment(confirmed, 5), 80);
    assert.strictEqual(afterTarget.pendingAdjustment, 0);
    assert.strictEqual(afterTarget.pendingTarget, 80);

    const afterAdjustment = Backlight.queueAdjustment(Backlight.queueTarget(confirmed, 80), 5);
    assert.strictEqual(afterAdjustment.pendingTarget, null);
    assert.strictEqual(afterAdjustment.pendingAdjustment, 5);
    assert.strictEqual(
        afterAdjustment.requested,
        confirmed.percent,
        "a key press abandons the slider's target -- the panel must not keep showing it",
    );
});

test("a successful slider write reconciles the optimistic value with the confirmed percent", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.takeAbsolute(Backlight.queueTarget(state, 70)).state;

    // The device echoes back exactly the raw value the write asked for.
    const settled = Backlight.settleWrite(state, 0, { current: Backlight.rawForPercent(70, 500), maximum: 500 });
    assert.strictEqual(settled.state.percent, 70);
    assert.strictEqual(settled.state.requested, 70);
});

test("a confirmation does not overwrite a newer slider target still queued", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.takeAbsolute(Backlight.queueTarget(state, 70)).state;
    state = Backlight.queueTarget(state, 85); // the drag continues while write #1 is in flight

    const settled = Backlight.settleWrite(state, 0, { current: Backlight.rawForPercent(70, 500), maximum: 500 });
    assert.strictEqual(settled.state.percent, 70);
    assert.strictEqual(settled.state.requested, 85, "the thumb must not snap back mid-drag");

    const next = Backlight.takeAbsolute(settled.state);
    assert.deepStrictEqual(next.command, Backlight.writeCommand(Backlight.rawForPercent(85, 500)));
});

test("a failed write does not roll back over a newer slider target still queued", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.takeAbsolute(Backlight.queueTarget(state, 70)).state;
    state = Backlight.queueTarget(state, 85);

    const failed = Backlight.settleWrite(state, 1, null);
    assert.strictEqual(failed.state.requested, 85, "the queued target survives the unrelated write's failure");
    assert.strictEqual(failed.state.pendingTarget, 85);
});

test("a failed slider write restores the last confirmed value", () => {
    const initialPercent = Backlight.percentForRaw(200, 500);
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.takeAbsolute(Backlight.queueTarget(state, 70)).state;

    const failed = Backlight.settleWrite(state, 1, null);
    assert.strictEqual(failed.confirmedPercent, null);
    assert.strictEqual(failed.refresh, true, "rediscovery is deferred to the next Quick Settings open");
    assert.strictEqual(failed.state.percent, initialPercent, "the confirmed value is untouched by the failure");
    assert.strictEqual(failed.state.requested, initialPercent, "the optimistic value rolls back to the last confirmed one");
});

test("only successful write settlement confirms an OSD value", () => {
    const initialPercent = Backlight.percentForRaw(200, 500);
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.takeAdjustment(Backlight.queueAdjustment(state, 5)).state;

    const failed = Backlight.settleWrite(state, 1, null);
    assert.strictEqual(failed.confirmedPercent, null);
    assert.strictEqual(failed.refresh, true);
    assert.strictEqual(failed.state.percent, initialPercent);

    const succeeded = Backlight.settleWrite(failed.state, 0, { current: 226, maximum: 500 });
    assert.strictEqual(succeeded.confirmedPercent, Backlight.percentForRaw(226, 500));
    assert.strictEqual(succeeded.refresh, false);
});

test("backlight failures retain confirmation and a later refresh recovers", () => {
    const confirmed = Backlight.confirm(Backlight.initialState(), { current: 251, maximum: 500 });
    const failed = Backlight.readFailed(confirmed);

    assert.strictEqual(failed.available, false);
    assert.strictEqual(failed.percent, Backlight.percentForRaw(251, 500));
    assert.strictEqual(failed.maximum, 500);

    const recovered = Backlight.confirm(failed, { current: 400, maximum: 500 });
    assert.strictEqual(recovered.available, true);
    assert.strictEqual(recovered.percent, Backlight.percentForRaw(400, 500));
});

test("backlight percentage maps across the nonzero hardware range", () => {
    assert.strictEqual(Backlight.rawForPercent(0, 500), 1);
    assert.strictEqual(Backlight.rawForPercent(50, 500), 243);
    assert.strictEqual(Backlight.percentForRaw(1, 500), 0);
    assert.strictEqual(Backlight.percentForRaw(251, 500), 52);
    assert.strictEqual(Backlight.percentForRaw(500, 500), 100);
});

test("100% never writes the literal maximum raw value (issue #86: some panels blank out at max)", () => {
    assert.strictEqual(Backlight.rawForPercent(100, 500), 485);
    assert.strictEqual(Backlight.rawForPercent(100, 2), 1);
    // A single-step range has no room to cap below the maximum.
    assert.strictEqual(Backlight.rawForPercent(100, 1), 1);
});

test("100% clears the wider dead zone found on amdgpu_bl1, not just the literal maximum (issue #79)", () => {
    // See docs/adr/0008-backlight-avoids-literal-max-raw.md.
    assert.ok(
        Backlight.rawForPercent(100, 65535) < 64223,
        "100%'s raw value must stay below the last raw value confirmed safe on real hardware",
    );
});

test("the capped write still round-trips to a displayed 100%, including on small-range panels", () => {
    assert.strictEqual(Backlight.percentForRaw(Backlight.rawForPercent(100, 500), 500), 100);
    assert.strictEqual(Backlight.percentForRaw(Backlight.rawForPercent(100, 100), 100), 100);
    assert.strictEqual(Backlight.percentForRaw(Backlight.rawForPercent(100, 24), 24), 100);
    assert.strictEqual(Backlight.percentForRaw(Backlight.rawForPercent(100, 2), 2), 100);
});

test("a brightness-down step off a capped 100% always yields a lower raw value", () => {
    // 1% is skipped at maximum=24: that panel quantizes to ~4.2%/unit, so a
    // single 1% press can legitimately not move (see docs/adr/0008).
    for (const maximum of [500, 100, 24]) {
        const atMax = Backlight.rawForPercent(100, maximum);
        const fiveDown = Backlight.rawForPercent(95, maximum);
        assert.ok(fiveDown < atMax, `maximum=${maximum} step=5: ${fiveDown} was not below ${atMax}`);
    }
    for (const maximum of [500, 100]) {
        const atMax = Backlight.rawForPercent(100, maximum);
        const oneDown = Backlight.rawForPercent(99, maximum);
        assert.ok(oneDown < atMax, `maximum=${maximum} step=1: ${oneDown} was not below ${atMax}`);
    }
});

test("shared backlight singleton owns refresh, serialized writes, and confirmed state", () => {
    const service = source("BacklightService.qml");

    assert.match(service, /pragma Singleton/);
    assert.match(service, /readonly property bool available:\s*backlightState\.available/);
    assert.match(service, /readonly property int percent:\s*backlightState\.percent/);
    assert.match(service, /function refresh\(\): void/);
    assert.match(service, /Backlight\.queueAdjustment/);
    assert.match(service, /if \(writeProcess\.running \|\| readProcess\.running\)/);
    assert.match(service, /Backlight\.takeAdjustment/);
    assert.match(service, /Backlight\.settleRead/);
    assert.match(service, /Backlight\.settleWrite/);
    assert.match(service, /outcome\.confirmedPercent !== null[\s\S]*root\.confirmed/);
    assert.match(service, /console\.warn/);
    assert.match(service, /Component\.onCompleted:\s*refresh\(\)/);
});

test("the slider's absolute writes are serialized alongside media-key writes, and only the latter raise the OSD", () => {
    const service = source("BacklightService.qml");

    assert.match(service, /readonly property int requested:\s*backlightState\.requested/);
    assert.match(service, /function setAbsolute\(percent: int\): void/);
    assert.match(service, /Backlight\.queueTarget/);
    assert.match(service, /Backlight\.takeAbsolute/);
    assert.match(service, /writeOrigin = "slider"/);
    assert.match(service, /writeOrigin = "key"/);
    assert.match(service, /if \(origin === "key"\)[\s\S]*?root\.confirmed/);
});

test("a failed refresh drains an explicit request but never loops on a queued adjustment", () => {
    const service = source("BacklightService.qml");
    const readProcessBlock = service.slice(service.indexOf("id: readProcess"), service.indexOf("id: writeProcess"));

    const failureBranch = readProcessBlock.slice(readProcessBlock.indexOf("failed to refresh backlight"));

    // An explicit refresh request must still be retried once after a failure...
    assert.match(failureBranch, /if \(root\.refreshRequested\) \{[\s\S]*root\.refresh\(\);/);
    // ...but a queued adjustment must not, or a backlight that never comes
    // back (missing brightnessctl, no panel) would retry forever.
    assert.doesNotMatch(failureBranch, /runQueuedWork|runPendingAdjustment/);
});

test("a failed write defers rediscovery until the next explicit refresh", () => {
    const service = source("BacklightService.qml");
    const refreshBlock = service.slice(service.indexOf("function refresh()"), service.indexOf("function raise("));
    const writeProcessBlock = service.slice(service.indexOf("id: writeProcess"), service.indexOf("Component.onCompleted"));
    const failureBranch = writeProcessBlock.slice(writeProcessBlock.indexOf("failed to set backlight"));

    assert.match(failureBranch, /root\.refreshRequested = outcome\.refresh/);
    assert.doesNotMatch(failureBranch, /root\.runQueuedWork\(\)/);
    assert.match(refreshBlock, /refreshRequested = false[\s\S]*readProcess\.running = true/);
});

test("media-key brightness keeps IPC parsing and shows only confirmed state", () => {
    const shell = source("shell.qml");
    const osd = source("OsdService.qml");

    assert.match(shell, /function brightnessRaise\(step: string\): void[\s\S]*OsdService\.brightnessRaise\(step\)/);
    assert.match(shell, /function brightnessLower\(step: string\): void[\s\S]*OsdService\.brightnessLower\(step\)/);
    assert.match(osd, /BacklightService\.raise\(parseStep\(step\)\)/);
    assert.match(osd, /BacklightService\.lower\(parseStep\(step\)\)/);
    assert.match(osd, /function parseStep[\s\S]*parsed <= 0 \? 5 : parsed/);
    assert.match(osd, /Connections\s*{[\s\S]*target:\s*BacklightService[\s\S]*onConfirmed/);
    assert.doesNotMatch(osd, /brightnessctl/);
});
