// The zellij Provider's pure half: the Entry shape for a zellij session and
// the argv the primary Action runs.
//
// Ticket 16. Ported from bin/walker/zellij-sessions (deleted): the script
// listed three session names -- work, project, dev -- and ran
// `df-launch-special-app <name> "ghostty -e zellij -l <name> attach --create
// <name> options --on-force-close quit" <name>` on the chosen one. The
// session names are data, declared in Zellij.qml where they hot-reload; this
// module is the part worth testing: what a row says and exactly what a key
// press runs.
//
// The command is attach-**or**-create: `zellij ... attach --create <name>`
// attaches when the session exists and starts it when it does not, so a
// session that is not running is still worth listing -- it is the *ability to
// start* one. A Provider that listed only running sessions would hide exactly
// the sessions this one exists to offer.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/zellij.test.js) -- the same arrangement as matching.js.

// One session name, as the shape Zellij.qml's catalog wants.
//
// The name is the Entry Key -- stable, and attaching to your work session is
// a genuine recurring choice. The sub-line says what kind of thing it is and
// where it goes, because in the merged pool "work" does not say so on its
// own.
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

// Building the whole catalog out of these is lib/catalog.js's keyedCatalog,
// which Zellij.qml calls with this entryFor -- see the note there on why the
// shared function takes the Provider's own entryFor rather than either module
// wrapping the other.

// The primary Action's argv: df-launch-special-app by absolute path, with
// the session command as a single argument -- the exact three-argument shape
// the script used, quoted command included. df-launch-special-app owns the
// Lua-vs-legacy dispatch and the special-workspace toggle, which is what the
// script was calling it for.
//
// **Session names must be shell-word-safe** -- letters, digits, `_` and `-`.
// The name is interpolated into the command string, which df-launch-special-app
// hands to Hyprland's exec dispatcher to re-parse, so a name carrying a space
// or a quote would split into two words there rather than name one session.
// The declared names in Zellij.qml are all safe and this is not defended
// against here, because the defense would have to be a quoting scheme for a
// re-parse this module cannot see -- guessed, and untestable from anywhere but
// the host. The constraint belongs on the data instead: a new session name
// goes in Zellij.qml, and this is the rule it has to meet.
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
