// The dispatch a bar click sends to focus a workspace. HyprlandWorkspace's
// own activate() targets the workspace *name*, which for a renamed workspace
// ("3-zed(dotfi)") does not resolve to the existing one.
//
// Free of QML types so it loads under a plain JS runtime too (tests/dotfiles/workspaceFocus.test.js).

// Numbered workspaces go by id, so a rename never changes the target; special
// workspaces have no stable id and go by name.
function focusRequest(workspace) {
    var special = workspace.name === "special" || workspace.name.startsWith("special:");
    var target = special ? workspace.name : String(workspace.id);
    // Escape order matters -- see renameLuaArgv in launcher/lib/workspaces.js.
    var escaped = target.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return 'hl.dsp.focus({ workspace = "' + escaped + '" })';
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        focusRequest: focusRequest
    };
}
