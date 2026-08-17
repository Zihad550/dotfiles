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

// Session names must be application-ID-safe (letters, digits, `_`, `-`). The
// constraint belongs on the data (Zellij.qml), where sessions are declared.
function launchArgv(home, session) {
    var initialClass = "io.github.zihad550.dotfiles.zellij." + session;
    return [
        home + "/dotfiles/bin/df-launch-special-workspace",
        initialClass,
        session,
        "ghostty",
        "--class=" + initialClass,
        "-e",
        "zellij",
        "-l",
        session,
        "attach",
        "--create",
        session,
        "options",
        "--on-force-close",
        "quit"
    ];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        entryFor: entryFor,
        launchArgv: launchArgv
    };
}
