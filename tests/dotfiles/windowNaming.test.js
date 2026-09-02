// Mirrors tests/launcher/windows.test.js's coverage of the same rule, against
// the dotfiles-local duplicate. See docs/adr/0005-workspace-tiled-layout-live-ipc.md
// for why this is a duplicate module rather than a shared import.
//
//     node --test "tests/dotfiles/*.test.js"

const test = require("node:test");
const assert = require("node:assert");

const { nameFor } = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/windowNaming.js");

test("a window is named by its title, and falls back to its application", () => {
    assert.strictEqual(nameFor("notes.md — Zed", "dev.zed.Zed"), "notes.md — Zed");
    assert.strictEqual(nameFor("", "dev.zed.Zed"), "dev.zed.Zed", "a window with no title yet is still offerable");
    assert.strictEqual(nameFor("", ""), "(untitled window)", "and one with neither is still selectable");
});
