// How a window is named, found and described.
//
// Split out of Windows.qml for the same reason matching.js is split out of the
// Launcher: this is where the Provider's promise actually lives -- that typing
// the name of something already running offers the window rather than the
// application that would launch a second copy -- and that promise is decided by
// which strings a window is matched against. A wrong answer here looks like a
// preference, not a fault, which is the class of bug this repo puts under test.
//
// Free of QML types, and no `.pragma library` (a syntax error under node), for
// the same reasons given at the top of matching.js.

// What to show, and the first thing to match against. A window that has not
// set a title yet is still worth offering under its application id.
function nameFor(title, appId) {
    if (title)
        return title;
    if (appId)
        return appId;
    return "(untitled window)";
}

// The last segment of a reverse-DNS application id -- "firefox" from
// "org.mozilla.firefox", "Zed" from "dev.zed.Zed". Empty when there is nothing
// to shorten, which is the common case for an X11 class or a plain id.
function shortIdOf(appId) {
    if (!appId)
        return "";
    var at = appId.lastIndexOf(".");
    if (at < 0 || at === appId.length - 1)
        return "";
    return appId.slice(at + 1);
}

// Every string a window can be found by, as separate corpus texts.
//
// Separate, never concatenated: score() penalises a long haystack, so folding
// an application id into a window title would leave the window below the
// application that shares its name. Elephant scored the same two fields
// separately and kept the better
// (resources/elephant/internal/providers/windows/setup.go:207 -- that checkout
// is deleted with ticket 19).
//
// The name first -- the rule stated in lib/catalog.js's keylessCatalog, which
// is what builds this Provider's catalog -- then the application id, then the
// short id, the text that delivers the ticket's promise. Typing "firefox"
// scores the application "Firefox" at full marks and "org.mozilla.firefox"
// well below it; a "firefox" text scores the window the same as the
// application, and the pool order in Launcher.qml -- windows before
// applications -- then puts the running window on top.
function textsFor(item, entry) {
    var texts = [entry.name];

    if (item.appId && item.appId !== entry.name)
        texts.push(item.appId);

    var short = shortIdOf(item.appId);
    if (short && short !== item.appId && short !== entry.name)
        texts.push(short);

    return texts;
}

// Where a window is, in words. Hyprland names special workspaces "special" and
// "special:<name>", which read as themselves; a numbered workspace needs the
// word to mean anything. Empty when the compositor did not say.
function whereFor(workspace) {
    if (!workspace)
        return "";
    if (workspace === "special" || workspace.indexOf("special:") === 0)
        return workspace;
    return "workspace " + workspace;
}

// The sub-line: which application, and where. The workspace half is not
// decoration -- it is what tells you the window you are about to switch to is
// on a special workspace rather than the one in front of you.
function subtextFor(appId, workspace) {
    var parts = [];
    if (appId)
        parts.push(appId);

    var where = whereFor(workspace);
    if (where)
        parts.push(where);

    return parts.join(" · ");
}

// One window, as the shape Windows.qml's catalog wants. `item` is what the
// compositor reported about it -- `{ title, appId, workspace, target }` -- in
// the order the compositor reported them.
//
// The provider argument is the QML Provider, carried on the Entry so the
// window can dispatch an Action without knowing which Provider it came from;
// nothing here reads anything off it.
//
// No `key`, deliberately: an Entry Key has to survive a restart and a window
// address does not, so this Provider accumulates no Frecency and ranks on
// match score alone. The shell reads whatever the Entry carries and treats a
// missing key as nothing to record, so the absence is the whole opt-out --
// there is no flag to set, and keylessCatalog (lib/catalog.js) is what keeps
// the corpus keyless to match.
//
// `name` is the first corpus text, which is what makes it the Entry's name --
// the rule stated in lib/catalog.js. An icon-*theme* name is carried too,
// resolved by the Launcher window rather than here, exactly as an
// application's is. Reverse-DNS ids are usually installed under their own
// name; when the lookup misses, the Entry keeps a blank icon slot and nothing
// else changes.
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
