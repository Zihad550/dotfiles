// The workspaces Provider's pure half: naming, describing and matching
// Hyprland workspaces, and the argv the rename Action runs. Exists for one
// job: renaming a workspace as an Action on its Entry, with no external text
// prompt.
//
// Renaming is the one part that reaches the compositor, dispatched in Lua
// form (`hl.dsp.workspace.rename(...)`) -- the only form this machine's
// Hyprland accepts, since its Lua config layer evaluates a bare dispatcher
// argument as Lua.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/workspaces.test.js).

// The name is the whole name -- "3", "3-(dev)", "special:note".
function nameFor(workspace) {
    return (workspace && workspace.name) || "(unnamed workspace)";
}

// Read defensively: `toplevels.values.length` first (the shape proven
// working elsewhere in this shell, since `values` is a QML sequence, not a
// JS Array), `windows` as a fallback under a different property name.
function windowCountOf(workspace) {
    if (workspace && workspace.toplevels && workspace.toplevels.values
            && typeof workspace.toplevels.values.length === "number")
        return workspace.toplevels.values.length;
    return workspace && typeof workspace.windows === "number" ? workspace.windows : 0;
}

// The window count distinguishes an empty workspace from the one with
// everything on it -- "switch there" vs. "this is where you are".
function subtextFor(workspace) {
    var count = windowCountOf(workspace);
    var parts = [];
    if (count > 0)
        parts.push(count + (count === 1 ? " window" : " windows"));
    else
        parts.push("empty");
    if (workspace && workspace.active)
        parts.push("active");
    return parts.join(" · ");
}

// Name first (keylessCatalog's rule that the first text is the display
// name), then the plain id ("3" from "3-(dev)") so renaming doesn't make a
// workspace unfindable. A special workspace's negative id is dropped when
// the name already names it ("special:note").
function textsFor(item, entry) {
    var texts = [entry.name];
    var plain = String(item ? item.id : "");
    if (plain !== "" && plain !== entry.name && !(item.id < 0))
        texts.push(plain);
    return texts;
}

// No Entry Key: Hyprland reassigns workspace ids as workspaces come and go,
// so a key here would accumulate Frecency against the wrong workspace the
// day the ids shuffle. Ranks on match score alone.
function entryFor(item, provider) {
    var name = nameFor(item);

    return {
        name: name,
        subtext: subtextFor(item),
        icon: "video-display",
        provider: provider,
        target: item
    };
}

// "Rename workspace 3 (3-(dev))" -- the rename prompt's placeholder.
function promptText(id, name) {
    return "Rename workspace " + id + " (" + name + ")";
}

// Special workspaces are left out of this Provider entirely: renaming one
// would produce an invalid "id-(name)" from a negative id, and a Provider
// can't say "not on this row" -- a row that can't take the Action can't be a row.
function isSpecial(name) {
    return name === "special" || (typeof name === "string" && name.startsWith("special:"));
}

// The plain name a workspace prefills the rename prompt with: "dev" from
// "3-(dev)", "" from an unchanged "3". A name matching neither shape
// prefills as itself, so the prompt edits what's actually there.
function plainNameOf(name, id) {
    var plain = String(id);
    if (name === plain)
        return "";
    var prefix = plain + "-(";
    if (typeof name === "string" && name.startsWith(prefix) && name.endsWith(")"))
        return name.slice(prefix.length, -1);
    return typeof name === "string" ? name : "";
}

// One argv element: the whole Lua expression is one argument to `hyprctl
// dispatch`. Backslash escaped *before* the quote, deliberately -- escaping
// the quote first would have the backslash pass double it, and escaping only
// the quote lets a name ending in `\` produce `name = "a\"`, where Lua reads
// the closing quote as escaped and the string runs on into the rest of the
// expression -- the same break the quote escape exists to prevent.
function renameLuaArgv(id, name) {
    var escaped = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return ["hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "' + id + '", name = "' + escaped + '" })'];
}

function notifyArgv(id, oldName, newName) {
    return ["notify-send", "Workspace renamed", "Workspace " + id + ": '" + oldName + "' → '" + newName + "'"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        nameFor: nameFor,
        windowCountOf: windowCountOf,
        subtextFor: subtextFor,
        textsFor: textsFor,
        entryFor: entryFor,
        promptText: promptText,
        isSpecial: isSpecial,
        plainNameOf: plainNameOf,
        renameLuaArgv: renameLuaArgv,
        notifyArgv: notifyArgv
    };
}
