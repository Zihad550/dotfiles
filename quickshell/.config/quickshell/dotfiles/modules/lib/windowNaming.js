// How a window is named, for the workspace flyout. Deliberately duplicated
// from launcher/lib/windows.js:nameFor -- see docs/adr/0005-workspace-tiled-layout-live-ipc.md.
//
// Free of QML types, no `.pragma library`: that's a syntax error under node.

// A window with no title yet is still worth naming by its application id.
function nameFor(title, appId) {
    if (title)
        return title;
    if (appId)
        return appId;
    return "(untitled window)";
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        nameFor: nameFor
    };
}
