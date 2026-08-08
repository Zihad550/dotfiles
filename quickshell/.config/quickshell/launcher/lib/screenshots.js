// The screenshots Provider's pure half: parsing `find`'s output, the Entry
// shape, and the shell commands the primary and secondary Actions run.
//
// No runtime file for Marking: the selection is Core Action state the shell
// defines and a Provider owns (lib/actions.js), so Screenshots.qml keeps it
// in memory and it's gone the instant the Launcher closes -- see `active` there.
//
// No Entry Key: a screenshot's absolute path is stable across restarts, but
// the order here is "newest first", and Frecency has no way to express
// recency -- a key would let a screenshot copied once climb above ones taken
// since, silently reordering "newest first" into "most used first".
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/screenshots.test.js).

var HOME_SUBPATH = "/Pictures/Screenshots";
var EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function screenshotsDir(home) {
    return home + HOME_SUBPATH;
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// Every image file one level deep, -L so a symlinked Screenshots directory
// is still followed. No `sort` in this pipeline: sorting is shell work this
// module can't test, so parseListing sorts in pure JavaScript instead.
function listScript(dir) {
    var nameArgs = EXTENSIONS.map(function (ext) {
        return "-iname " + shellEscape("*." + ext);
    }).join(" -o ");

    return "find -L " + shellEscape(dir) + " -maxdepth 1 -type f \\( " + nameArgs + " \\) "
        + "-printf '%T@\\t%p\\n' 2>/dev/null";
}

// A shell one-liner, not a bare `find` argv: the extension alternation needs
// `-o`, which execDetached's argv form has no way to express.
function listCommand(home) {
    return ["sh", "-c", listScript(screenshotsDir(home))];
}

// One line -> { mtime, path }, or null. Can't actually happen from this
// exact -printf format, but costs nothing to guard against a stray blank
// trailing line.
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

// Newest first. Array.prototype.sort has been stable since ES2019 (both
// runtimes this loads under satisfy it), so two screenshots sharing an
// mtime keep `find`'s own encounter order rather than swapping on every re-scan.
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

// "YYYY-MM-DD HH:MM" in local time, read off `Date` rather than off `find`
// so ordering and display both come from one parsed number rather than two
// separately-formatted strings that could disagree.
function formatMtime(epochSeconds) {
    var d = new Date(epochSeconds * 1000);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
        + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// `marked` is the Provider's own selection object, keyed by path -- read
// back here rather than carried as truth on the item, so a mark toggling
// never has to rebuild this Entry by hand.
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

// One text per Entry (the filename), so no `owners`; no `keys` at all, see
// the header above.
function catalogOf(items, marked, provider) {
    var entries = items.map(function (item) {
        return entryFor(item, marked, provider);
    });

    return {
        entries: entries,
        texts: entries.map(function (entry) { return entry.name; })
    };
}

// Pipes the file's own bytes to the clipboard, typed by what `file` says the
// content actually is rather than by the extension, so a mis-named
// screenshot still copies as what it is. `path` travels as `$1`, never
// interpolated into the command string, so a quote or space in it can't
// break out.
function copyImageArgv(path) {
    return ["sh", "-c", 'wl-copy --type "$(file -b --mime-type "$1")" < "$1"', "_", path];
}

// Every path, newline separated, piped to the clipboard as text. Each path
// is its own element of `"$@"`, so nothing here builds a command string a
// path's own content could interfere with.
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
