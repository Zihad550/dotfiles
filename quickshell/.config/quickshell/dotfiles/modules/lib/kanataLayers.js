// Layer Guide data and live layer state for KanataService. The keymap owns the
// mappings; tests/dotfiles/kanataLayers.test.js fails when this data disagrees
// with kanata/.config/kanata/keymap.kbd. See kanata/README.md.

// Keyed by Kanata layer name. A layer without an entry here is "unknown": the
// Bar must not claim to know its mappings.
var LAYERS = {
    base: { id: "base", label: "Base", short: "Base" },
    navigation: { id: "navigation", label: "Navigation", short: "Nav", activation: "Hold Space, Caps Lock or R" },
    symbols: { id: "symbols", label: "Symbols", short: "Sym", activation: "Hold I or E" }
};

var ROWS = [
    ["tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["caps", "a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
    ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
    ["spc"]
];

var NAMES = { tab: "Tab", caps: "Caps", spc: "Space" };

var BASE = {
    tab: { output: "Tab" },
    caps: { output: "Esc", hold: "Navigation", layer: "navigation" },
    spc: { output: "Space", hold: "Navigation", layer: "navigation" },
    e: { hold: "Symbols", layer: "symbols" },
    i: { hold: "Symbols", layer: "symbols" },
    a: { hold: "Super" },
    s: { hold: "Alt" },
    d: { hold: "Shift" },
    f: { hold: "Ctrl" },
    r: { hold: "Navigation", layer: "navigation" },
    b: { hold: "Bksp" },
    j: { hold: "Ctrl" },
    k: { hold: "Shift" },
    l: { hold: "Alt" },
    ";": { hold: "Super" }
};

// Keys a layer maps itself, including trigger keys it pins to plain output so
// that layers never stack.
var OUTPUTS = {
    navigation: {
        h: "←", j: "↓", k: "↑", l: "→", ";": "Enter",
        u: "Bksp", i: "PgDn", o: "PgUp", p: "PrtSc", y: "Del",
        n: "End", m: "Home", ",": "Ins",
        tab: ".", q: "[", w: "7", e: "8", r: "9", t: "]",
        caps: "-", a: ";", s: "4", d: "5", f: "6", g: "0",
        z: "`", x: "1", c: "2", v: "3", b: "\\"
    },
    symbols: {
        q: "!", w: "@", e: "#", r: "$", t: "%", y: "<", u: ">", i: "[", o: "]", p: "\\",
        caps: "Esc", a: "=", s: "+", d: "-", f: "_", g: "*", h: "(", j: ")", k: "{", l: "}", ";": "/",
        z: "`", x: "~", c: "&", v: "|", b: "^", n: "'", m: "\"", ",": ":", ".": ";", "/": "?",
        spc: "Space"
    }
};

// Hold actions on keys a layer maps itself.
var HOLDS = {
    navigation: { a: "Super", s: "Alt", d: "Shift", f: "Ctrl" }
};

function guideRows(layer) {
    var outputs = OUTPUTS[layer] || {};
    var holds = HOLDS[layer] || {};
    return ROWS.map(function (row) {
        return row.map(function (key) {
            var base = BASE[key] || {};
            var mapped = Object.prototype.hasOwnProperty.call(outputs, key);
            return {
                key: key,
                name: NAMES[key] || key.toUpperCase(),
                output: mapped ? outputs[key] : (base.output || key),
                hold: mapped ? (holds[key] || "") : (base.hold || ""),
                mapped: mapped,
                trigger: !mapped && base.layer === layer
            };
        });
    });
}

// A layer is confirmed only by a CurrentLayerName snapshot; LayerChange events
// before it may predate the snapshot and are ignored.
function initialState() {
    return disconnected(false);
}

function layerName(value) {
    return typeof value === "string" && value !== "" ? value : null;
}

// Returns null for anything that is not a JSON object: a learning aid must
// not break on a malformed line.
function parse(line) {
    var message;
    try {
        message = JSON.parse(line);
    } catch (error) {
        return null;
    }
    return message && typeof message === "object" ? message : null;
}

function receive(state, message) {
    if (!message)
        return state;
    var snapshot = message.CurrentLayerName && layerName(message.CurrentLayerName.name);
    if (snapshot)
        return { confirmed: true, layer: snapshot, stopped: false };
    var change = message.LayerChange && layerName(message.LayerChange.new);
    if (change && state.confirmed)
        return { confirmed: true, layer: change, stopped: false };
    if (message.ConfigFileReload)
        return initialState();
    return state;
}

function disconnected(stopped) {
    return { confirmed: false, layer: "", stopped: stopped };
}

function status(state) {
    if (!state.confirmed)
        return state.stopped
            ? { id: "stopped", label: "Kanata stopped", short: "Off", guided: false }
            : { id: "unavailable", label: "Layer state unavailable", short: "No state", guided: false };
    var layer = Object.prototype.hasOwnProperty.call(LAYERS, state.layer) ? LAYERS[state.layer] : null;
    if (!layer)
        return { id: "unknown", label: "Unknown layer: " + state.layer, short: "Layer?", guided: false };
    return { id: layer.id, label: layer.label, short: layer.short, guided: layer.id !== "base" };
}

if (typeof module !== "undefined") {
    module.exports = {
        LAYERS: LAYERS,
        guideRows: guideRows,
        initialState: initialState,
        receive: receive,
        parse: parse,
        disconnected: disconnected,
        status: status
    };
}
