// The zellij Provider's pure half: the Entry shape for a zellij session and
// the argv the primary Action runs. Session names are data, declared in
// Zellij.qml where they hot-reload; this module is what a row says and
// exactly what a key press runs.
//
// The command is attach-*or*-create: `zellij ... attach --create <name>`
// starts a session that isn't running yet, so a not-yet-running session is
// still worth listing -- it's the ability to start one.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/zellij.test.js).

// The name is the Entry Key -- stable, and attaching to a named session is a
// genuine recurring choice.
function entryFor(session, provider) {
    return {
        name: session,
        subtext: "zellij session",
        icon: "utilities-terminal",
        key: "zellij:" + session,
        provider: provider,
        target: { session: session }
    };
}

// df-launch-special-app owns the Lua-vs-legacy dispatch and the
// special-workspace toggle.
//
// Session names must be shell-word-safe (letters, digits, `_`, `-`): the name
// is interpolated into the command string that df-launch-special-app hands to
// Hyprland's exec dispatcher to re-parse, so a space or quote would split
// into two words there. Not defended against here -- the constraint belongs
// on the data (Zellij.qml), which is the only place a new name gets added.
function launchArgv(home, session) {
    return [
        home + "/dotfiles/bin/df-launch-special-app",
        session,
        "ghostty -e zellij -l " + session + " attach --create " + session + " options --on-force-close quit",
        session
    ];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        entryFor: entryFor,
        launchArgv: launchArgv
    };
}
