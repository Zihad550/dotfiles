// The dev-servers Provider's pure half: the Entry shape for a dev server URL
// and the argv the primary Action runs.
//
// Ticket 16. Ported from bin/walker/dev-servers (deleted): the script held a
// hardcoded list of local dev-server URLs and ran `df-launch-dev <url>` on
// the chosen one. Nothing here fetches through a process because there is
// nothing to fetch -- the list is data, declared in DevServers.qml where it
// hot-reloads, and this module is the part worth testing: what a row says and
// exactly what a key press runs.
//
// `df-launch-dev` is kept rather than inlined. It is the stable helper that
// knows how to reach the "localhost" special workspace on this machine (the
// Lua-vs-legacy dispatch), and it already does the launch-or-focus dance the
// script got for free by calling it.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/devservers.test.js) -- the same arrangement as matching.js.

// One server URL, as the shape DevServers.qml's catalog wants.
//
// The URL is the Entry Key -- stable across restarts, and opening a dev
// server is a genuine recurring choice (the spec's "absolute paths" example
// covers a URL: it is the same thing every time). The sub-line names what
// kind of thing it is, because in the merged pool "https://localhost:5175"
// does not say so on its own.
function entryFor(url, provider) {
    return {
        name: url,
        subtext: "dev server",
        icon: "applications-development",
        key: "devserver:" + url,
        provider: provider,
        target: { url: url }
    };
}

// Building the whole catalog out of these is lib/catalog.js's keyedCatalog,
// which DevServers.qml calls with this entryFor -- see the note there on why
// the shared function takes the Provider's own entryFor rather than either
// module wrapping the other.

// The primary Action's argv: df-launch-dev, invoked by absolute path -- the
// same absolute-path rule Themes.qml applies to df-theme-set, because a
// launcher's PATH does not include ~/dotfiles/bin.
function launchArgv(home, url) {
    return [home + "/dotfiles/bin/df-launch-dev", url];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        entryFor: entryFor,
        launchArgv: launchArgv
    };
}
