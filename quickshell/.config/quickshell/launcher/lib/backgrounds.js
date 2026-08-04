// The backgrounds Provider's pure half: scanning ~/.config/backgrounds, the
// display shape, and the argv the primary Action runs.
//
// Ported from elephant/.config/elephant/menus/dotfiles_backgrounds.lua (that
// config and bin/df-theme-bg-picker, the walker menu it opened, are deleted
// with ticket 19) rather than invented. Its FormatName and its
// Actions["menus:default"] (df-theme-bg-set) both carry over unchanged. This
// Provider is that picker's replacement, not an addition alongside it.
//
// **No "active" marker, unlike lib/themes.js.** A background is a loose file
// under ~/.config/backgrounds, not one directory per theme with a symlink
// naming the chosen one -- df-theme-bg-set retargets
// ~/.config/theme/background to whichever path was picked, but nothing about
// this list is keyed by that path the way a theme's own directory name is,
// and the ticket's checkboxes ask only that a background be listed and set.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/backgrounds.test.js) -- the same arrangement as
// matching.js.

var EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function backgroundsDir(home) {
    return home + "/.config/backgrounds";
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// Every image file one level deep, sorted -- the same `find` dotfiles_
// backgrounds.lua runs.
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

// The extension-stripped filename -- "sunset" from "sunset.jpg".
function stemOf(filename) {
    var at = filename.lastIndexOf(".");
    return at < 0 ? filename : filename.slice(0, at);
}

// "Rose Pine Sunset" from "rose-pine-sunset" -- dotfiles_backgrounds.lua's
// own FormatName (deleted with ticket 19), ported rather than reinvented so a
// background renders here exactly as df-theme-bg-picker showed it.
function formatName(stem) {
    return stem.replace(/-/g, " ").replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// The script's whole stdout -> every path found, blank lines dropped. No
// re-sort, the same as lib/clipboard.js's own parseListing: `sort` already
// ran inside listScript.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];
    return text.split("\n").filter(function (line) { return line !== ""; });
}

// One background, as the shape Backgrounds.qml's catalog wants. `key` is the
// absolute path -- stable across restarts, and setting a background is a
// genuine recurring choice, so this Provider carries an Entry Key the same
// way lib/directories.js's own paths do.
//
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

// The formatted display name and the stem, deduplicated -- the same two-text
// shape lib/themes.js's textsFor uses, and for the same reason:
// "rose-pine-sunset" and "Rose Pine Sunset" are both things a person might
// type. Display name first, so it is the text EXACT_WEIGHT is measured
// against -- see the identical note on lib/themes.js's own textsFor.
function textsFor(path) {
    var stem = stemOf(filenameOf(path));
    var formatted = formatName(stem);
    // Case-insensitive comparison -- see the identical note on
    // lib/themes.js's own textsFor.
    return formatted.toLowerCase() !== stem.toLowerCase() ? [formatted, stem] : [stem];
}

// The primary Action's argv: df-theme-bg-set, invoked by absolute path -- see
// the header on lib/themes.js's own applyArgv for why the bare name is the
// wrong call from a launcher.
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
