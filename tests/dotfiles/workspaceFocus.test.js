// Bar clicks focus numbered workspaces by id, not by the name that
// HyprlandWorkspace.activate() uses, which breaks once a workspace is renamed.
//
//     node --test "tests/dotfiles/*.test.js"

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WorkspaceFocus = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/workspaceFocus.js");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

test("a renamed numbered workspace is focused by id", () => {
    assert.strictEqual(
        WorkspaceFocus.focusRequest({ id: 3, name: "3-zed(dotfi)" }),
        'hl.dsp.focus({ workspace = "3" })'
    );
});

test("a special workspace is focused by name", () => {
    assert.strictEqual(
        WorkspaceFocus.focusRequest({ id: -98, name: "special:development" }),
        'hl.dsp.focus({ workspace = "special:development" })'
    );
});

test("the bare special workspace is focused by name", () => {
    assert.strictEqual(
        WorkspaceFocus.focusRequest({ id: -99, name: "special" }),
        'hl.dsp.focus({ workspace = "special" })'
    );
});

test("a numbered workspace renamed to start with \"special\" is still focused by id", () => {
    assert.strictEqual(
        WorkspaceFocus.focusRequest({ id: 5, name: "specialist" }),
        'hl.dsp.focus({ workspace = "5" })'
    );
});

test("quotes and backslashes in a special name cannot break out of the Lua string", () => {
    assert.strictEqual(
        WorkspaceFocus.focusRequest({ id: -99, name: 'special:a"b\\' }),
        'hl.dsp.focus({ workspace = "special:a\\"b\\\\" })'
    );
});

// Window activation goes through the Wayland handle (`wayland.activate()`) and is fine.
test("no workspace switcher calls HyprlandWorkspace.activate()", () => {
    for (const file of ["modules/Workspace.qml", "modules/SpecialWorkspaces.qml", "launcher/modules/Workspaces.qml"]) {
        const text = fs.readFileSync(path.join(dotfilesRoot, file), "utf8");
        assert.doesNotMatch(text, /(?<!wayland)\.activate\(\)/, file);
    }
});
