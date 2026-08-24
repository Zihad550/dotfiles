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

// Deliberately near-duplicated from launcher/lib/windows.js:shortIdOf, like
// windowNaming.js -- but it keeps a bare id ("kitty") rather than dropping
// it, so the two cannot share one body.
function shortAppName(appId) {
    if (!appId)
        return "";

    if (appId.indexOf("chrome-") === 0) {
        const hostEnd = appId.indexOf("__", 7);
        if (hostEnd > 7) {
            const hostParts = appId.slice(7, hostEnd).split(".");
            if (hostParts[0] === "www")
                hostParts.shift();
            return hostParts[0] ?? "";
        }
    }

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
function labelFor(id, name, app) {
    if (typeof name === "string" && name !== "" && name !== String(id))
        return name;
    if (!app)
        return String(id);
    return id + "-" + app.toLowerCase();
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        representativeOf: representativeOf,
        appIdOf: appIdOf,
        shortAppName: shortAppName,
        labelFor: labelFor
    };
}
