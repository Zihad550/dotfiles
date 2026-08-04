import QtQuick
import Quickshell
import "../lib/websearch.js" as Web

// The web search Provider: a Query the Launcher has no local answer for goes
// out to the browser, and a Query that is a link opens as one.
//
// Every rule about which Queries those are, and what URL they become, is in
// lib/websearch.js, where it is under test. What is here is the launch.
//
// The Provider interface it fills is documented at the top of Applications.qml,
// with the same deliberate difference as Calculator.qml: **no `catalog`, because
// this Provider is not ranked**. Its Entry is generated from the Query, so a
// corpus holding it would hold a copy of the needle and rank first for
// everything typed -- a search row above Firefox for "fir". Launcher.qml
// appends these Entries after the merged pool instead, which is what elephant's
// `Score: 1` meant in a flat pool.
//
// `hasLocalAnswer` is the other half of that: this is the Provider of last
// resort, so the search row exists only when nothing else answered. A link does
// not wait for that -- see entriesFor in the module.
QtObject {
    id: root

    readonly property string label: "web search"
    readonly property string description: "Search the web"

    // Nothing to load. Emptiness here means the Query had a local answer, or is
    // not one to send anywhere, and both are answers rather than faults.
    readonly property bool ready: true

    // Walker's own prefix for this provider (walker/.config/walker/config.toml
    // -- deleted with ticket 19)
    // -- ticket 11 is what makes it reachable here. Read by lib/routing.js
    // through Launcher.qml; nothing in this file consults it. Routed here, a
    // plain search row shows unconditionally -- see the note on
    // `hasLocalAnswer` in Launcher.qml.
    readonly property string prefix: "@"

    // The Query, and whether the rest of the Launcher answered it. Both handed
    // down by the window; see the note on `localEntries` in Launcher.qml for
    // why the second one cannot be computed here.
    required property string queryText
    required property bool hasLocalAnswer

    // Same prefix, and for the same reasons, as Applications.launchPrefix -- see
    // the note there. The browser outlives the Launcher, so it wants to be its
    // own unit rather than a child of this process.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    readonly property var entries: Web.entriesFor(root.queryText, root.hasLocalAnswer, root)

    // Primary only. There is one thing to do with a URL.
    readonly property var actions: ({
        primary: {
            label: "open in browser",
            invoke: entry => root.openUrl(entry)
        }
    })

    function openUrl(entry): void {
        const argv = Web.openArgv(entry.target.url, root.launchPrefix);

        // Cannot happen for an Entry that exists -- entriesFor builds the URL
        // that built the Entry -- but openArgv refuses to produce a bare
        // `xdg-open`, which opens a file manager, so this is what that refusal
        // means at the call site.
        if (argv.length === 0) {
            console.warn("launcher: web search Entry with no URL to open");
            return;
        }

        Quickshell.execDetached(argv);
    }
}
