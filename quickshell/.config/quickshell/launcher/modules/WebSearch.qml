import QtQuick
import Quickshell
import "../lib/websearch.js" as Web

// The web search Provider: a Query the Launcher has no local answer for goes
// out to the browser, and a Query that is a link opens as one. Every rule
// about which Queries those are, and what URL they become, is in
// lib/websearch.js, under test. What's here is the launch.
//
// No `catalog`, same reason as Calculator.qml: this Provider generates its
// Entry from the Query, so scoring it would always rank it first.
// Launcher.qml appends it after the merged pool.
//
// `hasLocalAnswer` is the other half: this is the Provider of last resort, so
// the search row exists only when nothing else answered. A link doesn't wait
// for that -- see entriesFor in the module.
QtObject {
    id: root

    readonly property string label: "web search"
    readonly property string description: "Search the web"

    // Nothing to load: emptiness means the Query had a local answer or isn't
    // one to send anywhere, both answers rather than faults.
    readonly property bool ready: true

    readonly property string prefix: "@"

    // Both handed down by the window -- see `localEntries` in Launcher.qml
    // for why hasLocalAnswer can't be computed here.
    required property string queryText
    required property bool hasLocalAnswer

    // The browser outlives the Launcher, so it wants its own systemd unit
    // rather than being a child of this process.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    readonly property var entries: Web.entriesFor(root.queryText, root.hasLocalAnswer, root)

    // Primary only -- there's one thing to do with a URL.
    readonly property var actions: ({
        primary: {
            label: "open in browser",
            invoke: entry => root.openUrl(entry)
        }
    })

    function openUrl(entry): void {
        const argv = Web.openArgv(entry.target.url, root.launchPrefix);

        // Can't happen for an Entry that exists, but openArgv refuses to
        // produce a bare `xdg-open` (which opens a file manager instead) --
        // this is what that refusal means at the call site.
        if (argv.length === 0) {
            console.warn("launcher: web search Entry with no URL to open");
            return;
        }

        Quickshell.execDetached(argv);
    }
}
