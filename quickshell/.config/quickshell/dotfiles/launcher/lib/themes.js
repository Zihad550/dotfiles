// The themes Provider's pure half: listing installed and downloadable themes
// (df-theme-list), telling which theme is active, the display shape, and the
// argv the primary Action runs.
//
// Active detection is `readlink ~/.config/theme`, run in the same shell
// script as the scan, not a second round trip: df-theme-set retargets that
// symlink rather than editing a file in place, so nothing here can watch it
// the way Theme.qml watches quickshell.json -- solved here by re-running
// this script on every refresh() instead.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/themes.test.js).

// Absolute paths: a launcher's PATH doesn't include ~/dotfiles/bin.
function binPath(home, name) {
    return home + "/dotfiles/bin/" + name;
}

function themeLinkPath(home) {
    return home + "/.config/theme";
}

// Where df-theme-install drops a theme repo's own preview.png, named after the theme.
function previewsDir(home) {
    return home + "/.config/theme-previews";
}

var PREVIEW_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// One shell script: the active theme's name behind a "CURRENT\t" marker
// (so "no theme active" is still one well-formed line, not a blank one
// indistinguishable from output that hasn't arrived), then df-theme-list's
// "installed"/"available" lines, then every preview image. A theme line
// starts with its kind and a tab, a preview line is an image path, so
// parseListing classifies by shape.
function listScript(home) {
    var link = themeLinkPath(home);
    var previews = previewsDir(home);

    var nameArgs = PREVIEW_EXTENSIONS.map(function (ext) {
        return "-iname " + shellEscape("*." + ext);
    }).join(" -o ");

    return "printf 'CURRENT\\t%s\\n' \"$(basename \"$(readlink " + shellEscape(link) + " 2>/dev/null)\" 2>/dev/null)\"; "
        + shellEscape(binPath(home, "df-theme-list")) + " 2>/dev/null; "
        + "find -L " + shellEscape(previews) + " -maxdepth 1 -type f \\( " + nameArgs + " \\) 2>/dev/null | sort";
}

function listCommand(home) {
    return ["sh", "-c", listScript(home)];
}

// "Rose Pine" from "rose-pine".
function formatName(name) {
    return name.replace(/-/g, " ").replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// One df-theme-list line -> { name, installed }, or null.
function parseThemeLine(line) {
    var parts = line.split("\t");
    if (parts.length < 2 || parts[1] === "")
        return null;
    if (parts[0] === "installed")
        return { name: parts[1], installed: true };
    if (parts[0] === "available")
        return { name: parts[1], installed: false };
    return null;
}

// One preview line -> the theme it belongs to, or null if not an image. The
// stem *is* the theme name (df-theme-install names the file after it), so no
// separate pairing step is needed.
function parsePreviewLine(line) {
    var match = line.match(/\/([^/]+)\.([^./]+)$/);
    if (!match)
        return null;
    return PREVIEW_EXTENSIONS.indexOf(match[2].toLowerCase()) >= 0
        ? { name: match[1], path: line }
        : null;
}

// `{ current, names, available, previews }`: `names` are installed,
// `available` can be downloaded from the theme pack. The first line is always the CURRENT
// marker; every line after is a theme directory or a preview image, told
// apart by shape and dropped if neither.
//
// `previews` is a lookup, not a list, because that's how entryFor asks the
// question: a theme either has a preview or renders without one, and no
// preview.png is the ordinary case, not a fault.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return { current: "", names: [], available: [], previews: {} };

    var lines = text.split("\n");
    var first = lines[0] || "";
    var marker = "CURRENT\t";
    var current = first.indexOf(marker) === 0 ? first.slice(marker.length) : "";

    var names = [];
    var available = [];
    var previews = {};

    for (var i = 1; i < lines.length; i++) {
        var theme = parseThemeLine(lines[i]);
        if (theme !== null) {
            (theme.installed ? names : available).push(theme.name);
            continue;
        }
        var preview = parsePreviewLine(lines[i]);
        if (preview !== null)
            previews[preview.name] = preview.path;
    }

    return { current: current, names: names, available: available, previews: previews };
}

// `key` is the theme's own name: stable across restarts, and applying a
// theme is a genuine recurring choice, so this Provider opts in to Frecency.
//
// `target.preview` is "" rather than omitted/null for a theme with no
// preview: Launcher.qml's previewPane distinguishes exactly two states (an
// image, or "No selection"), and an absent value would try to load one and
// render neither.
//
// A theme not yet installed applies the same way: df-theme-set downloads it.
function entryFor(name, current, preview, provider, installed) {
    var subtext = "Theme";
    if (installed === false)
        subtext = "Not installed";
    else if (name === current)
        subtext = "Active";
    return {
        name: formatName(name),
        subtext: subtext,
        icon: "preferences-desktop-theme",
        key: "theme:" + name,
        provider: provider,
        target: { name: name, preview: preview || "" }
    };
}

// Formatted display name and raw slug, deduplicated -- both are things a
// person might type. Display name first, since prepare() reads an Entry's
// first text as its name and only that earns EXACT_WEIGHT -- this order is
// what makes typing "rose pine" score as the name rather than an alias.
function textsFor(name) {
    var formatted = formatName(name);
    // matching.js lowercases every corpus text, so a single-word name
    // wouldn't gain anything from a second, differently-cased copy.
    return formatted.toLowerCase() !== name.toLowerCase() ? [formatted, name] : [name];
}

function applyArgv(home, name) {
    return [binPath(home, "df-theme-set"), name];
}

// Clones the theme pack's index if missing, otherwise fetches it and
// fast-forwards installed pack themes, so the next listing sees upstream.
function fetchIndexArgv(home) {
    return [binPath(home, "df-theme-fetch"), "--sync", "--if-idle"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        binPath: binPath,
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
        applyArgv: applyArgv,
        fetchIndexArgv: fetchIndexArgv
    };
}
