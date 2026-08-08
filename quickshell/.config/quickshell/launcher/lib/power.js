// The session-ending actions the power keybinds confirm, and nothing else.
// hypr/.config/hypr/lua/bindings/system.lua dispatches into the Launcher,
// which asks before running any of these -- see Launcher.qml's `confirming`
// and shell.qml's four GlobalShortcuts.
//
// The commands are the keybinds' own, not SystemMenu.qml's -- the two lists
// disagree (the menu uses `systemctl poweroff`/`uwsm stop`) and confirming a
// keybind must run what the keybind ran, not quietly change behavior while
// adding a confirmation. The menu is left alone.
//
// Hyprland dispatch uses the Lua form: this machine's Hyprland Lua config
// evaluates a bare dispatcher argument as Lua, so `hyprctl dispatch exit`
// would be a syntax error.
//
// Free of QML types so it loads under a plain JS runtime too.
//
// A declaration is:
//   key       what the GlobalShortcut passes in -- stable, shared with shell.qml/Hyprland.
//   label     what the confirmation calls it.
//   question  the whole confirmation line, written out per action (not
//             templated from label -- "Log out?" isn't "Logout?").
//   argv      what runs on Return. No shell, no launch prefix.
//
// No `scoped` field (unlike a menu entry): three of these end the session, so
// scoping to it is pointless or wrong. Lock is the exception that would want
// one, but the keybind it replaces ran bare `hyprlock`, and the rule here is
// to run what the keybind ran.
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

// null, not a throw: the caller is a GlobalShortcut handler, and an unknown
// action should log a warning and do nothing, not confirm the wrong thing.
function actionFor(key) {
    for (var i = 0; i < ACTIONS.length; i++) {
        if (ACTIONS[i].key === key)
            return ACTIONS[i];
    }
    return null;
}

// Every key, for the warning an unknown shortcut logs.
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
