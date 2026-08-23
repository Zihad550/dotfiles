// Issue #98: the bar derives what it shows for a numbered workspace from the
// windows on it -- see docs/adr/0013-workspace-labels-derived-in-bar.md.
// These cover the pure half of that: which window a label describes, how its
// application and directory are rendered, and the rule that a manual rename
// always wins. The QML half (live toplevels, /proc/<pid>/cwd) is asserted by
// source below, since none of it can run without a compositor.
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
    assert.strictEqual(WorkspaceLabel.labelFor(3, "3", "firefox", ""), "3-firefox");
});

test("a resolvable path is appended in parentheses", () => {
    assert.strictEqual(
        WorkspaceLabel.labelFor(4, "4", "ghostty", "/home/jehad/dev/work/mamacrm/backend"),
        "4-ghostty(/home/jehad/dev/work/mamacrm/backend)",
    );
});

test("a path without an application is dropped rather than left dangling", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(2, "2", "", "/home/jehad"), "2");
});

test("a manual rename wins over anything derived", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(7, "7-(dev)", "kitty", "/home/jehad"), "7-(dev)");
});

test("home collapses to ~ so the label survives deep project paths", () => {
    assert.strictEqual(WorkspaceLabel.renderPath("/home/jehad/dev/dotfiles", "/home/jehad"), "~/dev/dotfiles");
    assert.strictEqual(WorkspaceLabel.renderPath("/home/jehad", "/home/jehad"), "~");
    assert.strictEqual(WorkspaceLabel.renderPath("/etc", "/home/jehad"), "/etc");
    assert.strictEqual(WorkspaceLabel.renderPath("/home/jehad2/x", "/home/jehad"), "/home/jehad2/x", "only whole segments");
    assert.strictEqual(WorkspaceLabel.renderPath("/etc", ""), "/etc");
});

test("the directory comes from one readlink of the window's process cwd", () => {
    assert.deepStrictEqual(WorkspaceLabel.cwdCommand(1234), ["readlink", "/proc/1234/cwd"]);
});

test("the bar entry derives its text instead of showing the raw name", () => {
    const ws = source("modules/Workspace.qml");

    assert.match(ws, /import "lib\/workspaceLabel\.js" as WorkspaceLabel/);
    assert.match(ws, /WorkspaceLabel\.representativeOf/);
    assert.match(ws, /text:\s*root\.label/, "display must go through the derived label");
    assert.doesNotMatch(ws, /text:\s*root\.modelData\.name/, "the compositor name is no longer shown directly");
});

test("a resolved directory cannot outlive the window it was resolved for", () => {
    const ws = source("modules/Workspace.qml");

    // The request is keyed on the representative it was made for (address
    // and pid); a readlink returning after the representative changed must
    // be dropped, or workspace 4 shows where workspace 6's terminal sits.
    assert.match(ws, /property string requestedFor/);
    assert.match(ws, /repKey: root\.repAddress \+ ":" \+/);
    assert.match(ws, /if \(root\.repKey !== cwdProc\.requestedFor\)\s*\n\s*return;/);

    // Resolving starts by forgetting whatever path stood before.
    const resolveBlock = ws.slice(ws.indexOf("function resolveCwd"));
    assert.match(resolveBlock, /^\s+root\.repPath = "";/m);

    // A readlink still exiting must not swallow the newest request: the
    // exit re-runs resolution whenever what is current differs from what
    // ran, or the label loses its path until some later focus change.
    assert.match(resolveBlock, /if \(cwdProc\.running\)\s*\n\s*return;/);
    assert.match(ws.slice(ws.indexOf("id: cwdProc")), /onExited:\s*\{[\s\S]*?repKey !== requestedFor[\s\S]*?resolveCwd/);
});
