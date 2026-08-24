// Issue #98: the bar derives what it shows for a numbered workspace from the
// windows on it -- see docs/adr/0013-workspace-labels-derived-in-bar.md.
// These cover which window a label describes, how its application is
// rendered, and the rule that a manual rename always wins.
//
//     node --test "tests/dotfiles/*.test.js"

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WorkspaceLabel = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/workspaceLabel.js");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

function window(overrides) {
    return Object.assign({ address: "0x1", wayland: null, lastIpcObject: {} }, overrides);
}

test("the focused window describes its workspace when it sits on it", () => {
    // Matched by address, not object identity: the compositor's active
    // toplevel and the workspace's list entry need not be the same object.
    const focused = window({ address: "0x2" });
    const others = [window(), { address: "0x2", wayland: null, lastIpcObject: {} }, window()];
    assert.strictEqual(WorkspaceLabel.representativeOf(others, focused), others[1]);
});

test("a background workspace is described by its most recently focused window", () => {
    // focusHistoryID counts up from the front of Hyprland's focus history:
    // 0 was focused most recently. activeToplevel lives on another workspace.
    const older = window({ address: "0x3", lastIpcObject: { focusHistoryID: 4 } });
    const newer = window({ address: "0x5", lastIpcObject: { focusHistoryID: 2 } });
    const elsewhere = window({ address: "0x9" });
    assert.strictEqual(WorkspaceLabel.representativeOf([older, newer], elsewhere), newer);
});

test("without focus history the newest listed window describes the workspace", () => {
    const first = window({ address: "0x1" });
    const second = window({ address: "0x2" });
    assert.strictEqual(WorkspaceLabel.representativeOf([first, second], null), second);
});

test("an empty workspace has no representative", () => {
    assert.strictEqual(WorkspaceLabel.representativeOf([], null), null);
    assert.strictEqual(WorkspaceLabel.representativeOf(null, null), null);
});

test("the wayland application id wins over the IPC class", () => {
    const rep = window({ wayland: { appId: "org.mozilla.firefox" }, lastIpcObject: { class: "stale" } });
    assert.strictEqual(WorkspaceLabel.appIdOf(rep), "org.mozilla.firefox");
    assert.strictEqual(WorkspaceLabel.appIdOf(window({ lastIpcObject: { class: "kitty" } })), "kitty");
    assert.strictEqual(WorkspaceLabel.appIdOf(null), "");
});

test("a reverse-DNS application id is shown by its last segment", () => {
    assert.strictEqual(WorkspaceLabel.shortAppName("com.mitchellh.ghostty"), "ghostty");
    assert.strictEqual(WorkspaceLabel.shortAppName("kitty"), "kitty");
    assert.strictEqual(WorkspaceLabel.shortAppName(""), "", "nothing to shorten");
    assert.strictEqual(WorkspaceLabel.shortAppName("trailing."), "", "an empty segment names nothing");
});

test("a bare id plus application reads as id-application", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(3, "3", "firefox"), "3-firefox");
});

test("the application label is folded to lowercase", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(4, "4", "Ghostty"), "4-ghostty");
});

test("a manual rename wins over anything derived", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(7, "7-(dev)", "kitty"), "7-(dev)");
});

test("the bar entry derives its text instead of showing the raw name", () => {
    const ws = source("modules/Workspace.qml");

    assert.match(ws, /import "lib\/workspaceLabel\.js" as WorkspaceLabel/);
    assert.match(ws, /WorkspaceLabel\.representativeOf/);
    assert.match(ws, /text:\s*root\.label/, "display must go through the derived label");
    assert.doesNotMatch(ws, /text:\s*root\.modelData\.name/, "the compositor name is no longer shown directly");
});
