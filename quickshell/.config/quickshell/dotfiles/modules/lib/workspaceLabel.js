// How the bar labels a numbered workspace after what is open on it (issue
// #98). The label is derived, never stored -- see
// docs/adr/0013-workspace-labels-derived-in-bar.md for why this lives in
// the bar rather than in a compositor rename.
//
// Free of QML types, no `.pragma library`: that's a syntax error under node.

// The window whose identity the label describes. The focused window wins
// when it sits on this workspace; on a background workspace nobody is
// focused, so Hyprland's focus history decides -- focusHistoryID counts up
// from the front of that history, 0 most recent. A window with no history
// entry yet falls out of both, so the newest listed one stands in.
function representativeOf(toplevels, activeToplevel) {
    if (!toplevels || toplevels.length === 0)
        return null;
    if (activeToplevel?.address) {
        const active = toplevels.find(t => t?.address === activeToplevel.address);
        if (active)
            return active;
    }

    let best = null;
    let bestHistory = Infinity;
    for (const toplevel of toplevels) {
        const history = toplevel?.lastIpcObject?.focusHistoryID;
        if (typeof history === "number" && history < bestHistory) {
            best = toplevel;
            bestHistory = history;
        }
    }
    return best ?? toplevels[toplevels.length - 1];
}

// The wayland id when reported, else the IPC class -- the same pair the
// workspace flyout reads.
function appIdOf(toplevel) {
    return toplevel?.wayland?.appId ?? toplevel?.lastIpcObject?.class ?? "";
}

// "firefox" from "org.mozilla.firefox". Empty when there's nothing to show.
// Deliberately near-duplicated from launcher/lib/windows.js:shortIdOf, like
// windowNaming.js -- but it keeps a bare id ("kitty") rather than dropping
// it, so the two cannot share one body.
function shortAppName(appId) {
    if (!appId)
        return "";
    const at = appId.lastIndexOf(".");
    if (at < 0)
        return appId;
    if (at === appId.length - 1)
        return "";
    return appId.slice(at + 1);
}

// `name` is Hyprland's Workspace Name: bare "3" until renamed, "3-(dev)"
// once the Launcher's rename Action has. Anything other than the bare id is
// manual and wins untouched; only a bare id gets derived over.
//
// The path is appended only when there is an application to attach it to --
// "2(/home/jehad)" names nothing.
// `path` arrives already rendered through renderPath() -- the caller owns
// the home substitution, since only it knows $HOME.
function labelFor(id, name, app, path) {
    if (typeof name === "string" && name !== "" && name !== String(id))
        return name;
    if (!app)
        return String(id);
    return id + "-" + app + (path ? "(" + path + ")" : "");
}

// $HOME collapses so a project path stays readable at bar font size.
// Anchored on the slash so "/home/jehad2" never matches home "/home/jehad".
function renderPath(path, homeDir) {
    if (!homeDir)
        return path;
    if (path === homeDir)
        return "~";
    if (path.startsWith(homeDir + "/"))
        return "~" + path.slice(homeDir.length);
    return path;
}

// One-shot readlink of the process cwd -- the out-of-band read the ADR
// describes, resolved on window open and focus change. Plain readlink (no
// -f): the symlink target already is the absolute cwd, and a dead pid just
// exits nonzero with empty output.
function cwdCommand(pid) {
    return ["readlink", "/proc/" + pid + "/cwd"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        representativeOf: representativeOf,
        appIdOf: appIdOf,
        shortAppName: shortAppName,
        labelFor: labelFor,
        renderPath: renderPath,
        cwdCommand: cwdCommand
    };
}
