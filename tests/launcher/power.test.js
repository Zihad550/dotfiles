// Tests for the power-action table -- the four session-ending commands the
// keybinds confirm before running.
//
//     node --test "tests/launcher/*.test.js"
//
// What is worth pinning here is not the lookup, which is four lines, but the
// *contents*: this table is the only remaining copy of commands that used to
// live in hypr/.config/hypr/lua/bindings/system.lua, and a typo in one of them
// is a keybind that asks a question and then fails silently -- the same failure
// lib/menus.js is shaped around, one file over.

const test = require("node:test");
const assert = require("node:assert");

const Power = require("../../quickshell/.config/quickshell/launcher/lib/power.js");

// The keys shell.qml's four GlobalShortcuts pass in. Written out rather than
// derived from the table, which is the entire point: this is the other end of
// the contract, and a test that read the table for both sides would pass no
// matter what the table said.
const SHORTCUT_KEYS = ["shutdown", "restart", "logout", "lock"];

test("every shortcut key resolves to an action", () => {
    SHORTCUT_KEYS.forEach(key => {
        assert.notStrictEqual(Power.actionFor(key), null,
            `shell.qml dispatches "${key}" -- an unresolved key is a keybind that does nothing`);
    });
});

test("no action is declared that no shortcut can reach", () => {
    assert.deepStrictEqual(Power.keys().sort(), SHORTCUT_KEYS.slice().sort());
});

test("an unknown key is null, not a default action", () => {
    assert.strictEqual(Power.actionFor("poweroff"), null,
        "a near-miss must not fall through to something that ends the session");
    assert.strictEqual(Power.actionFor(""), null);
    assert.strictEqual(Power.actionFor(undefined), null);
});

// The commands, exactly as the keybinds ran them before the confirmation was
// added. Changing one of these is changing what the keybind does, which is a
// separate decision from adding a confirmation to it -- so it should have to
// change a test that says so.
test("the commands are the keybinds' own", () => {
    assert.deepStrictEqual(Power.actionFor("shutdown").argv, ["shutdown", "now"]);
    assert.deepStrictEqual(Power.actionFor("restart").argv, ["shutdown", "-r", "now"]);
    assert.deepStrictEqual(Power.actionFor("lock").argv, ["hyprlock"]);
});

// The Lua dispatch form, for the reason lib/workspaces.js documents at length:
// this machine's Hyprland evaluates a bare dispatcher argument as Lua, so
// `hyprctl dispatch exit` is a syntax error rather than a logout.
test("logout dispatches Hyprland's exit in the Lua form", () => {
    assert.deepStrictEqual(Power.actionFor("logout").argv,
        ["hyprctl", "dispatch", "hl.dsp.exit()"]);
});

test("every action can be shown and run", () => {
    Power.ACTIONS.forEach(action => {
        assert.strictEqual(typeof action.label, "string");
        assert.notStrictEqual(action.label, "", `${action.key} has no label for the footer`);

        assert.strictEqual(typeof action.question, "string");
        assert.notStrictEqual(action.question, "",
            `${action.key} has no question -- the card would show an empty confirmation`);

        assert.strictEqual(Array.isArray(action.argv), true,
            `${action.key} must declare argv as an array -- execDetached takes no command line`);
        assert.notStrictEqual(action.argv.length, 0);
        action.argv.forEach(part => assert.strictEqual(typeof part, "string"));
    });
});

// The footer says "Return: shut down", lowercasing the label. A label that was
// already lowercase, or that lowercased into something wrong, would read badly
// in the one place that says what Return is about to do.
test("labels lowercase into a readable footer verb", () => {
    assert.strictEqual(Power.actionFor("shutdown").label.toLowerCase(), "shut down");
    assert.strictEqual(Power.actionFor("logout").label.toLowerCase(), "log out");
});
