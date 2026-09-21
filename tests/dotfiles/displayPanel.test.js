const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const source = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("SUPER+CTRL+D opens the bar-owned Display panel", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/utilities.lua");
    const shell = source("quickshell/.config/quickshell/dotfiles/shell.qml");
    const bar = source("quickshell/.config/quickshell/dotfiles/modules/Bar.qml");
    const launcherShell = source("quickshell/.config/quickshell/launcher/shell.qml");
    const launcher = source("quickshell/.config/quickshell/launcher/modules/Launcher.qml");

    assert.match(bindings,
        /SUPER \+ CTRL \+ D", "Display", hl\.dsp\.global\("display:toggle"\)/);
    assert.match(shell, /appid: "display"[\s\S]*name: "toggle"[\s\S]*DisplayPanelRegistry\.panelFor/);
    assert.match(bar, /DisplayPanel\s*\{[\s\S]*DisplayPanelRegistry\.register/);
    assert.doesNotMatch(launcherShell, /name: "displays"/);
    assert.doesNotMatch(launcher, /openDisplays|Displays\s*\{/);
});

test("the Display panel uses Omarchy's direct monitor toggle", () => {
    const panel = source("quickshell/.config/quickshell/dotfiles/modules/DisplayPanel.qml");

    assert.match(panel, /\["hyprctl", "monitors", "all", "-j"\]/);
    assert.match(panel, /hl\.monitor\(\{ output = '\$\{name\}', disabled = true \}\)/);
    assert.match(panel,
        /hl\.monitor\(\{ output = '\$\{name\}', disabled = false \}\)/);
    assert.match(panel, /\["hyprctl", "eval", chunk\]/);
    assert.match(panel, /enabledDisplayCount <= 1/);
    assert.match(panel, /Keys\.onReturnPressed: root\.activateSelected\(\)/);
    assert.match(panel, /Keys\.onEnterPressed: root\.activateSelected\(\)/);
    assert.doesNotMatch(panel, /df-hypr-close-display|hyprctl reload/);
    assert.doesNotMatch(panel, /"hyprctl", "keyword"/);
});

test("monitor hotplug does not reload the entire display configuration", () => {
    const watcher = source("bin/df-hypr-monitor-watch");

    assert.doesNotMatch(watcher, /hyprctl reload/);
    assert.match(watcher, /df-hypr-display-layout apply --quiet/);
    assert.match(watcher, /sync_external_workspaces/);
});
