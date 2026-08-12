var ICON = "input-keyboard";

// Hyprland's modmask bits. The display order follows the Lua bindings' own
// spelling, rather than numeric bit order.
var MODIFIERS = [
    { bit: 64, name: "SUPER" },
    { bit: 4, name: "CTRL" },
    { bit: 8, name: "ALT" },
    { bit: 1, name: "SHIFT" }
];

// `hyprctl` leaves key empty for binds written as `code:N`. These are the
// only code binds this Provider needs to name without copying the bindings.
var RESIZE_KEYS = {
    "Expand window left": "-",
    "Shrink window left": "=",
    "Shrink window up": "-",
    "Expand window down": "="
};

function listCommand() {
    return ["hyprctl", "binds", "-j"];
}

function parseListing(text) {
    if (typeof text !== "string" || text.trim() === "")
        return [];

    try {
        var binds = JSON.parse(text);
        return Array.isArray(binds) ? binds : [];
    } catch (error) {
        return [];
    }
}

function modmaskOf(bind) {
    var modmask = Number(bind && bind.modmask);
    return isFinite(modmask) ? modmask : 0;
}

function modifiersFor(modmask) {
    return MODIFIERS.filter(function (modifier) {
        return (modmask & modifier.bit) !== 0;
    }).map(function (modifier) {
        return modifier.name;
    });
}

function codeKeyFor(description) {
    var workspace = /workspace (\d+)$/i.exec(description);
    if (workspace !== null)
        return workspace[1];

    return RESIZE_KEYS[description] || "";
}

function keyFor(bind, description) {
    var key = bind && typeof bind.key === "string" ? bind.key.trim() : "";
    if (key !== "" && !/^code:\d+$/i.test(key))
        return key;

    var readableCode = codeKeyFor(description);
    if (readableCode !== "")
        return readableCode;

    if (bind && bind.keycode !== undefined && bind.keycode !== null)
        return "code:" + String(bind.keycode);

    return key !== "" ? key : "unknown";
}

function comboFor(bind) {
    var description = bind && typeof bind.description === "string"
        ? bind.description.trim()
        : "";
    var key = keyFor(bind, description);
    if (key === "")
        return "";

    return modifiersFor(modmaskOf(bind)).concat([key]).join("+");
}

function entryFor(bind, provider) {
    var description = bind && typeof bind.description === "string"
        ? bind.description.trim()
        : "";
    var combo = comboFor(bind);
    if (combo === "")
        return null;

    // Keep an undescribed live bind visible and searchable by its combo rather
    // than silently losing an active shortcut.
    var name = description !== "" ? description : combo;

    return {
        name: name,
        subtext: combo,
        icon: ICON,
        key: combo,
        provider: provider,
        target: {
            combo: combo,
            description: description,
            key: keyFor(bind, description),
            modmask: modmaskOf(bind)
        }
    };
}

function entriesFor(binds, provider) {
    if (!Array.isArray(binds))
        return [];

    return binds.map(function (bind) {
        return entryFor(bind, provider);
    }).filter(function (entry) {
        return entry !== null;
    }).sort(function (a, b) {
        var modmask = modmaskOf(a.target) - modmaskOf(b.target);
        if (modmask !== 0)
            return modmask;

        var keyOrder = a.target.key.localeCompare(b.target.key);
        return keyOrder !== 0 ? keyOrder : a.name.localeCompare(b.name);
    });
}

// entryFor keeps only the display data, so sort metadata lives on the target
// while entriesFor is ordering the live bind list.
function catalogOf(binds, provider) {
    var entries = entriesFor(binds, provider);
    var texts = [];
    var keys = [];
    var owners = [];

    entries.forEach(function (entry, index) {
        [entry.name, entry.subtext].forEach(function (text) {
            texts.push(text);
            keys.push(entry.key);
            owners.push(index);
        });
    });

    return { entries: entries, texts: texts, keys: keys, owners: owners };
}

function copyArgv(combo) {
    return ["sh", "-c", 'printf "%s" "$1" | wl-copy', "sh", combo];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ICON: ICON,
        listCommand: listCommand,
        parseListing: parseListing,
        modmaskOf: modmaskOf,
        modifiersFor: modifiersFor,
        keyFor: keyFor,
        comboFor: comboFor,
        entryFor: entryFor,
        entriesFor: entriesFor,
        catalogOf: catalogOf,
        copyArgv: copyArgv
    };
}
