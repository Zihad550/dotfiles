// The static menus' pure half: turning a declared menu entry into a command, a
// corpus and an Entry, and refusing the declarations that cannot become one.
//
// The four menus -- system, media, display, other -- are hand-maintained lists
// that used to live in elephant's TOML (deleted with ticket 19). They are QML
// data files now
// (modules/SystemMenu.qml and friends), so adding an entry is editing one file
// and Quickshell reloading it, and a typo is a config-load error rather than a
// key that does nothing. This file is the part of that which is not QML: the
// rules about what a declaration means, which are where the failures live.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run (tests/launcher/menus.test.js)
// -- the same arrangement as matching.js, and for the same reason. See the note
// at the top of that file about `.pragma library` and top-level functions.
//
// **A declared entry is:**
//
//   name      what the list shows. Required.
//   keywords  other things it can be found by. Optional.
//   icon      an icon-*theme* name, resolved by the window. Optional.
//   command   argv, as an array. Run directly, no shell.
//   shell     a command line, run through `sh -c`. For the entries that
//             genuinely need expansion.
//   scoped    whether to run it under the launch prefix. Default true.
//
// Exactly one of `command` and `shell`, which is the whole reason they are two
// fields rather than one that guesses. Elephant ran every entry through
// `sh -c`, so the menus contain both kinds mixed together and nothing marks
// which is which; the port had to decide per entry (see the audit in the tests)
// and this is where that decision is written down. A `command` is the default
// because it needs no quoting rules: an argument with spaces and quotes in it
// is one array element and arrives intact.

// The one shell construct `command` still handles, because it is not really a
// shell construct: a leading `~`. Four of the entries carry one, nothing
// expands it any more, and the failure is a script that is simply not found.
//
// Only leading, and only as the whole part or before a `/` -- the same rule
// Applications.qml applies to a desktop entry's Exec line, for the same reason.
// Not applied to `shell` at all: the shell does it, and doing it twice would
// rewrite a `~` that was deliberately quoted.
function expandHome(part, home) {
    if (!home)
        return part;
    if (part === "~")
        return home;
    if (part.indexOf("~/") === 0)
        return home + part.slice(1);
    return part;
}

// What is wrong with a declaration's *command*, or "" for one that is fine.
//
// Separate from problemWith below because argvOf answers a narrower question
// than the catalog does: an entry with no name is unofferable but its command
// is still well formed, and the two failures want different messages.
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

// What is wrong with a declaration, or "" for one that is fine.
//
// Every case here is a declaration that would otherwise render as a perfectly
// ordinary row and do nothing when its key was pressed -- which is the failure
// this whole module is shaped around, and which is indistinguishable from the
// Launcher ignoring you.
//
// `command` as a string is rejected rather than split on spaces. Splitting is
// the weak branch Applications.qml has to keep for desktop entries it does not
// author; nothing forces it here, and three of the four menus carry an argument
// with spaces inside it that splitting would tear into pieces.
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

// The argv an entry runs as, launch prefix included.
//
// `scoped` is per entry rather than per Provider, and the two entries it exists
// for say why. An application wants the prefix for exactly the reasons
// Applications.qml lists -- it outlives the Launcher, and a restart during this
// rewrite does not take it down. `uwsm stop` is the opposite: it tears down the
// session that the scope it would run in belongs to, so scoping it means asking
// systemd to kill the process doing the asking. The one-shot commands --
// systemctl, the display scripts -- gain nothing from a scope either, so they
// skip the fork, the exec and the D-Bus round trip that the prefix costs.
//
// Returns [] for a declaration commandProblem rejects, so a caller that skips
// the check cannot end up running a fragment of one.
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

// The Entry Key: the menu and the entry's own text.
//
// The spec's own answer for what identity a menu Entry has -- "menu-plus-text"
// -- and the reason it is not the index is that an entry inserted above another
// would hand that other one's accumulated Frecency to its new neighbour.
// Renaming an entry loses its history, which is correct: it is a different
// thing now.
function keyOf(menuName, entryName) {
    return "menu:" + menuName + ":" + entryName;
}

// A menu's catalog, in the shape Launcher.qml merges.
//
// Kept in this module rather than built by lib/catalog.js's ownedCatalog, the
// way themes and directories are: this Provider validates every declaration
// and drops the bad ones, collecting `problems` for the caller to log, and a
// throw -- or a row that silently does nothing -- is exactly the failure mode
// this file is shaped around. ownedCatalog builds unconditionally, so the
// validation would have to move into the QML, and the corpus-order rule this
// loop honours (the name first, then the keywords -- see the header on
// lib/catalog.js's keylessCatalog, where the rule is stated once) is asserted
// in tests/launcher/menus.test.js the same way every other Provider's is.
//
// `menu` is { name, subtext, icon, entries }. `provider` is the QML Provider, carried
// on each Entry so the window can dispatch an Action without knowing which
// Provider an Entry came from; nothing here reads anything off it.
//
// Returns { entries, texts, keys, owners, problems }:
//
//   entries   the display shape, with the argv already built -- so a malformed
//             declaration is caught when the config loads rather than when
//             somebody presses Return on it
//   texts     one per searchable text, which is more than one per Entry: an
//             entry is findable by its keywords as well as by its name, exactly
//             as it was in elephant
//   keys      the Entry Key per text, so Frecency reaches an Entry found by a
//             keyword the same as one found by its name
//   owners    which Entry each text belongs to, for collapse()
//   problems  every rejected declaration, for the caller to log. Collected
//             rather than thrown: a throw in a catalog binding takes the whole
//             merged Entry list down, applications included.
function catalogOf(menu, provider, home, prefix) {
    var built = { entries: [], texts: [], keys: [], owners: [], problems: [] };
    if (!menu || !menu.entries || typeof menu.entries.length !== "number")
        return built;

    var menuName = menu.name || "menu";
    var subtext = menu.subtext || menuName;

    // The menu's own icon, which an entry declaring none falls back to.
    //
    // Not a nicety: elephant did the same (itemToEntry is handed the menu's
    // icon and only overrides it for an entry with one of its own,
    // resources/elephant/internal/providers/menus/setup.go:369-372 -- that
    // checkout is deleted with ticket 19), and the
    // other menu declares no entry icons at all. Without this, porting it
    // faithfully gives five rows with a blank slot where an icon used to be.
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

            // Which menu it came from. These four merge into one ranked list
            // alongside applications and windows, so "Restart" without it is a
            // row with no indication of what it restarts.
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
