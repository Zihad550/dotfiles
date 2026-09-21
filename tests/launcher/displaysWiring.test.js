const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const source = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("SUPER+CTRL+D opens the displays Provider directly", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/utilities.lua");
    const systemBindings = source("hypr/.config/hypr/lua/bindings/system.lua");
    const shell = source("quickshell/.config/quickshell/launcher/shell.qml");
    const launcher = source("quickshell/.config/quickshell/launcher/modules/Launcher.qml");

    assert.match(bindings,
        /SUPER \+ CTRL \+ D", "Toggle displays", hl\.dsp\.global\("launcher:displays"\)/);
    assert.match(shell, /name: "displays"[\s\S]*onPressed: launcher\.openDisplays\(\)/);
    assert.match(launcher, /function openDisplays\(\): void[\s\S]*displays\.enter\(\)/);
    assert.match(launcher, /Displays\s*\{\s*id: displays/);
    assert.strictEqual((bindings + systemBindings).match(/SUPER \+ CTRL \+ D/g)?.length, 1,
        "the provider shortcut must not also toggle a display");
    assert.doesNotMatch(systemBindings, /df-hypr-close-display/);
});

test("the displays Provider waits for toggling before refreshing", () => {
    const provider = source("quickshell/.config/quickshell/launcher/modules/Displays.qml");

    assert.match(provider, /after: "stay"/);
    assert.match(provider, /readonly property Process toggler: Process/);
    assert.match(provider, /onExited: exitCode =>[\s\S]*root\.refresh\(\)/);
});
