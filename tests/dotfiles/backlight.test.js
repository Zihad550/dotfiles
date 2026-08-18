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
        { device: "intel_backlight", current: 240, maximum: 500, percent: 48 },
    );
    assert.strictEqual(Backlight.parse("input3::capslock,leds,1,100%,1"), null);
    assert.strictEqual(Backlight.parse("broken output"), null);
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
    assert.match(service, /property bool available:\s*false/);
    assert.match(service, /property int percent:\s*0/);
    assert.match(service, /function refresh\(\): void/);
    assert.match(service, /pendingAdjustment/);
    assert.match(service, /if \(writeProcess\.running \|\| readProcess\.running\)/);
    assert.match(service, /Backlight\.writeCommand/);
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
