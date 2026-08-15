const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

test("battery thresholds have one notification producer across multiple monitors", () => {
    const shell = source("shell.qml");
    const bar = source("modules/Bar.qml");
    const battery = source("modules/Battery.qml");

    assert.match(shell, /Variants\s*{[\s\S]*model:\s*Quickshell\.screens[\s\S]*Bar\s*{}/);
    assert.match(bar, /Battery\s*{}/);
    assert.doesNotMatch(
        battery,
        /notify-send|execDetached/,
        "Battery is instantiated once per monitor, so it must not emit threshold notifications",
    );
    assert.match(shell, /BatteryService\s*{}/, "the shell should own one battery notification producer");
});
