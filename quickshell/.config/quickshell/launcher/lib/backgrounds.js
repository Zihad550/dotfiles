// The backgrounds Provider's pure half: scanning ~/.config/backgrounds, the
// display shape, and the argv the primary Action runs.
//
// No "active" marker, unlike lib/themes.js: a background is a loose file
// under ~/.config/backgrounds, not one directory per theme with a symlink
// naming the chosen one, so nothing about this list is keyed the way a
// theme's directory name is.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/backgrounds.test.js).

var EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function backgroundsDir(home) {
    return home + "/.config/backgrounds";
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function listScript(home) {
    var dir = backgroundsDir(home);

    var nameArgs = EXTENSIONS.map(function (ext) {
        return "-iname " + shellEscape("*." + ext);
    }).join(" -o ");

    return "find -L " + shellEscape(dir) + " -maxdepth 1 -type f \\( " + nameArgs + " \\) 2>/dev/null | sort";
}

function listCommand(home) {
    return ["sh", "-c", listScript(home)];
}

function filenameOf(path) {
    var at = path.lastIndexOf("/");
    return at < 0 ? path : path.slice(at + 1);
}

// "sunset" from "sunset.jpg".
function stemOf(filename) {
    var at = filename.lastIndexOf(".");
    return at < 0 ? filename : filename.slice(0, at);
}

// "Rose Pine Sunset" from "rose-pine-sunset".
function formatName(stem) {
    return stem.replace(/-/g, " ").replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// No re-sort: `sort` already ran inside listScript.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];
    return text.split("\n").filter(function (line) { return line !== ""; });
}

// `key` is the absolute path: stable across restarts, and setting a
// background is a genuine recurring choice, so this Provider carries an
// Entry Key.
function entryFor(path, provider) {
    var filename = filenameOf(path);

    return {
        name: formatName(stemOf(filename)),
        subtext: filename,
        icon: "preferences-desktop-wallpaper",
        key: "background:" + path,
        provider: provider,
        target: { path: path }
    };
}

// Formatted display name and stem, deduplicated -- both are things a person
// might type. Display name first, since it's the text EXACT_WEIGHT is
// measured against.
function textsFor(path) {
    var stem = stemOf(filenameOf(path));
    var formatted = formatName(stem);
    return formatted.toLowerCase() !== stem.toLowerCase() ? [formatted, stem] : [stem];
}

// Absolute path: a launcher's PATH doesn't include ~/dotfiles/bin.
function applyArgv(home, path) {
    return [home + "/dotfiles/bin/df-theme-bg-set", path];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        EXTENSIONS: EXTENSIONS,
        backgroundsDir: backgroundsDir,
        listScript: listScript,
        listCommand: listCommand,
        filenameOf: filenameOf,
        stemOf: stemOf,
        formatName: formatName,
        parseListing: parseListing,
        entryFor: entryFor,
        textsFor: textsFor,
        applyArgv: applyArgv
    };
}
