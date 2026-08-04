// The workspaces Provider's pure half: naming, describing and matching
// Hyprland workspaces, and the argv the rename Action runs.
//
// Ticket 16. The Provider exists for one checkbox -- "Renaming a workspace is
// an Action on a workspace Entry, needing no external text prompt" -- and the
// things that used to be a script (bin/df-hypr-rename-workspace, deleted) are
// split out here exactly as the windows Provider's are in lib/windows.js:
// the parts that decide what a row says and what a key press runs are pure
// functions, under test, and the QML is the wiring around them.
//
// Renaming is the one part of this Provider that reaches the compositor, and
// the old script's dispatch shape is what is kept: the Lua form
// (`hl.dsp.workspace.rename(...)`), which is the only form this machine's
// Hyprland accepts -- ticket 01 established that this config runs Hyprland's
// Lua layer, where hyprctl evaluates a bare dispatcher argument as Lua and a
// legacy `renameworkspace` string is a syntax error. The script kept a legacy
// fallback for conf-mode machines; this config does not run on one, so the
// fallback is deliberately not carried over. The script interpolated the new
// name into the Lua expression unescaped; a `"` in a name broke the dispatch
// silently, which is exactly the class of bug this seam exists to catch, so
// renameLuaArgv escapes it.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/workspaces.test.js) -- the same arrangement as matching.js.

// What a workspace's row is called. The name is the whole name -- "3", "3-(dev)",
// "special:note" -- which is what the bar shows and what a person types.
function nameFor(workspace) {
    return (workspace && workspace.name) || "(unnamed workspace)";
}

// How many windows, read defensively. The bar's own empty-check reads
// `toplevels.values.length` (dotfiles/modules/Workspaces.qml) -- that is the
// property shape proven on the host -- so that is what this reads first,
// through a shape check rather than an Array.isArray one, since the model's
// `values` is a QML sequence rather than a JS Array (the trap Windows.qml
// documents). `windows` remains as a fallback for the same field under a
// different name.
function windowCountOf(workspace) {
    if (workspace && workspace.toplevels && workspace.toplevels.values
            && typeof workspace.toplevels.values.length === "number")
        return workspace.toplevels.values.length;
    return workspace && typeof workspace.windows === "number" ? workspace.windows : 0;
}

// The sub-line: how many windows, and whether it is the one in front of you.
// The count is not decoration -- it is what distinguishes an empty workspace
// from the one with everything on it, which is the difference between "switch
// there" and "this is where you are". `active` is structural for the same
// reason the windows Provider's subtext names the workspace.
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

// Every text a workspace can be found by.
//
// The name first -- the rule stated in lib/catalog.js's keylessCatalog, which
// is what builds this Provider's catalog -- then the plain id ("3" from a
// workspace named "3-(dev)") -- renaming changes the name and must not make
// the workspace unfindable, and the id is the one text the rename Action
// itself can rely on. A special workspace's id is negative and meaningless to
// type, so it is dropped when the name already names the workspace
// ("special:note").
function textsFor(item, entry) {
    var texts = [entry.name];
    var plain = String(item ? item.id : "");
    if (plain !== "" && plain !== entry.name && !(item.id < 0))
        texts.push(plain);
    return texts;
}

// One workspace, as the shape Workspaces.qml's catalog wants: the display
// Entry, with the parallel `texts`/`owners` arrays keylessCatalog builds for
// an Entry findable by more than one text -- the same arrangement the windows
// Provider uses.
//
// No Entry Key, and the reason is the same as the windows Provider's: a
// workspace id is not guaranteed to survive a restart (Hyprland reassigns ids
// as workspaces come and go), and an Entry Key that does not survive a restart
// is worse than none -- it would accumulate Frecency against the wrong
// workspace the day the ids shuffle. This Provider ranks on match score alone.
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

// The old script's prompt text, kept for the rename prompt's placeholder --
// "Rename workspace 3 (3-(dev))" is what the text-prompt tool used to say,
// and the Launcher's own Query field says it now.
function promptText(id, name) {
    return "Rename workspace " + id + " (" + name + ")";
}

// Whether a workspace is special -- the same predicate the bar's own
// Workspaces.qml uses. Special workspaces are left out of this Provider
// entirely: renaming one would produce "id-(name)" out of a negative id,
// which is not a valid special name, and the footer advertises the rename
// Action on every row of the Provider that owns it -- a Provider cannot say
// "not on this row", so a row that cannot take the Action has to not be a row.
function isSpecial(name) {
    return name === "special" || (typeof name === "string" && name.startsWith("special:"));
}

// The plain name a workspace row prefills the rename prompt with: "dev" from
// "3-(dev)", "" from an unchanged "3" -- the two shapes the script itself
// could produce. A name neither shape matches -- renamed by some other tool
// into something else -- prefills as itself, so the prompt edits what is
// actually there rather than assuming the convention.
function plainNameOf(name, id) {
    var plain = String(id);
    if (name === plain)
        return "";
    var prefix = plain + "-(";
    if (typeof name === "string" && name.startsWith(prefix) && name.endsWith(")"))
        return name.slice(prefix.length, -1);
    return typeof name === "string" ? name : "";
}

// The Lua dispatch as a single argv element -- one element because the whole
// expression is one argument to `hyprctl dispatch`, exactly as the script
// passed it. A `"` in the name is escaped so a name cannot break the Lua out
// of the string it belongs in.
//
// The backslash is escaped *first*, and the order is the whole correctness of
// this function: escaping the quote first would then have the backslash pass
// rewrite the `\` it just wrote, doubling it. Escaping only the quote -- what
// this did before -- left a name ending in `\` producing `name = "a\"`, where
// Lua reads the closing quote as escaped and the string runs on into the rest
// of the expression: the same break the quote escape exists to prevent,
// reached by the other character.
function renameLuaArgv(id, name) {
    var escaped = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return ["hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "' + id + '", name = "' + escaped + '" })'];
}

// The notification the script sent after a rename, kept for parity.
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
