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
});

test("backlight state serializes repeated adjustments from confirmed values", () => {
    let state = Backlight.confirm(Backlight.initialState(), { current: 200, maximum: 500 });
    state = Backlight.queueAdjustment(state, 5);

    const first = Backlight.takeAdjustment(state);
    assert.deepStrictEqual(first.command, Backlight.writeCommand(226));
    assert.strictEqual(first.state.pendingAdjustment, 0);

    state = Backlight.queueAdjustment(first.state, 5);
    assert.strictEqual(state.pendingAdjustment, 5);
    state = Backlight.confirm(state, { current: 226, maximum: 500 });

    const second = Backlight.takeAdjustment(state);
    assert.deepStrictEqual(second.command, Backlight.writeCommand(251));
});

test("backlight failures retain confirmation and a later refresh recovers", () => {
    const confirmed = Backlight.confirm(Backlight.initialState(), { current: 251, maximum: 500 });
    const failed = Backlight.readFailed(confirmed);

    assert.strictEqual(failed.available, false);
    assert.strictEqual(failed.percent, 50);
    assert.strictEqual(failed.maximum, 500);

    const recovered = Backlight.confirm(failed, { current: 400, maximum: 500 });
    assert.strictEqual(recovered.available, true);
    assert.strictEqual(recovered.percent, 80);
});

test("backlight percentage maps across the nonzero hardware range", () => {
    assert.strictEqual(Backlight.rawForPercent(0, 500), 1);
    assert.strictEqual(Backlight.rawForPercent(50, 500), 251);
    assert.strictEqual(Backlight.rawForPercent(100, 500), 500);
    assert.strictEqual(Backlight.percentForRaw(1, 500), 0);
    assert.strictEqual(Backlight.percentForRaw(251, 500), 50);
    assert.strictEqual(Backlight.percentForRaw(500, 500), 100);
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
    assert.match(service, /onExited:[\s\S]*exitCode === 0[\s\S]*confirm/);
    assert.match(service, /console\.warn/);
    assert.match(service, /Component\.onCompleted:\s*refresh\(\)/);
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
