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
// `dir` arrives already reduced to a basename -- the caller owns that
// reduction, since Zed's comes from its title and Ghostty's from /proc.
function labelFor(id, name, app, dir) {
    if (typeof name === "string" && name !== "" && name !== String(id))
        return name;
    if (!app)
        return String(id);
    // Folded so both Ghostty identities read alike in the bar.
    return id + "-" + app.toLowerCase() + (dir ? "(" + dir + ")" : "");
}

// The trailing segment of a path, whatever its provenance -- local, remote,
// or a bare name already. A lone "/" names nothing.
function basenameOf(p) {
    const trimmed = String(p ?? "").replace(/\/+$/, "");
    const at = trimmed.lastIndexOf("/");
    const base = at < 0 ? trimmed : trimmed.slice(at + 1);
    return base === "/" ? "" : base;
}

// Issue #102: the two identities the desktop actually reports for these
// applications. Zed parses titles only under its exact configured id; a
// lookalike class ("zed", "Zed") must not. Ghostty answers to both its
// desktop id and the bare compatibility one this repo's scripts use.
const ZED_APP_ID = "dev.zed.Zed";
const GHOSTTY_DESKTOP_ID = "com.mitchellh.Ghostty";
const GHOSTTY_COMPAT_ID = "ghostty";

function isZed(appId) {
    return appId === ZED_APP_ID;
}

function isGhostty(appId) {
    return appId === GHOSTTY_DESKTOP_ID || appId === GHOSTTY_COMPAT_ID;
}

// The Project Root basename of a Zed window, read out of its live title:
// "{active item} — {root}", em dash, as Zed writes it. A root qualifies only
// when exactly one follows the separator; multi-root ("~/a, ~/b"), empty,
// and malformed titles yield "" so no stale or guessed root is ever shown.
function projectRootFromTitle(title) {
    const sep = " \u2014 ";
    const parts = String(title ?? "").split(sep);
    if (parts.length !== 2)
        return "";
    const entry = parts[1].trim();
    if (!entry || entry.includes(", "))
        return "";
    if (entry === "." || entry === "..")
        return "";
    return basenameOf(entry);
}

// One-shot readlink of the process cwd -- the out-of-band read the ADR
// describes, resolved on window open and focus change, and only ever for a
// Ghostty representative. Plain readlink (no -f): the symlink target already
// is the absolute cwd, and a dead pid just exits nonzero with empty output.
function cwdCommand(pid) {
    return ["readlink", "/proc/" + pid + "/cwd"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        representativeOf: representativeOf,
        appIdOf: appIdOf,
        shortAppName: shortAppName,
        labelFor: labelFor,
        basenameOf: basenameOf,
        isZed: isZed,
        isGhostty: isGhostty,
        projectRootFromTitle: projectRootFromTitle,
        cwdCommand: cwdCommand
    };
}
