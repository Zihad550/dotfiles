// The Core Action vocabulary: which key does which kind of thing, in every
// Provider.
//
// The shell declares the slots -- primary, secondary, back -- and a Provider
// fills the ones it has something to put in. That is the whole point: a
// Provider does not get to invent a key binding, so the key that launches an
// application is the key that switches to a window is the key that will copy a
// screenshot, and muscle memory transfers as Providers are added.
//
// Pure and separate for the same reason matching.js and highlight.js are, and
// with a sharper edge here: a chord that resolves to nothing and a chord that
// resolves to an Action which does nothing are indistinguishable from outside
// the process. Neither shows an error, neither logs, and both look like the
// Launcher ignoring you. So the mapping is a table and a lookup, under test,
// rather than a switch buried in a key handler.
//
// The vocabulary is walker's -- the launcher this one replaced (deleted in
// ticket 19) -- which is what muscle memory is trained on: Return, shift
// Return, Escape, and an `after` of Close / AsyncReload / Nothing. The
// outcomes are spelled close / refresh / stay here, because "AsyncReload"
// names walker's implementation rather than what it does.
//
// Loads under both QML and node -- see the note at the top of matching.js. Only
// top-level function declarations are reliably reachable from QML, so the slot
// table is core() rather than a constant.

// Qt key codes. Named here rather than read off `Qt`, which does not exist
// under the JavaScript runtime the tests run in. These are Qt's public enum
// values and have been stable across every Qt 5 and 6 release.
var KEY_ESCAPE = 0x01000000;
var KEY_TAB = 0x01000001;
var KEY_RETURN = 0x01000004;
var KEY_ENTER = 0x01000005;   // The numpad's. A different key, the same chord.
var KEY_A = 0x41;
var KEY_Z = 0x5a;

var MOD_SHIFT = 0x02000000;
var MOD_CONTROL = 0x04000000;
var MOD_ALT = 0x08000000;

// The slots, declared once, here. `after` is what the slot means when a
// Provider does not say otherwise, and it differs per slot on purpose: going
// back is a move *within* the Launcher, so it cannot default to closing the
// thing it moves within. Ticket 12's directories Provider is the first to
// notice.
//
// `mark`, added by ticket 13, defaults to `stay` for the same reason `back`
// does: toggling a mark is a move within the Provider's own selection, not a
// choice of the Entry, and a Provider that filled it with no override must not
// have the Launcher close under it. CONTEXT.md's own order for the four Core
// Actions -- primary, secondary, mark, back -- is why it sits here rather than
// at the end: the footer renders in this order, and mark reads as "one more
// thing this Entry can do" ahead of "leave", not after it.
//
// Unlike primary/secondary/back, a Provider fills `mark` with its own toggle
// rather than the shell supplying one: the shell has nowhere to keep "which
// Entries are marked" that would not leak between Providers, so the state and
// the toggle both live on the Provider that owns the Entries -- Screenshots.qml
// mirrors Directories.qml's own `openFor` for the same reason. `available()`
// below still governs whether it shows in the footer at all: a Provider that
// does not fill the slot advertises nothing and Tab does nothing over it,
// exactly like any other unfilled slot.
function core() {
    return [
        { slot: "primary", chord: "Return", after: "close" },
        { slot: "secondary", chord: "Shift+Return", after: "close" },
        { slot: "mark", chord: "Tab", after: "stay" },
        { slot: "back", chord: "Escape", after: "stay" }
    ];
}

// The chord a core slot is declared on, or "" for a slot that is not one.
//
// For the callers that mean a *slot* rather than a key: a pointer click means
// "the primary Action" and has no modifiers to build a chord out of, and
// routing it through the same lookup as Return is what keeps the pointer and
// the keyboard from drifting apart on what activating means.
function chordFor(name) {
    var slots = core();
    for (var i = 0; i < slots.length; i++) {
        if (slots[i].slot === name)
            return slots[i].chord;
    }
    return "";
}

// What the Launcher does once an Action has run.
//
//   close    dismiss, which is the overwhelming case -- you launched the thing
//   refresh  ask the Provider for its Entries again and stay open, for an
//            Action that changes what the list should say
//   stay     nothing; the list is still right
function outcomes() {
    return ["close", "refresh", "stay"];
}

// A chord for a key event, or "" for a key that is not one.
//
// `event` is a Qt key event -- { key, modifiers } is all that is read, so the
// tests hand it exactly that.
//
// Two keys are deliberately unreachable, and both are load-bearing:
//
// - **A letter is Query text unless Ctrl or Alt is held.** Shift is not enough,
//   because Shift is how capitals are typed -- a rule that took any modifier
//   would swallow every capital letter someone types. Without the rule at all,
//   a Provider binding `w` would swallow every w, and the failure would look
//   like a broken keyboard.
// - **Backspace is never a chord at all**, modified or not. It belongs to the
//   Query, and ticket 11 spends it on deleting back past a prefix.
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

    // A letter is what someone is typing, unless Ctrl or Alt says otherwise.
    // Shift deliberately does not count: it is how a capital is typed.
    if (name.length === 1 && !control && !alt)
        return "";

    // One order, whatever order they were pressed in, so a declared chord is a
    // string comparison rather than a set.
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
// The point of a *round trip*: a Provider writes its extra Action's chord by
// hand, and a hand-written chord that chordOf can never emit is the worst thing
// in this module -- it renders in the footer, so the key is advertised, and it
// resolves to nothing, so pressing it does nothing. That is precisely the
// indistinguishable failure the whole file exists to prevent, arrived at from
// the Provider's side. `Ctrl+w`, `Shift+Ctrl+W`, `F2` and `Ctrl+Delete` all
// look plausible and are all dead.
//
// So: the modifiers must be a subset of Ctrl, Alt, Shift in that order, and the
// key must be one chordOf names -- Return, Escape, or a capital letter carrying
// Ctrl or Alt.
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

// How a chord reads in the footer. The three core ones get their symbol;
// anything else reads as itself, which is both honest and what a Provider
// author wrote.
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

// Whether a declaration can actually be run. A slot filled with something that
// cannot be invoked counts as unfilled -- the alternative is a key that throws
// where the whole design says it should do nothing.
function isFilled(declared) {
    return !!declared && typeof declared.invoke === "function";
}

// The outcome a declaration asks for, or the slot's own default.
//
// An outcome nobody declared -- a typo, or walker's `AsyncReload` spelling
// carried over from the old launcher -- falls back to the same default as declaring nothing, rather
// than to a second hardcoded answer. That matters for `back`, whose default is
// `stay`: the alternative rule, "unknown means close", would have a typo in a
// directory Provider's declaration dismiss the Launcher instead of going up a
// level, which is a stranger failure than the typo deserves.
function outcomeOf(declared, fallback) {
    var wanted = declared.after;
    if (wanted === undefined || wanted === null || wanted === "")
        return fallback;
    if (outcomes().indexOf(wanted) >= 0)
        return wanted;

    console.warn("launcher: unknown outcome", wanted, "for", declared.label, "--", fallback, "instead");
    return fallback;
}

// What the Launcher does with an Action once it has run. Asked rather than
// compared against a string at the call site, so the outcome names are spelled
// in this file only -- a renamed outcome that two files disagree about is an
// Action that runs while the Launcher sits open on a stale list, and warns
// about nothing.
function wantsClose(action) {
    return !!action && action.after === "close";
}

function wantsRefresh(action) {
    return !!action && action.after === "refresh";
}

// Whether running this Action counts as *choosing* the Entry -- which is what
// Frecency accumulates against.
//
// Every Action except `back` and `mark`. Going back is a move within the
// Launcher rather than something done to an Entry, so counting it would teach
// the store that a sub-menu's parent is the thing you use most: every descent
// through it is a choice, and every ascent back out would be a second one.
// Marking is the same shape of problem one slot over: ticking several
// screenshots on the way to picking two of them is not "choosing" every
// screenshot touched along the way, and unmarking one right back out would
// still have counted it once already.
//
// Extras do count. An extra is outside the shared vocabulary, so nothing here
// knows what it does -- but a Provider only declares one for something worth a
// key of its own, and "you deliberately reached for this Entry" is true of every
// such key. The alternative, counting only the core slots, would leave a
// Provider whose real verb is an extra unable to learn anything at all.
//
// Asked here rather than compared against a slot name at the call site, for the
// same reason wantsClose is: the slot names are spelled in this file only.
function counts(action) {
    return !!action && action.slot !== "back" && action.slot !== "mark";
}

// Every Action a Provider actually offers, in the order the footer shows them:
// the core slots it filled, in slot order, then its extras in the order it
// declared them.
//
// Each one is { slot, chord, label, invoke, after } -- `slot` is "" for an
// extra, which is what an extra *is*: an Action outside the shared vocabulary,
// so nothing can assume it means the same thing in the next Provider.
//
// Extras are dropped rather than allowed to break the vocabulary: an extra
// claiming a core chord would silently shadow the slot it claims, which is the
// one failure this whole module exists to prevent. Dropped with a warning
// rather than thrown, because a throw inside a QML binding takes the whole
// merged list down -- the failure ticket 05 documented -- and losing every
// Entry is a worse answer to a bad key binding than ignoring it.
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

        // Dropped rather than advertised: a chord no key press can produce
        // would show in the footer and never fire. See isChord.
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

// The Action a chord reaches in this Provider, or null.
//
// null is the answer to every key nobody filled, and the shell leaves such a
// key unaccepted -- which is what makes "a Provider that leaves a slot unfilled
// does nothing on that key" and "Escape still dismisses the Launcher" the same
// rule rather than two.
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
