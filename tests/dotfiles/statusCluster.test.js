const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Status = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/statusCluster.js");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

test("the Status Cluster is the one Quick Settings opener and anchor on each bar", () => {
    const bar = source("modules/Bar.qml");

    assert.match(bar, /Voxtype\s*{}[\s\S]*StatusCluster\s*{/);
    assert.match(bar, /onClicked:\s*quickSettings\.toggle\(\)/);
    assert.match(bar, /QuickSettings\s*{[\s\S]*target:\s*statusCluster/);
    assert.match(bar, /Component\.onCompleted:\s*QuickSettingsRegistry\.register\(bar\.monitorName, quickSettings\)/);
    assert.match(bar, /Component\.onDestruction:\s*QuickSettingsRegistry\.unregister\(bar\.monitorName, quickSettings\)/);
    assert.doesNotMatch(bar, /\bTailscale\s*{}/);
    assert.doesNotMatch(bar, /\bBattery\s*{}/);
    assert.doesNotMatch(bar, /id:\s*gear/);
});

test("wired takes precedence over every Wi-Fi state", () => {
    assert.strictEqual(Status.networkIcon(true, true, true, true, 1), "󰀂");
    assert.strictEqual(Status.networkIcon(true, false, false, false, 0), "󰀂");
});

test("Wi-Fi remains visible with distinct connected, disconnected, and disabled glyphs", () => {
    assert.strictEqual(Status.networkIcon(false, true, true, true, 1), "󰤨");
    assert.strictEqual(Status.networkIcon(false, true, true, false, 0), "󰤮");
    assert.strictEqual(Status.networkIcon(false, true, false, false, 0), "󰤭");
    assert.strictEqual(Status.networkIcon(false, false, true, false, 0), "");
});

test("volume glyph follows mute and effective output level", () => {
    assert.strictEqual(Status.volumeIcon(false, false, 50), "");
    assert.strictEqual(Status.volumeIcon(true, true, 80), "");
    assert.strictEqual(Status.volumeIcon(true, false, 0), "");
    assert.strictEqual(Status.volumeIcon(true, false, 50), "");
    assert.strictEqual(Status.volumeIcon(true, false, 100), "");
});

test("battery glyph follows charging state and charge level", () => {
    assert.strictEqual(Status.batteryIcon(true, false, 9), "󰢜");
    assert.strictEqual(Status.batteryIcon(false, false, 9), "󰁺");
    assert.strictEqual(Status.batteryIcon(false, false, 54), "󰁿");
    assert.strictEqual(Status.batteryIcon(false, true, 100), "󰂅");
});

test("battery tone changes at the specified thresholds", () => {
    assert.strictEqual(Status.batteryTone(true, 1), "ok");
    assert.strictEqual(Status.batteryTone(false, 95), "ok");
    assert.strictEqual(Status.batteryTone(false, 94), "foreground");
    assert.strictEqual(Status.batteryTone(false, 31), "foreground");
    assert.strictEqual(Status.batteryTone(false, 30), "warn");
    assert.strictEqual(Status.batteryTone(false, 11), "warn");
    assert.strictEqual(Status.batteryTone(false, 10), "error");
});
