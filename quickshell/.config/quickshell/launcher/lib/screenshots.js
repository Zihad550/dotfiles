// The screenshots Provider's pure half: parsing `find`'s output, the Entry
// shape, and the shell commands the primary and secondary Actions run.
//
// Ported from bin/df-screenshot-* and elephant/.config/elephant/menus/
// dotfiles_screenshots.lua (all deleted with ticket 19), with one deliberate
// change beyond the port: there is no runtime file. Walker had no concept of
// Marking, so selecting several
// screenshots to act on together needed a selection to live somewhere outside
// any process's ownership -- df-screenshot-mark wrote it to
// $XDG_RUNTIME_DIR/df-screenshot-marks, and the docs/launcher-spec.md problem
// statement opens with the bug that produced: marks leaking into the next
// session because nothing knew when one ended. Marking is now Core Action
// state the shell defines and a Provider owns (lib/actions.js), so
// Screenshots.qml keeps the selection in memory and it is gone the instant
// the Launcher closes -- see `active` there, the same mechanism
// Directories.qml's `openFor` already proved.
//
// **No Entry Key.** A screenshot's absolute path is stable across restarts --
// CONTEXT.md's own condition for supplying one -- but the spec's checkbox is
// "newest first", and Frecency has no way to express recency: a key would let
// a screenshot copied once climb above ones taken since, silently reordering
// "newest first" into "most used first" the moment anything is copied twice.
// Same reasoning as the windows Provider's, arrived at from the opposite
// direction -- that one has no identity to give; this one has an identity and
// declines it.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/screenshots.test.js) -- the same arrangement as matching.js,
// and for the same reason.

var HOME_SUBPATH = "/Pictures/Screenshots";
var EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function screenshotsDir(home) {
    return home + HOME_SUBPATH;
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// The `find` invocation, as a shell script: every image file one level deep
// -L so a symlinked Screenshots directory is still followed, matching
// dotfiles_screenshots.lua's own -- one line per file, "<epoch>.<fraction>\t
// <path>". Deliberately no `sort` in this pipeline: sorting here would be
// shell work this module cannot test, so parseListing sorts in pure
// JavaScript instead, where it is.
function listScript(dir) {
    var nameArgs = EXTENSIONS.map(function (ext) {
        return "-iname " + shellEscape("*." + ext);
    }).join(" -o ");

    return "find -L " + shellEscape(dir) + " -maxdepth 1 -type f \\( " + nameArgs + " \\) "
        + "-printf '%T@\\t%p\\n' 2>/dev/null";
}

// The argv refresh() hands to a Process -- see the note on Directories.qml's
// own refreshCommand for why this is a shell one-liner rather than a bare
// `find` argv: the extension alternation needs `-o`, which execDetached's argv
// form has no way to express.
function listCommand(home) {
    return ["sh", "-c", listScript(screenshotsDir(home))];
}

// One line of `find -printf '%T@\t%p'` -> { mtime, path }, or null for a line
// that does not parse. Cannot happen from that exact -printf format, but
// costs nothing to guard against a stray blank line at the end of the output.
function parseLine(line) {
    var at = line.indexOf("\t");
    if (at < 0)
        return null;

    var mtime = parseFloat(line.slice(0, at));
    var path = line.slice(at + 1);
    if (!isFinite(mtime) || path === "")
        return null;

    return { mtime: mtime, path: path };
}

// Every screenshot, newest first. `Array.prototype.sort` has been stable
// since ES2019, which both runtimes this loads under satisfy (Qt 6's
// JavaScript engine, node >= 12), so two screenshots sharing an mtime keep
// `find`'s own encounter order rather than swapping on every re-scan.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];

    return text.split("\n")
        .map(parseLine)
        .filter(function (item) { return item !== null; })
        .sort(function (a, b) { return b.mtime - a.mtime; });
}

function filenameOf(path) {
    var at = path.lastIndexOf("/");
    return at < 0 ? path : path.slice(at + 1);
}

function pad(n) {
    return n < 10 ? "0" + n : String(n);
}

// "YYYY-MM-DD HH:MM" in local time -- the same fields elephant's own
// `%TY-%Tm-%Td %TH:%TM` printed (dotfiles_screenshots.lua, deleted with
// ticket 19), read off `Date`
// instead of off `find` so the ordering and the display both come from one
// parsed number rather than two separately-formatted strings that could
// disagree.
function formatMtime(epochSeconds) {
    var d = new Date(epochSeconds * 1000);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// One screenshot, as the shape Screenshots.qml's catalog wants. `marked` is
// the Provider's own selection object, keyed by path -- read back here rather
// than carried as truth on the item, so a mark toggling never has to rebuild
// this Entry by hand; the catalog binding simply re-runs when the Provider's
// selection changes.
function entryFor(item, marked, provider) {
    return {
        name: filenameOf(item.path),
        subtext: formatMtime(item.mtime),
        icon: "",
        provider: provider,
        target: {
            path: item.path,
            marked: !!(marked && marked[item.path])
        }
    };
}

// Every screenshot, as the shape Screenshots.qml's catalog wants: the display
// Entries, plus the corpus texts prepare() needs. One text per Entry (the
// filename), so no `owners`; no `keys` at all, for the reason in the header
// above.
function catalogOf(items, marked, provider) {
    var entries = items.map(function (item) {
        return entryFor(item, marked, provider);
    });

    return {
        entries: entries,
        texts: entries.map(function (entry) { return entry.name; })
    };
}

// The primary Action: pipe the file's own bytes to the Wayland clipboard,
// typed by what `file` says the content actually is rather than by the
// extension -- df-screenshot-copy's own approach, so a mis-named screenshot
// still copies as what it is. `execDetached` cannot redirect stdin, which is
// why this is a shell one-liner rather than a bare argv; `path` travels as
// `$1` inside it, never interpolated into the command string, so a path
// carrying a quote or a space cannot break out of it.
function copyImageArgv(path) {
    return ["sh", "-c", 'wl-copy --type "$(file -b --mime-type "$1")" < "$1"', "_", path];
}

// The secondary Action: every path, newline separated, piped to the
// clipboard as text -- df-screenshot-copy-paths's own shape. Built the same
// way, and for the same reason, as copyImageArgv: each path is its own
// element of `"$@"`, so nothing here builds a command string a path's own
// content could interfere with.
function copyPathsArgv(paths) {
    return ["sh", "-c", "printf '%s\\n' \"$@\" | wl-copy", "_"].concat(paths);
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        HOME_SUBPATH: HOME_SUBPATH,
        EXTENSIONS: EXTENSIONS,
        screenshotsDir: screenshotsDir,
        listScript: listScript,
        listCommand: listCommand,
        parseLine: parseLine,
        parseListing: parseListing,
        filenameOf: filenameOf,
        formatMtime: formatMtime,
        entryFor: entryFor,
        catalogOf: catalogOf,
        copyImageArgv: copyImageArgv,
        copyPathsArgv: copyPathsArgv
    };
}
