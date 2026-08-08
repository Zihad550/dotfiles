// The dev-servers Provider's pure half: the Entry shape for a dev server URL
// and the argv the primary Action runs. Nothing here fetches through a
// process -- the URL list is data, declared in DevServers.qml where it
// hot-reloads.
//
// `df-launch-dev` is kept rather than inlined: it's the stable helper that
// knows how to reach the "localhost" special workspace on this machine and
// already does the launch-or-focus dance.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/devservers.test.js).

// The URL is the Entry Key -- stable across restarts, and opening a dev
// server is a genuine recurring choice.
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

// Absolute path, same rule as Themes.qml's df-theme-set: a launcher's PATH
// doesn't include ~/dotfiles/bin.
function launchArgv(home, url) {
    return [home + "/dotfiles/bin/df-launch-dev", url];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        entryFor: entryFor,
        launchArgv: launchArgv
    };
}
