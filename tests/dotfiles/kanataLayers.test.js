const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../..");
const Layers = require(path.join(repo, "quickshell/.config/quickshell/dotfiles/modules/lib/kanataLayers.js"));

// Kanata key and action names, translated independently of the guide model.
const taps = { left: "←", down: "↓", up: "↑", right: "→", esc: "Esc", bspc: "Bksp", ret: "Enter", del: "Del", home: "Home", ins: "Ins", prnt: "PrtSc", pgup: "PgUp", pgdn: "PgDn", end: "End", spc: "Space", tab: "Tab", grv: "`" };
// US layout: what Shift (S-) produces on each key.
const shifted = { 1: "!", 2: "@", 3: "#", 4: "$", 5: "%", 6: "^", 7: "&", 8: "*", 9: "(", 0: ")", "=": "+", "-": "_", "[": "{", "]": "}", ",": "<", ".": ">", "/": "?", ";": ":", "'": "\"", "\\": "|", grv: "~" };
const holds = { lmet: "Super", rmet: "Super", lalt: "Alt", ralt: "Alt", lsft: "Shift", rsft: "Shift", lctl: "Ctrl", rctl: "Ctrl", bspc: "Bksp" };

function forms(source) {
    const result = [];
    let depth = 0;
    let start = -1;
    for (const [index, character] of [...source.replace(/;;[^\n]*/g, "")].entries()) {
        if (character === "(" && depth++ === 0)
            start = index;
        else if (character === ")" && --depth === 0)
            result.push(source.replace(/;;[^\n]*/g, "").slice(start + 1, index));
    }
    return result;
}

function keymap() {
    const source = fs.readFileSync(path.join(repo, "kanata/.config/kanata/keymap.kbd"), "utf8");
    const parsed = { aliases: {}, layers: {} };
    for (const form of forms(source)) {
        const [head, ...rest] = form.trim().split(/\s+/);
        const body = form.trim().slice(head.length).trim();
        if (head === "defsrc")
            parsed.source = rest;
        else if (head === "deflayer")
            parsed.layers[rest[0]] = body.slice(rest[0].length).match(/\([^)]*\)|\S+/g);
        else if (head === "defalias")
            for (const [, name, action] of body.matchAll(/(\S+)\s+(\([^()]*(?:\([^()]*\)[^()]*)*\)|\S+)/g))
                parsed.aliases[name] = action;
    }
    return parsed;
}

function describe(action, aliases) {
    const resolved = action.startsWith("@") ? aliases[action.slice(1)] : action;
    const tapHold = resolved.match(/^\(tap-hold \S+ \S+ (\S+) (.+)\)$/);
    if (!tapHold)
        return { output: resolved.startsWith("S-") ? shifted[resolved.slice(2)] : taps[resolved] ?? resolved, hold: "" };
    const layer = tapHold[2].match(/^\(layer-while-held (\S+)\)$/);
    return { output: taps[tapHold[1]] ?? tapHold[1], hold: layer ? `layer:${layer[1]}` : holds[tapHold[2]] };
}

test("guide models exactly the layers the installed keymap defines", () => {
    const { layers } = keymap();
    assert.deepEqual(Object.keys(Layers.LAYERS).sort(), Object.keys(layers).sort());
});

test("every guide key agrees with the installed keymap, including transparent keys and home row mods", () => {
    const { source, aliases, layers } = keymap();
    const label = id => Layers.LAYERS[id].label;
    for (const layer of Object.keys(layers).filter(id => id !== "base")) {
        const keys = Layers.guideRows(layer).flat();
        for (const key of keys) {
            const index = source.indexOf(key.key);
            if (index < 0) {
                assert.deepEqual([key.output, key.hold, key.trigger], [key.key, "", false], `${layer} ${key.key} passes through`);
                continue;
            }
            const own = layers[layer][index];
            const expected = describe(own === "_" ? layers.base[index] : own, aliases);
            const trigger = expected.hold === `layer:${layer}`;
            assert.equal(key.trigger, trigger, `${layer} ${key.key} trigger`);
            if (trigger)
                continue;
            assert.equal(key.output, expected.output, `${layer} ${key.key} output`);
            assert.equal(key.hold, expected.hold.startsWith("layer:") ? label(expected.hold.slice(6)) : expected.hold, `${layer} ${key.key} hold`);
            assert.equal(key.mapped, own !== "_", `${layer} ${key.key} mapped`);
        }
        for (const key of source)
            assert.ok(keys.some(item => item.key === key), `${layer} guide shows ${key}`);
    }
});

test("Space-held Navigation has arrows and editing on the right and a numpad with home row mods on the left", () => {
    const keys = Object.fromEntries(Layers.guideRows("navigation").flat().map(key => [key.key, key]));
    const row = list => list.map(key => keys[key].output).join(" ");
    assert.deepEqual(["h", "j", "k", "l"].map(key => keys[key].output), ["←", "↓", "↑", "→"]);
    assert.deepEqual(["u", ";", "i", "o", "p", "y", "n", "m", ","].map(key => keys[key].output),
        ["Bksp", "Enter", "PgDn", "PgUp", "PrtSc", "Del", "End", "Home", "Ins"]);
    assert.equal(row(["tab", "q", "w", "e", "r", "t"]), ". [ 7 8 9 ]");
    assert.equal(row(["caps", "a", "s", "d", "f", "g"]), "- ; 4 5 6 0");
    assert.deepEqual(["a", "s", "d", "f"].map(key => keys[key].hold), ["Super", "Alt", "Shift", "Ctrl"],
        "Space then a held numpad key still gives its home row modifier");
    assert.equal(keys.g.hold, "");
    assert.equal(row(["z", "x", "c", "v", "b"]), "` 1 2 3 \\");
    assert.ok(keys.spc.trigger);
    assert.equal(Layers.LAYERS.navigation.activation, "Hold Space, Caps Lock or R");
});

test("Space-first + I stays Page Down and Space-first + E is 8, never Symbols", () => {
    const keys = Object.fromEntries(Layers.guideRows("navigation").flat().map(key => [key.key, key]));
    assert.deepEqual([keys.i.output, keys.e.output, keys.e.hold], ["PgDn", "8", ""]);
});

test("U is a plain letter: only Space, Caps Lock, R, I and E open layers", () => {
    assert.deepEqual(Object.keys(Layers.LAYERS).sort(), ["base", "navigation", "symbols"]);
    const keys = Object.fromEntries(Layers.guideRows("symbols").flat().map(key => [key.key, key]));
    assert.equal(keys.u.output, ">");
});

test("holding I or E opens the same Symbols layer with the custom page's positions", () => {
    const keys = Object.fromEntries(Layers.guideRows("symbols").flat().map(key => [key.key, key]));
    const row = list => list.map(key => keys[key].output).join(" ");
    assert.equal(row(["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"]), "! @ # $ % < > [ ] \\");
    assert.equal(row(["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"]), "= + - _ * ( ) { } /");
    assert.equal(row(["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"]), "` ~ & | ^ ' \" : ; ?");
    assert.ok(!keys.i.trigger && !keys.e.trigger, "I-held + E is #, E-held + I is [");
    assert.deepEqual([keys.spc.output, keys.spc.trigger, keys.caps.output, keys.caps.hold], ["Space", false, "Esc", ""]);
    assert.equal(Layers.LAYERS.symbols.activation, "Hold I or E");
});

test("Tab keeps its Base action and is never a layer key", () => {
    const keys = Object.fromEntries(Layers.guideRows("symbols").flat().map(key => [key.key, key]));
    assert.deepEqual([keys.tab.output, keys.tab.hold], ["Tab", ""]);
});

test("Kanata serves layer state on loopback at the port the Layer helper reads", () => {
    const unit = fs.readFileSync(path.join(repo, "setup/systemd/root/kanata.service.in"), "utf8");
    const helper = fs.readFileSync(path.join(repo, "bin/df-kanata-layers"), "utf8");
    const port = helper.match(/KANATA_PORT:-(\d+)/)[1];
    assert.match(unit, new RegExp(`^ExecStart=/usr/bin/kanata -c @CONFIG@ -p 127\\.0\\.0\\.1:${port}$`, "m"));
    assert.doesNotMatch(fs.readFileSync(path.join(repo, "kanata/.config/kanata/keymap.kbd"), "utf8"), /danger-enable-cmd|\(cmd /);
});
