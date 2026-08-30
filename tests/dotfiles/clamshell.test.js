// The clamshell path is a small shell integration around Hyprland's monitor
// and workspace IPC. These assertions pin the ordering that matters when a
// lid event races the compositor's monitor teardown.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("lid switch bindings invoke the clamshell reconciler in both directions", () => {
    const bindings = source("hypr/.config/hypr/lua/bindings/system.lua");

    assert.match(bindings,
        /o\.bind\("switch:on:Lid Switch",\s*"Lid close",\s*dotfiles_bin \.\. "\/df-hypr-clamshell",\s*\{ locked = true \}\)/);
    assert.match(bindings,
        /o\.bind\("switch:off:Lid Switch",\s*"Lid open",\s*dotfiles_bin \.\. "\/df-hypr-clamshell",\s*\{ locked = true \}\)/);
});

test("clamshell migration moves internal workspaces before disabling eDP-1", () => {
    const helper = source("bin/df-hypr-clamshell");
    const move = helper.indexOf("moveworkspacetomonitor");
    const disable = helper.indexOf("disabled = true");

    assert.notStrictEqual(move, -1, "the clamshell path must move workspaces explicitly");
    assert.notStrictEqual(disable, -1, "the clamshell path must disable the internal output");
    assert.ok(move < disable,
        "moving workspaces after disabling eDP-1 races the monitor removal");
    assert.match(helper, /hyprctl monitors all -j/);
    assert.match(helper, /hyprctl workspaces -j/);
});

test("opening the lid restores the saved display layout", () => {
    const helper = source("bin/df-hypr-clamshell");

    assert.match(helper, /DISPLAY_LAYOUT.*apply --quiet/,
        "the open path must restore the configured monitor geometry");
    assert.match(helper, /lid_is_closed/,
        "the helper must distinguish the lid-open event from a close event");
    assert.match(helper, /restore_workspaces/,
        "the open path must restore workspaces moved during clamshell mode");
});
