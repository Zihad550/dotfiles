// How a window is named, found and described. This is where the Provider's
// promise actually lives -- that typing the name of something already
// running offers the window rather than a second copy -- decided entirely by
// which strings a window is matched against. A wrong answer here looks like
// a preference, not a fault.
//
// Free of QML types, no `.pragma library` -- see the top of matching.js.

// A window with no title yet is still worth offering under its application id.
function nameFor(title, appId) {
    if (title)
        return title;
    if (appId)
        return appId;
    return "(untitled window)";
}

// The last segment of a reverse-DNS application id -- "firefox" from
// "org.mozilla.firefox". Empty when there's nothing to shorten.
function shortIdOf(appId) {
    if (!appId)
        return "";
    var at = appId.lastIndexOf(".");
    if (at < 0 || at === appId.length - 1)
        return "";
    return appId.slice(at + 1);
}

// Separate corpus texts, never concatenated: score() penalises a long
// haystack, so folding the application id into the title would leave the
// window below the application that shares its name.
//
// Name first (keylessCatalog's rule), then the application id, then the
// short id -- the text that delivers the promise: typing "firefox" scores
// the window the same as the application, and pool order (windows before
// applications) puts the running window on top.
function textsFor(item, entry) {
    var texts = [entry.name];

    if (item.appId && item.appId !== entry.name)
        texts.push(item.appId);

    var short = shortIdOf(item.appId);
    if (short && short !== item.appId && short !== entry.name)
        texts.push(short);

    return texts;
}

// Hyprland's "special"/"special:<name>" already read as themselves; a
// numbered workspace needs the word "workspace" to mean anything.
function whereFor(workspace) {
    if (!workspace)
        return "";
    if (workspace === "special" || workspace.indexOf("special:") === 0)
        return workspace;
    return "workspace " + workspace;
}

// The workspace half isn't decoration -- it's what says the window you're
// about to switch to is on a special workspace, not the one in front of you.
function subtextFor(appId, workspace) {
    var parts = [];
    if (appId)
        parts.push(appId);

    var where = whereFor(workspace);
    if (where)
        parts.push(where);

    return parts.join(" · ");
}

// `item` is `{ title, appId, workspace, target }` as the compositor reported it.
//
// No `key`: an Entry Key has to survive a restart and a window address
// doesn't, so this Provider ranks on match score alone -- keylessCatalog
// keeps the corpus keyless to match.
function entryFor(item, provider) {
    var name = nameFor(item.title, item.appId);

    return {
        name: name,
        subtext: subtextFor(item.appId, item.workspace),
        icon: item.appId,
        provider: provider,
        target: item.target
    };
}

// Inert under QML. See the tail of matching.js.
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        nameFor: nameFor,
        shortIdOf: shortIdOf,
        textsFor: textsFor,
        whereFor: whereFor,
        subtextFor: subtextFor,
        entryFor: entryFor
    };
}
