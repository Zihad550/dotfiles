// The session-ending actions the power keybinds confirm, and nothing else.
//
// Four keys -- shutdown, restart, logout, lock -- each naming a command that
// used to be the keybind itself. hypr/.config/hypr/lua/bindings/system.lua now
// dispatches into the Launcher instead, which asks before running any of
// these; see Launcher.qml's `confirming` and shell.qml's four GlobalShortcuts.
//
// **The commands are the keybinds' own, not SystemMenu.qml's.** The two lists
// overlap and disagree: the menu shuts down with `systemctl poweroff` and logs
// out with `uwsm stop`, while the keybinds used `shutdown now` and Hyprland's
// own exit dispatcher. Confirming a keybind must run what the keybind ran --
// changing the command while adding a confirmation would smuggle a second
// change in under the first, and `uwsm stop` and `hl.dsp.exit()` do not end a
// session the same way. The menu is left alone.
//
// The Hyprland dispatch is the Lua form for the same reason lib/workspaces.js
// gives: this machine runs Hyprland's Lua config layer, which evaluates a bare
// dispatcher argument as Lua, so `hyprctl dispatch exit` is a syntax error
// here.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run -- the arrangement
// lib/menus.js and lib/matching.js document at more length.
//
// **A declaration is:**
//
//   key       what the GlobalShortcut passes in. Stable: it is the name in
//             shell.qml and in the Hyprland bind, on both ends.
//   label     what the confirmation calls it, capitalised as a sentence starts.
//   question  the whole confirmation line. Written out per action rather than
//             built from the label, because "Log out?" is not "Logout?" and a
//             template that got that wrong would be wrong four times.
//   argv      what runs on Return. Run directly, no shell, no launch prefix --
//             see the note on `scoped` below.
//
// No `scoped` field, unlike a menu entry: three of these end the session, so a
// scope of that session is either pointless or actively wrong (lib/menus.js's
// argvOf says why for `uwsm stop`, and it is the same reason). Lock is the one
// that outlives the Launcher and would want one -- SystemMenu.qml's Lock is
// scoped for exactly that -- but the keybind it replaces ran bare `hyprlock`
// with no prefix at all, and the rule above is to run what the keybind ran.
// A hyprlock that dies with a `df-qs-restart launcher` is the behaviour this
// machine already has.
var ACTIONS = [
    {
        key: "shutdown",
        label: "Shut down",
        question: "Shut down?",
        argv: ["shutdown", "now"]
    },
    {
        key: "restart",
        label: "Restart",
        question: "Restart?",
        argv: ["shutdown", "-r", "now"]
    },
    {
        key: "logout",
        label: "Log out",
        question: "Log out? Unsaved work in every open window is lost.",
        argv: ["hyprctl", "dispatch", "hl.dsp.exit()"]
    },
    {
        key: "lock",
        label: "Lock",
        question: "Lock the screen?",
        argv: ["hyprlock"]
    }
];

// The declaration a key names, or null.
//
// Null rather than a throw or a default: the caller is a GlobalShortcut
// handler, and the honest answer to a shortcut naming an action that does not
// exist is a logged warning and nothing happening -- not a confirmation for
// some other action the user did not ask for.
function actionFor(key) {
    for (var i = 0; i < ACTIONS.length; i++) {
        if (ACTIONS[i].key === key)
            return ACTIONS[i];
    }
    return null;
}

// Every key, for the warning a shortcut naming an unknown action logs. The
// message names what *is* declared rather than only what was asked for,
// because the failure this is reached from -- shell.qml and this table
// drifting apart on a name -- is one where the list of valid names is the
// answer.
function keys() {
    return ACTIONS.map(function (action) {
        return action.key;
    });
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ACTIONS: ACTIONS,
        actionFor: actionFor,
        keys: keys
    };
}
