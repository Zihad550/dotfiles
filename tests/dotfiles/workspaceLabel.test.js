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

test("the application label is folded to lowercase so both identities read alike", () => {
    // Ghostty reports "com.mitchellh.Ghostty" on Wayland but bare "ghostty"
    // through its compatibility identity; the bar shows one spelling.
    assert.strictEqual(WorkspaceLabel.labelFor(4, "4", "Ghostty", "backend"), "4-ghostty(backend)");
});

test("a directory suffix is appended in parentheses", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(4, "4", "ghostty", "backend"), "4-ghostty(backend)");
    assert.strictEqual(WorkspaceLabel.labelFor(5, "5", "zed", "dotfiles"), "5-zed(dotfiles)");
});

test("a suffix without an application is dropped rather than left dangling", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(2, "2", "", "backend"), "2");
});

test("a manual rename wins over anything derived", () => {
    assert.strictEqual(WorkspaceLabel.labelFor(7, "7-(dev)", "kitty", "jehad"), "7-(dev)");
});

test("only the trailing segment of a path survives into the label", () => {
    assert.strictEqual(WorkspaceLabel.basenameOf("/home/jehad/dev/work/mamacrm/backend"), "backend");
    assert.strictEqual(WorkspaceLabel.basenameOf("~/dev/dotfiles/"), "dotfiles");
    assert.strictEqual(WorkspaceLabel.basenameOf("dotfiles"), "dotfiles");
    assert.strictEqual(WorkspaceLabel.basenameOf(""), "");
    assert.strictEqual(WorkspaceLabel.basenameOf("/"), "", "the filesystem root names nothing");
});

// Issue #102: a Zed window's Project Root comes from its live window title
// -- "{active item} — {root}", the em-dash form Zed itself writes. Only one
// unambiguous root may produce a suffix; everything else falls back to the
// bare application label.

test("zed is recognized only by its exact desktop application identity", () => {
    assert.strictEqual(WorkspaceLabel.isZed("dev.zed.Zed"), true);
    assert.strictEqual(WorkspaceLabel.isZed("zed"), false, "a lookalike class must not parse titles");
    assert.strictEqual(WorkspaceLabel.isZed("Zed"), false);
    assert.strictEqual(WorkspaceLabel.isZed(""), false);
});

test("both ghostty identities are recognized", () => {
    assert.strictEqual(WorkspaceLabel.isGhostty("com.mitchellh.Ghostty"), true);
    assert.strictEqual(WorkspaceLabel.isGhostty("ghostty"), true, "bare compatibility identity");
    assert.strictEqual(WorkspaceLabel.isGhostty("com.mitchellh.Ghostty.extra"), false);
    assert.strictEqual(WorkspaceLabel.isGhostty("Ghostty"), false);
    assert.strictEqual(WorkspaceLabel.isGhostty(""), false);
    assert.strictEqual(WorkspaceLabel.isGhostty("kitty"), false);
});

test("a single-root zed title yields the root's basename", () => {
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("main.rs — ~/dev/dotfiles"), "dotfiles");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("channel.rs — app"), "app");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("lib.rs — /srv/http/site/"), "site");
});

test("remote and local single roots present the same way", () => {
    assert.strictEqual(
        WorkspaceLabel.projectRootFromTitle("index.php — srv0133:/var/www/vhost/site"),
        WorkspaceLabel.projectRootFromTitle("index.php — /var/www/vhost/site"),
        "remote provenance changes nothing about presentation",
    );
});

test("a multi-root or otherwise ambiguous title yields nothing", () => {
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("main.rs — ~/a, ~/b"), "");
});

test("an empty, untitled, or malformed zed title yields nothing", () => {
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle(""), "");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("Zed"), "", "no separator means no root");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("main.rs — "), "", "nothing after the separator");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("main.rs —   "), "", "whitespace is not a root");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("a — b — c"), "", "more than one separator is malformed");
});

test("a dotted dot-segment never becomes a root name", () => {
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("x — ."), "");
    assert.strictEqual(WorkspaceLabel.projectRootFromTitle("x — .."), "");
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

// Issue #102: directory context comes only from a truthful source -- Zed's
// live window title, Ghostty's process cwd -- and nothing else.

test("the bar consumes the representative's title reactively for zed roots", () => {
    const ws = source("modules/Workspace.qml");

    // The toplevel's own title property is a notified Quickshell property:
    // binding to it means a retitle refreshes the label with no focus
    // change and no polling.
    assert.match(ws, /property string repTitle: root\.rep\?\.title \?\? ""/);
    // Parsing happens under the exact Zed identity and feeds the label.
    assert.match(ws, /WorkspaceLabel\.isZed\(root\.repAppId\)[^\n]*WorkspaceLabel\.projectRootFromTitle\(root\.repTitle\)/);
    assert.match(ws, /labelFor\(root\.modelData\.id, root\.modelData\.name, root\.repApp, root\.repDir\)/);
});

test("process-cwd lookup runs only for a ghostty representative", () => {
    const ws = source("modules/Workspace.qml");
    const resolveBlock = ws.slice(ws.indexOf("function resolveCwd"));

    // The gate stands before anything touches cwdProc or the pid.
    assert.match(resolveBlock, /if \(!WorkspaceLabel\.isGhostty\(root\.repAppId\)\)\s*\n\s*return;/);
    const afterGate = resolveBlock.slice(resolveBlock.indexOf("isGhostty"));
    assert.ok(afterGate.indexOf("cwdProc") > -1, "resolution work must sit behind the ghostty gate");

    // And what readlink returned is reduced to a basename, not shown whole.
    assert.match(ws, /root\.repPath = WorkspaceLabel\.basenameOf\(line\.trim\(\)\);/);
});
