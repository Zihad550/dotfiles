// Tests for the keybindings Provider's pure half: turning `hyprctl binds -j`
// output into searchable Entries without needing a compositor.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");

const K = require("../../quickshell/.config/quickshell/launcher/lib/keybindings.js");
const SAMPLE = JSON.parse(fs.readFileSync(
    "tests/launcher/fixtures/keybindings-binds.json", "utf8"));

test("the live listing command asks Hyprland for JSON binds", () => {
    assert.deepStrictEqual(K.listCommand(), ["hyprctl", "binds", "-j"]);
});

test("entries decode modifiers, preserve the description, and show the combo", () => {
    const entries = K.entriesFor(SAMPLE, "provider");
    const pseudo = entries.find(entry => entry.name === "Pseudo window");

    assert.strictEqual(pseudo.subtext, "SUPER+ALT+SHIFT+P");
    assert.strictEqual(pseudo.key, pseudo.subtext);
    assert.strictEqual(pseudo.icon, K.ICON);
    assert.strictEqual(pseudo.provider, "provider");
});

test("physical key codes get readable workspace and resize keys", () => {
    const entries = K.entriesFor(SAMPLE, null);

    assert.strictEqual(entries.find(entry => entry.name === "Switch to workspace 1").subtext,
        "SUPER+SHIFT+1");
    assert.strictEqual(entries.find(entry => entry.name === "Expand window left").subtext,
        "SUPER+SHIFT+-");
    assert.strictEqual(entries.find(entry => entry.name === "Expand window down").subtext,
        "SUPER+SHIFT+=");
});

test("duplicate descriptions remain distinct because the combo is the Entry Key", () => {
    const entries = K.entriesFor(SAMPLE, null).filter(entry => entry.name === "Full width");

    assert.deepStrictEqual(entries.map(entry => entry.key), ["SUPER+D", "SUPER+S"]);
});

test("entries with no description are excluded and the base order is modmask then key", () => {
    const entries = K.entriesFor(SAMPLE, null);

    assert.strictEqual(entries.some(entry => entry.name === ""), false);
    assert.deepStrictEqual(entries.map(entry => entry.subtext), [
        "CTRL+F",
        "SUPER+D",
        "SUPER+S",
        "SUPER+W",
        "SUPER+SHIFT+-",
        "SUPER+SHIFT+=",
        "SUPER+SHIFT+1",
        "SUPER+ALT+SHIFT+P"
    ]);
});

test("the catalog searches both descriptions and combos while keeping stable keys", () => {
    const catalog = K.catalogOf(SAMPLE, null);

    assert.deepStrictEqual(catalog.texts.slice(0, 2), ["Toggle floating", "CTRL+F"]);
    assert.deepStrictEqual(catalog.keys.slice(0, 2), ["CTRL+F", "CTRL+F"]);
    assert.deepStrictEqual(catalog.owners.slice(0, 2), [0, 0]);
});

test("clipboard and source actions keep user data out of shell syntax", () => {
    assert.deepStrictEqual(K.copyArgv("SUPER+W"), [
        "sh", "-c", 'printf "%s" "$1" | wl-copy', "sh", "SUPER+W"
    ]);
    assert.deepStrictEqual(K.findSourceCommand("Full width", "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings"), [
        "sh", "-c", 'grep -n -m 1 -F -- "$1" "$2"/*.lua', "sh",
        "Full width", "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings"
    ]);
});

test("a grep result becomes a Zed file-and-line argument", () => {
    assert.deepStrictEqual(K.sourceMatchOf(
        "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings/tiling.lua:14:o.bind(\"SUPER + SHIFT + F\", \"Full width\")\n"
    ), {
        path: "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings/tiling.lua",
        line: 14
    });
    assert.deepStrictEqual(K.openArgv({
        path: "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings/tiling.lua",
        line: 14
    }), ["zeditor", "/home/jehad/dotfiles/hypr/.config/hypr/lua/bindings/tiling.lua:14"]);
});
