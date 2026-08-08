// The Core Action vocabulary: which key does which kind of thing, in every
// Provider. The shell declares the slots (primary, secondary, mark, back)
// and a Provider fills the ones it has something to put in -- a Provider
// never invents its own key binding, so Return that launches an application
// is the same Return that switches to a window, and muscle memory transfers.
//
// A chord that resolves to nothing and a chord that resolves to an Action
// that does nothing are both indistinguishable from outside the process --
// neither errors, neither logs, both look like the Launcher ignoring you.
// So the mapping is a table and a lookup, under test, not a switch buried in
// a key handler.
//
// Outcomes are spelled close / refresh / stay (not walker's Close /
// AsyncReload / Nothing) because "AsyncReload" names an implementation, not
// a behavior.
//
// Loads under both QML and node -- see the note at the top of matching.js.
// Only top-level function declarations are reliably reachable from QML, so
// the slot table is core() rather than a constant.

// Qt key codes, named here rather than read off `Qt`, which doesn't exist
// under the JS runtime the tests run in. Stable across Qt 5 and 6.
var KEY_ESCAPE = 0x01000000;
var KEY_TAB = 0x01000001;
var KEY_RETURN = 0x01000004;
var KEY_ENTER = 0x01000005;   // The numpad's. A different key, the same chord.
var KEY_A = 0x41;
var KEY_Z = 0x5a;

var MOD_SHIFT = 0x02000000;
var MOD_CONTROL = 0x04000000;
var MOD_ALT = 0x08000000;

// `after` is the slot's default when a Provider doesn't say otherwise, and
// differs per slot on purpose: going back is a move *within* the Launcher,
// so it can't default to closing the thing it moves within -- `mark`
// defaults to `stay` for the same reason (toggling a mark is a move within
// the Provider's own selection, not a choice of the Entry).
//
// Unlike primary/secondary/back, a Provider fills `mark` with its own toggle
// rather than the shell supplying one: the shell has nowhere to keep "which
// Entries are marked" that wouldn't leak between Providers, so the state and
// toggle both live on the Provider that owns the Entries.
function core() {
    return [
        { slot: "primary", chord: "Return", after: "close" },
        { slot: "secondary", chord: "Shift+Return", after: "close" },
        { slot: "mark", chord: "Tab", after: "stay" },
        { slot: "back", chord: "Escape", after: "stay" }
    ];
}

// For callers that mean a *slot* rather than a key: a pointer click means
// "the primary Action" with no modifiers to build a chord from, so routing
// it through this same lookup keeps pointer and keyboard from drifting
// apart on what activating means.
function chordFor(name) {
    var slots = core();
    for (var i = 0; i < slots.length; i++) {
        if (slots[i].slot === name)
            return slots[i].chord;
    }
    return "";
}

// close: dismiss (the overwhelming case). refresh: ask the Provider for its
// Entries again and stay open. stay: nothing, the list is still right.
function outcomes() {
    return ["close", "refresh", "stay"];
}

// `event` is a Qt key event -- only { key, modifiers } is read.
//
// Two keys are deliberately unreachable, both load-bearing:
// - A letter is Query text unless Ctrl or Alt is held. Shift alone doesn't
//   count, since Shift is how capitals are typed -- a rule catching any
//   modifier would swallow every capital someone types.
// - Backspace is never a chord, modified or not: it belongs to the Query,
//   including deleting back past a prefix.
function chordOf(event) {
    if (!event)
        return "";

    var key = event.key;
    var modifiers = event.modifiers || 0;

    var name = "";
    if (key === KEY_RETURN || key === KEY_ENTER)
        name = "Return";
    else if (key === KEY_ESCAPE)
        name = "Escape";
    else if (key === KEY_TAB)
        name = "Tab";
    else if (key >= KEY_A && key <= KEY_Z)
        name = String.fromCharCode(key);

    if (name === "")
        return "";

    var control = (modifiers & MOD_CONTROL) !== 0;
    var alt = (modifiers & MOD_ALT) !== 0;
    var shift = (modifiers & MOD_SHIFT) !== 0;

    if (name.length === 1 && !control && !alt)
        return "";

    // One fixed order, whatever order the keys were pressed in, so a
    // declared chord is a string comparison rather than a set.
    var chord = "";
    if (control)
        chord += "Ctrl+";
    if (alt)
        chord += "Alt+";
    if (shift)
        chord += "Shift+";
    return chord + name;
}

// Whether a string is a chord this Launcher can ever produce.
//
// A Provider writes an extra Action's chord by hand, and a hand-written
// chord chordOf can never emit is the worst failure this file guards
// against: it renders in the footer (the key is advertised) and resolves to
// nothing (pressing it does nothing). `Ctrl+w`, `Shift+Ctrl+W`, `F2` and
// `Ctrl+Delete` all look plausible and are all dead.
function isChord(chord) {
    if (typeof chord !== "string" || chord === "")
        return false;

    var parts = chord.split("+");
    var name = parts.pop();

    var order = ["Ctrl", "Alt", "Shift"];
    var at = 0;
    for (var i = 0; i < parts.length; i++) {
        while (at < order.length && order[at] !== parts[i])
            at++;
        if (at >= order.length)
            return false;
        at++;
    }

    if (name === "Return" || name === "Escape" || name === "Tab")
        return true;

    if (/^[A-Z]$/.test(name))
        return parts.indexOf("Ctrl") >= 0 || parts.indexOf("Alt") >= 0;

    return false;
}

// The three core chords get their symbol; anything else reads as itself.
function hintOf(chord) {
    if (chord === "Return")
        return "⏎";
    if (chord === "Shift+Return")
        return "⇧⏎";
    if (chord === "Escape")
        return "esc";
    if (chord === "Tab")
        return "tab";
    return chord;
}

// A slot filled with something that can't be invoked counts as unfilled --
// better than a key that throws where the design says it should do nothing.
function isFilled(declared) {
    return !!declared && typeof declared.invoke === "function";
}

// An unrecognised outcome (a typo, or a walker spelling like `AsyncReload`
// carried over by mistake) falls back to the slot's own default rather than
// a second hardcoded answer -- important for `back`, whose default is
// `stay`: "unknown means close" would have a typo dismiss the Launcher
// instead of going up a level.
function outcomeOf(declared, fallback) {
    var wanted = declared.after;
    if (wanted === undefined || wanted === null || wanted === "")
        return fallback;
    if (outcomes().indexOf(wanted) >= 0)
        return wanted;

    console.warn("launcher: unknown outcome", wanted, "for", declared.label, "--", fallback, "instead");
    return fallback;
}

// Asked rather than compared against a string at the call site, so outcome
// names are spelled in this file only.
function wantsClose(action) {
    return !!action && action.after === "close";
}

function wantsRefresh(action) {
    return !!action && action.after === "refresh";
}

// Whether running this Action counts as *choosing* the Entry, which is what
// Frecency accumulates against.
//
// Every Action except `back` and `mark`. Going back is a move within the
// Launcher, not something done to an Entry -- counting it would teach the
// store that a sub-menu's parent is what you use most (every descent is a
// choice, every ascent a second one). Marking has the same shape: ticking
// several screenshots on the way to picking two isn't "choosing" every one
// touched, and unmarking one right back out would still have counted it once.
//
// Extras do count: nothing here knows what an extra does, but a Provider
// only declares one for something worth its own key, so "you deliberately
// reached for this Entry" holds.
function counts(action) {
    return !!action && action.slot !== "back" && action.slot !== "mark";
}

// Every Action a Provider actually offers, in footer order: filled core
// slots in slot order, then extras in declared order.
//
// Each is { slot, chord, label, invoke, after } -- `slot` is "" for an
// extra, since an extra is by definition outside the shared vocabulary.
//
// Extras are dropped, not allowed to break the vocabulary: one claiming a
// core chord would silently shadow the slot it claims. Dropped with a
// warning rather than thrown, since a throw inside a QML binding takes the
// whole merged list down -- losing every Entry is worse than ignoring a bad
// key binding.
function available(provider) {
    var declarations = provider && provider.actions ? provider.actions : null;
    if (!declarations)
        return [];

    var slots = core();
    var out = [];
    var claimed = {};

    for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        var declared = declarations[slot.slot];
        if (!isFilled(declared))
            continue;

        claimed[slot.chord] = true;
        out.push({
            slot: slot.slot,
            chord: slot.chord,
            label: declared.label || slot.slot,
            invoke: declared.invoke,
            after: outcomeOf(declared, slot.after)
        });
    }

    var extras = declarations.extras;
    if (!extras || typeof extras.length !== "number")
        return out;

    for (var j = 0; j < extras.length; j++) {
        var extra = extras[j];
        if (!extra || !extra.chord || !isFilled(extra)) {
            console.warn("launcher:", provider.label, "declared an extra Action with no chord or no way to invoke it -- ignored");
            continue;
        }

        // A chord no key press can produce would show in the footer and
        // never fire -- dropped rather than advertised.
        if (!isChord(extra.chord)) {
            console.warn("launcher:", provider.label, "declared an extra Action on", extra.chord,
                "-- not a chord any key press produces, ignored");
            continue;
        }

        if (claimed[extra.chord]) {
            console.warn("launcher:", provider.label, "declared an extra Action on", extra.chord,
                "-- already taken, ignored");
            continue;
        }

        claimed[extra.chord] = true;
        out.push({
            slot: "",
            chord: extra.chord,
            label: extra.label || extra.chord,
            invoke: extra.invoke,
            after: outcomeOf(extra, "close")
        });
    }

    return out;
}

// null is the answer to every key nobody filled, and the shell leaves such a
// key unaccepted -- which is what makes "an unfilled slot does nothing" and
// "Escape still dismisses the Launcher" the same rule rather than two.
function resolve(provider, chord) {
    if (!chord)
        return null;

    var actions = available(provider);
    for (var i = 0; i < actions.length; i++) {
        if (actions[i].chord === chord)
            return actions[i];
    }
    return null;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        core: core,
        chordFor: chordFor,
        outcomes: outcomes,
        chordOf: chordOf,
        isChord: isChord,
        hintOf: hintOf,
        wantsClose: wantsClose,
        wantsRefresh: wantsRefresh,
        counts: counts,
        available: available,
        resolve: resolve
    };
}
