// These assertions pin the Omarchy-shaped clamshell wiring: the internal
// output is toggled through a temporary rule and a monitor watcher provides
// recovery after compositor monitor events.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("lid bindings use the separate close and clamshell commands", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/system.lua");

    assert.match(bindings,
        /o\.bind\("switch:on:Lid Switch",\s*"Lid close",\s*dotfiles_bin \.\. "\/df-system-lid-close",\s*\{ locked = true \}\)/);
    assert.match(bindings,
        /o\.bind\("switch:off:Lid Switch",\s*"Lid open",\s*dotfiles_bin \.\. "\/df-hypr-clamshell",\s*\{ locked = true \}\)/);
});

test("clamshell disables the internal output through a temporary monitor rule", () => {
    const helper = source("bin/df-hypr-clamshell");
    const monitors = source("hypr/.config/hypr/lua/monitors.lua");

    assert.match(helper, /CLAMSHELL_FLAG/);
    assert.match(helper, /disabled = true/);
    assert.doesNotMatch(helper, /moveworkspace/,
        "workspace IDs belong to Hyprland's output evacuation, not script state");
    assert.match(helper, /df-hw-clamshell/);
    assert.match(helper, /df-hypr-monitor-external-active/);
    assert.match(monitors, /internal-monitor-clamshell\.lua/);
    assert.match(monitors, /dofile\(clamshell_flag\)/);
});

test("the monitor watcher retries clamshell reconciliation after output events", () => {
    const watcher = source("bin/df-hypr-monitor-watch");

    assert.match(watcher, /for delay in 1 3 7; do/);
    assert.match(watcher, /flock -n 9/);
    assert.match(watcher, /monitoradded/);
    assert.match(watcher, /monitorremoved/);
    assert.match(watcher, /configreloaded/);
    assert.match(watcher, /poll_clamshell_state &/);
    assert.match(watcher, /socat -U - "UNIX-CONNECT:\$SOCKET"/);
});

test("clamshell recovery is started with Hyprland", () => {
    const autostart = source("hypr/.config/hypr/lua/autostart.lua");

    assert.match(autostart, /df-hypr-monitor-watch/);
});
