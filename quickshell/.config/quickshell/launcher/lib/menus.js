// The static menus' pure half: turning a declared menu entry into a command,
// a corpus and an Entry, and refusing the declarations that can't become one.
// The four menus (system, media, display, other) are QML data files
// (modules/SystemMenu.qml and friends), so adding an entry is editing one
// file; this module is the rules about what a declaration means, where the
// failures live.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/menus.test.js).
//
// A declared entry is:
//   name      what the list shows. Required.
//   keywords  other things it can be found by. Optional.
//   icon      an icon-*theme* name, resolved by the window. Optional.
//   command   argv, as an array. Run directly, no shell.
//   shell     a command line, run through `sh -c`. For entries that
//             genuinely need expansion.
//   scoped    whether to run under the launch prefix. Default true.
//
// Exactly one of `command`/`shell`, not a single field that guesses: a
// `command` array element with spaces and quotes arrives intact, with no
// quoting rules to get wrong, so it's the default; `shell` exists only for
// entries that genuinely need expansion.

// The one shell construct `command` still handles: a leading `~`, only when
// it's the whole part or before a `/` (same rule Applications.qml applies to
// a desktop entry's Exec line). Not applied to `shell` -- the shell already
// does it, and doing it twice would rewrite a `~` that was deliberately quoted.
function expandHome(part, home) {
    if (!home)
        return part;
    if (part === "~")
        return home;
    if (part.indexOf("~/") === 0)
        return home + part.slice(1);
    return part;
}

// What's wrong with a declaration's *command*, or "" if it's fine. Separate
// from problemWith below: an entry with no name is unofferable but its
// command may still be well-formed, and the two failures want different messages.
function commandProblem(entry) {
    if (!entry || typeof entry !== "object")
        return "is not a declaration";

    var hasCommand = entry.command !== undefined && entry.command !== null;
    var hasShell = entry.shell !== undefined && entry.shell !== null;

    if (hasCommand && hasShell)
        return "declares both command and shell -- it must be one or the other";
    if (!hasCommand && !hasShell)
        return "declares neither command nor shell";

    if (hasShell) {
        if (typeof entry.shell !== "string" || entry.shell === "")
            return "declares an empty shell command";
        return "";
    }

    if (typeof entry.command === "string")
        return "declares command as a string -- it must be an array, one element per argument";
    if (typeof entry.command.length !== "number" || entry.command.length === 0)
        return "declares an empty command";
    for (var i = 0; i < entry.command.length; i++) {
        if (typeof entry.command[i] !== "string")
            return "declares a command holding something that is not a string";
    }

    return "";
}

// What's wrong with a declaration, or "" if it's fine. Every case here is a
// declaration that would otherwise render as an ordinary row and do nothing
// when its key is pressed -- indistinguishable from the Launcher ignoring you.
//
// `command` as a string is rejected rather than split on spaces: splitting
// is the weak branch Applications.qml keeps for desktop entries it doesn't
// author, and three of the four menus carry an argument with spaces that
// splitting would tear apart.
function problemWith(entry) {
    if (!entry || typeof entry !== "object")
        return "is not a declaration";

    if (typeof entry.name !== "string" || entry.name === "")
        return "has no name";

    var problem = commandProblem(entry);
    if (problem !== "")
        return problem;

    if (entry.keywords !== undefined && entry.keywords !== null) {
        if (typeof entry.keywords === "string" || typeof entry.keywords.length !== "number")
            return "declares keywords that are not an array";
    }

    if (entry.icon !== undefined && entry.icon !== null && typeof entry.icon !== "string")
        return "declares an icon that is not a name";

    return "";
}

// `scoped` is per entry, not per Provider: an application wants the launch
// prefix (it outlives the Launcher), but `uwsm stop` tearing down the
// session under a scope belonging to that same session would mean asking
// systemd to kill the process doing the asking. One-shot commands gain
// nothing from scoping either, so they skip the fork/exec/D-Bus cost.
//
// Returns [] for a declaration commandProblem rejects, so a caller that
// skips the check can't run a fragment of one.
function argvOf(entry, home, prefix) {
    if (commandProblem(entry) !== "")
        return [];

    var argv;
    if (entry.shell)
        argv = ["sh", "-c", entry.shell];
    else
        argv = entry.command.map(function (part) {
            return expandHome(part, home);
        });

    var scoped = entry.scoped !== false;
    if (!scoped || !prefix || prefix.length === 0)
        return argv;

    return prefix.concat(argv);
}

// menu-plus-text, not the index: inserting an entry above another would
// otherwise hand that other one's accumulated Frecency to its new neighbour.
// Renaming an entry loses its history, which is correct -- it's a different thing now.
function keyOf(menuName, entryName) {
    return "menu:" + menuName + ":" + entryName;
}

// A menu's catalog, in the shape Launcher.qml merges.
//
// Kept in this module rather than built by lib/catalog.js's ownedCatalog:
// this validates every declaration and drops the bad ones, collecting
// `problems` for the caller to log rather than throwing (a throw in a
// catalog binding takes the whole merged Entry list down, applications included).
//
// `menu` is { name, subtext, icon, entries }. `provider` is carried on each
// Entry so the window can dispatch without knowing which Provider it came from.
//
// Returns { entries, texts, keys, owners, problems }:
//   entries   display shape, argv already built, so a malformed declaration
//             is caught at config load rather than on Return
//   texts     one per searchable text -- an entry is findable by keywords too
//   keys      the Entry Key per text, so Frecency reaches an Entry found by a keyword
//   owners    which Entry each text belongs to, for collapse()
//   problems  every rejected declaration
function catalogOf(menu, provider, home, prefix) {
    var built = { entries: [], texts: [], keys: [], owners: [], problems: [] };
    if (!menu || !menu.entries || typeof menu.entries.length !== "number")
        return built;

    var menuName = menu.name || "menu";
    var subtext = menu.subtext || menuName;

    // The menu's own icon, which an entry declaring none falls back to.
    var menuIcon = menu.icon || "";

    for (var i = 0; i < menu.entries.length; i++) {
        var declared = menu.entries[i];

        var problem = problemWith(declared);
        if (problem !== "") {
            var named = declared && declared.name ? '"' + declared.name + '"' : "#" + (i + 1);
            built.problems.push(menuName + " menu: entry " + named + " " + problem);
            continue;
        }

        var key = keyOf(menuName, declared.name);
        var index = built.entries.length;

        built.entries.push({
            name: declared.name,

            // Which menu it came from -- these four merge into one ranked
            // list alongside applications and windows, so "Restart" without
            // this says nothing about what it restarts.
            subtext: subtext,
            icon: declared.icon || menuIcon,
            key: key,
            provider: provider,
            target: { argv: argvOf(declared, home, prefix) }
        });

        var texts = [declared.name];
        if (declared.keywords) {
            for (var k = 0; k < declared.keywords.length; k++) {
                if (typeof declared.keywords[k] === "string" && declared.keywords[k] !== "")
                    texts.push(declared.keywords[k]);
            }
        }

        for (var t = 0; t < texts.length; t++) {
            built.texts.push(texts[t]);
            built.keys.push(key);
            built.owners.push(index);
        }
    }

    return built;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        expandHome: expandHome,
        commandProblem: commandProblem,
        problemWith: problemWith,
        argvOf: argvOf,
        keyOf: keyOf,
        catalogOf: catalogOf
    };
}
