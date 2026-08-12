const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");

const Keybindings = require("../../quickshell/.config/quickshell/launcher/lib/keybindings.js");
const SAMPLE = JSON.parse(fs.readFileSync(
    "tests/launcher/fixtures/keybindings-binds.json", "utf8"));
const TILING = fs.readFileSync(
    "hypr/.config/hypr/lua/bindings/tiling.lua", "utf8");
const RESIZE_SUBMAP = TILING.match(
    /hl\.define_submap\("resize", function\(\)\n([\s\S]*?)\nend\)/
)[1];

test("resize submap declarations retain descriptions", () => {
    const descriptions = [
        ["l", "Resize right"],
        ["h", "Resize left"],
        ["k", "Resize up"],
        ["j", "Resize down"],
        ["escape", "Exit resize mode"],
        ["catchall", "Exit resize mode"]
    ];

    for (const [key, description] of descriptions) {
        assert.match(RESIZE_SUBMAP, new RegExp(
            `o\\.bind\\("${key}",\\s+"${description}"`
        ));
    }
});

test("the live listing command asks Hyprland for JSON binds", () => {
    assert.deepStrictEqual(Keybindings.listCommand(), ["hyprctl", "binds", "-j"]);
});

test("entries decode modifier combinations, preserve descriptions, and show combos", () => {
    const entries = Keybindings.entriesFor(SAMPLE, "provider");
    const pseudo = entries.find(entry => entry.name === "Pseudo window");
    const control = entries.find(entry => entry.name === "Control combo");
    const controlShift = entries.find(entry => entry.name === "Control shift combo");

    assert.strictEqual(pseudo.subtext, "SUPER+ALT+SHIFT+P");
    assert.strictEqual(control.subtext, "SUPER+CTRL+C");
    assert.strictEqual(controlShift.subtext, "SUPER+CTRL+SHIFT+V");
    assert.strictEqual(pseudo.key, pseudo.subtext);
    assert.strictEqual(pseudo.icon, Keybindings.ICON);
    assert.strictEqual(pseudo.provider, "provider");
});

test("physical key codes get readable workspace and resize keys", () => {
    const entries = Keybindings.entriesFor(SAMPLE, null);

    assert.strictEqual(entries.find(entry => entry.name === "Switch to workspace 1").subtext,
        "SUPER+1");
    assert.strictEqual(entries.find(entry => entry.name === "Expand window left").subtext,
        "SUPER+-");
    assert.strictEqual(entries.find(entry => entry.name === "Expand window down").subtext,
        "SUPER+SHIFT+=");
});

test("all physical-code binds resolve to their real keys", () => {
    const physical = SAMPLE.filter(bind => bind.key === ""
        && bind.keycode >= 10 && bind.keycode <= 21);
    const entries = Keybindings.entriesFor(physical, null);

    assert.strictEqual(entries.length, 24);
    for (let workspace = 1; workspace <= 10; workspace += 1) {
        const key = workspace === 10 ? "0" : String(workspace);
        assert.strictEqual(entries.find(entry =>
            entry.name === `Switch to workspace ${workspace}`).target.key,
        key);
        assert.strictEqual(entries.find(entry =>
            entry.name === `Move window to workspace ${workspace}`).target.key,
        key);
    }

    assert.deepStrictEqual(
        entries.filter(entry => entry.target.key === "-" || entry.target.key === "=")
            .map(entry => [entry.name, entry.target.key]),
        [
            ["Expand window left", "-"],
            ["Shrink window left", "="],
            ["Shrink window up", "-"],
            ["Expand window down", "="]
        ]
    );
    assert.strictEqual(entries.every(entry => !entry.subtext.endsWith("+")), true);
});

test("unfamiliar physical key codes remain visible", () => {
    const entry = Keybindings.entriesFor(SAMPLE, null)
        .find(entry => entry.name === "Custom physical bind");

    assert.strictEqual(entry.subtext, "SUPER+code:42");
});

test("resize submap binds become searchable entries", () => {
    const entries = Keybindings.entriesFor(SAMPLE, null)
        .filter(entry => entry.name === "Resize right"
            || entry.name === "Resize left"
            || entry.name === "Resize up"
            || entry.name === "Resize down"
            || entry.name === "Exit resize mode");

    assert.deepStrictEqual(entries.map(entry => entry.name), [
        "Exit resize mode",
        "Exit resize mode",
        "Resize left",
        "Resize down",
        "Resize up",
        "Resize right"
    ]);
});

test("duplicate descriptions remain distinct because the combo is the Entry Key", () => {
    const entries = Keybindings.entriesFor(SAMPLE, null).filter(entry => entry.name === "Full width");

    assert.deepStrictEqual(entries.map(entry => entry.key), ["SUPER+D", "SUPER+S"]);
});

test("nameless entries remain visible and the base order is modmask then key", () => {
    const entries = Keybindings.entriesFor(SAMPLE, null).filter(entry =>
        !entry.name.startsWith("Resize")
        && entry.name !== "Exit resize mode"
        && entry.name !== "Custom physical bind"
        && !/workspace \d+$/.test(entry.name)
        && !["Expand window left", "Shrink window left", "Shrink window up",
            "Expand window down"].includes(entry.name));

    assert.strictEqual(entries.some(entry => entry.name === "SUPER+Q"), true);
    assert.deepStrictEqual(entries.map(entry => entry.subtext), [
        "CTRL+F",
        "SUPER+D",
        "SUPER+Q",
        "SUPER+S",
        "SUPER+W",
        "SUPER+CTRL+C",
        "SUPER+CTRL+SHIFT+V",
        "SUPER+ALT+SHIFT+P"
    ]);
});

test("the catalog searches descriptions while keeping stable keys", () => {
    const catalog = Keybindings.catalogOf(SAMPLE, null);
    const index = catalog.entries.findIndex(entry => entry.name === "Toggle floating");

    assert.strictEqual(catalog.texts[index], "Toggle floating");
    assert.strictEqual(catalog.texts.includes("CTRL+F"), false);
    assert.strictEqual(catalog.keys[index], "CTRL+F");
    assert.strictEqual(catalog.owners[index], index);
});

test("clipboard action keeps the combo as one argv value", () => {
    assert.deepStrictEqual(Keybindings.copyArgv("SUPER+W"), [
        "sh", "-c", 'printf "%s" "$1" | wl-copy', "sh", "SUPER+W"
    ]);
});
