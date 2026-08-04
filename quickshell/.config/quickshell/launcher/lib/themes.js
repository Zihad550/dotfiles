// The themes Provider's pure half: scanning ~/.config/themes, telling which
// theme is active, the display shape, and the argv the primary Action runs.
//
// Ported from elephant/.config/elephant/menus/dotfiles_themes.lua (that
// config and bin/df-theme-picker, the walker menu it opened, are deleted with
// ticket 19) rather than invented. Its FormatName and its
// Actions["menus:default"] (df-theme-set) both carry over unchanged. This
// Provider is that picker's replacement, not an addition alongside it.
//
// **Active detection is `readlink ~/.config/theme`, run in the same shell
// script as the scan**, not a second round trip. df-theme-set retargets that
// symlink rather than editing a file in place, so nothing here can watch it
// the way Theme.qml watches quickshell.json -- the same problem, solved there
// with an explicit IPC reload and solved here by re-running this script on
// every refresh() instead.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/themes.test.js) -- the same arrangement as matching.js.

function themesDir(home) {
    return home + "/.config/themes";
}

function themeLinkPath(home) {
    return home + "/.config/theme";
}

// Where df-theme-install drops a theme repo's own preview.png
// (bin/df-theme-install:99-107), named after the theme. The old walker menu
// read the same directory (dotfiles_themes.lua's FindPreview, deleted with
// ticket 19), so a theme that previews there previews here.
function previewsDir(home) {
    return home + "/.config/theme-previews";
}

var PREVIEW_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// One shell script: the active theme's name on the first line, behind a
// "CURRENT\t" marker so no theme active yet is still one well-formed line
// rather than a blank one indistinguishable from output that has not arrived
// -- then every theme directory that has a colors.toml, sorted. The same
// `find` dotfiles_themes.lua runs, so a colors.toml-less directory (mid-add,
// or a stray one) is silently excluded exactly as it is there.
// ...then every preview image, one directory over. Deliberately a third
// section of the *same* script rather than a find-per-theme the way
// dotfiles_themes.lua's FindPreview does it: that one pays a popen per theme,
// and one directory listing answers the question for all of them at once.
// The two sections need no marker to tell apart -- a theme line ends in
// "/colors.toml" and a preview line in an image extension -- so parseListing
// classifies by shape, the way it already had to for a line that does not
// parse at all.
function listScript(home) {
    var dir = themesDir(home);
    var link = themeLinkPath(home);
    var previews = previewsDir(home);

    var nameArgs = PREVIEW_EXTENSIONS.map(function (ext) {
        return "-iname " + shellEscape("*." + ext);
    }).join(" -o ");

    return "printf 'CURRENT\\t%s\\n' \"$(basename \"$(readlink " + shellEscape(link) + " 2>/dev/null)\" 2>/dev/null)\"; "
        + "find -L " + shellEscape(dir) + " -mindepth 2 -maxdepth 2 -name colors.toml 2>/dev/null | sort; "
        + "find -L " + shellEscape(previews) + " -maxdepth 1 -type f \\( " + nameArgs + " \\) 2>/dev/null | sort";
}

function listCommand(home) {
    return ["sh", "-c", listScript(home)];
}

// "Rose Pine" from "rose-pine" -- dotfiles_themes.lua's own FormatName
// (deleted with ticket 19),
// ported rather than reinvented so a theme renders here exactly as
// df-theme-picker showed it.
function formatName(name) {
    return name.replace(/-/g, " ").replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// One `find` line -> the theme's raw name ("rose-pine" from
// ".../themes/rose-pine/colors.toml"), or null for a line that does not
// parse.
function parseThemeLine(line) {
    var match = line.match(/\/([^/]+)\/colors\.toml$/);
    return match ? match[1] : null;
}

// One preview line -> the theme it belongs to ("rose-pine" from
// ".../theme-previews/rose-pine.png"), or null for a line that is not an
// image. The stem *is* the theme name -- df-theme-install names the file
// after the theme it copied it from -- so no separate pairing step is needed.
function parsePreviewLine(line) {
    var match = line.match(/\/([^/]+)\.([^./]+)$/);
    if (!match)
        return null;
    return PREVIEW_EXTENSIONS.indexOf(match[2].toLowerCase()) >= 0
        ? { name: match[1], path: line }
        : null;
}

// The script's whole stdout -> `{ current, names, previews }`. The first line
// is always the CURRENT marker (see listScript); every line after it is
// either a theme directory or a preview image, told apart by shape and
// dropped if it is neither -- the same way screenshots.js's own parseListing
// drops a line that does not fit.
//
// `previews` is a lookup rather than a list because that is how entryFor asks
// the question: a theme either has a preview or renders without one, and a
// theme with no preview.png in its repo is the ordinary case, not a fault.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return { current: "", names: [], previews: {} };

    var lines = text.split("\n");
    var first = lines[0] || "";
    var marker = "CURRENT\t";
    var current = first.indexOf(marker) === 0 ? first.slice(marker.length) : "";

    var names = [];
    var previews = {};

    for (var i = 1; i < lines.length; i++) {
        var name = parseThemeLine(lines[i]);
        if (name !== null) {
            names.push(name);
            continue;
        }
        var preview = parsePreviewLine(lines[i]);
        if (preview !== null)
            previews[preview.name] = preview.path;
    }

    return { current: current, names: names, previews: previews };
}

// One theme, as the shape Themes.qml's catalog wants. `key` is the theme's
// own name -- stable across restarts, and applying a theme is a genuine
// recurring choice (unlike a window's or a screenshot's Entry) -- so this
// Provider is one of the few that opts in to Frecency.
//
// `target.preview` is the absolute path of the image the preview pane shows,
// or "" for a theme whose repo shipped none. "" rather than omitted or null,
// because Launcher.qml's previewPane distinguishes exactly two states -- an
// image to show, or the "No selection" text -- and an absent value would make
// it try to load one and render neither.
function entryFor(name, current, preview, provider) {
    return {
        name: formatName(name),
        subtext: name === current ? "Active" : "Theme",
        icon: "preferences-desktop-theme",
        key: "theme:" + name,
        provider: provider,
        target: { name: name, preview: preview || "" }
    };
}

// The formatted display name and the raw slug, deduplicated -- the same
// two-text shape directories.js's textsFor uses, and for the same reason:
// "rose-pine" (what the directory is actually called) and "Rose Pine" (what
// the row displays) are both things a person might type, and scoring only
// one of them would silently miss the other.
//
// **Display name first**, because prepare() reads an Entry's first text as its
// name and only that text earns EXACT_WEIGHT (see the note on prepare()). This
// order is what makes typing "rose pine" -- the string the row actually shows,
// and entryFor's own `name` -- score as a name rather than as an alias.
function textsFor(name) {
    var formatted = formatName(name);
    // Case-insensitive comparison: matching.js lowercases every corpus text
    // (see the note there), so "kanagawa" and "Kanagawa" score identically
    // and a single-word name would otherwise gain a text that adds nothing.
    return formatted.toLowerCase() !== name.toLowerCase() ? [formatted, name] : [name];
}

// The primary Action's argv: df-theme-set, invoked by absolute path. A
// launcher's PATH does not include ~/dotfiles/bin -- df-theme-set's own
// header says so outright, and dotfiles_themes.lua already invokes it this
// way for the same reason -- so the bare name would fail silently here too.
function applyArgv(home, name) {
    return [home + "/dotfiles/bin/df-theme-set", name];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        themesDir: themesDir,
        themeLinkPath: themeLinkPath,
        previewsDir: previewsDir,
        PREVIEW_EXTENSIONS: PREVIEW_EXTENSIONS,
        listScript: listScript,
        listCommand: listCommand,
        formatName: formatName,
        parseThemeLine: parseThemeLine,
        parsePreviewLine: parsePreviewLine,
        parseListing: parseListing,
        entryFor: entryFor,
        textsFor: textsFor,
        applyArgv: applyArgv
    };
}
