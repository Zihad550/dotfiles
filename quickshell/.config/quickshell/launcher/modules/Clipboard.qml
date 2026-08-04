import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/clipboard.js" as Clip

// The clipboard Provider: clipboard history, most recent first, reachable
// through its own prefix -- ticket 14's "replacing the separate tool behind
// its own keybind" (SUPER+CTRL+V, previously `df-launch-walker -m clipboard`,
// deleted with ticket 19; see hypr/.config/hypr/lua/bindings/clipboard.lua).
//
// The Provider interface it fills -- label, ready, catalog, actions, refresh
// -- is documented at the top of Applications.qml. Structurally this is
// Screenshots.qml with the layout dropped: a Process feeding a listing
// string, a pure module turning that into Entries, one Action. No `mark`, no
// `nested`, no `layout` -- nothing here asks for a selection across several
// Entries or a sub-view, so those three slots of the interface stay unfilled
// on purpose rather than copied in because Screenshots.qml has them.
//
// **Reached only through its own prefix**, and kept out of `pool` for the
// same reason directories is: it is ranked (this Provider has a real
// `catalog`, unlike calc and websearch), and scoring the whole clipboard
// history against every keystroke of every other Query would cost time no
// Query typed for applications or windows should pay. CONTEXT.md's own
// Language section already names the character -- "`$` for clipboard" -- so
// `prefix` is not a choice this file makes, only one it declares.
//
// **No Entry Key.** A clipboard entry's content is not the same act chosen
// twice -- pasting your email address five times is five choices of the same
// row, not four repeats of one -- and Frecency has no way to express recency
// on its own. A key would let a re-copied entry climb above ones copied since
// it, silently turning "most recent first" into "most used first" the moment
// anything is pasted back twice. Screenshots.qml's header reaches the same
// conclusion, from the same shape of problem: recency and Frecency answer
// different questions, and this Provider's checkbox asks for the first one.
QtObject {
    id: root

    readonly property string label: "clipboard"
    readonly property string description: "Clipboard history"
    readonly property string prefix: "$"

    // Never "not ready" -- an empty history is legitimate (nobody has copied
    // anything yet, or cliphist's own store is still empty), not a fault to
    // report. Same reasoning as the windows and screenshots Providers' own
    // `ready`.
    readonly property bool ready: true

    // Fed by the Process below. A plain string rather than the parsed list,
    // so re-parsing only happens in the one binding that needs it -- the same
    // shape Screenshots.qml's `listingText` is.
    property string listingText: ""
    readonly property var items: Clip.parseListing(root.listingText)

    // Same trap Screenshots.qml's own note on `onItemsChanged` names: an
    // empty result and a wrong property name look identical from inside the
    // Launcher, and `ready: true` above means this Provider never says
    // "waiting" to give the difference away on its own. Logged on every count
    // change rather than in a binding, so re-evaluating `catalog` several
    // times a second does not fill the log with lines nothing changed about.
    property string loggedState: ""
    onItemsChanged: {
        const state = String(root.items.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: clipboard Provider sees", root.items.length, "entries in history");
    }

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from -- the same reasoning as every other catalog here. No
    // `keys` -- see the header above -- and no `owners`: one corpus text per
    // Entry, the same shape screenshots.js's catalog is.
    readonly property var catalog: {
        const built = Clip.catalogOf(root.items, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null)
        };
    }

    // Putting an Entry back on the clipboard is the primary. `clear history`
    // and `delete entry` are the two extras -- elephant's own provider also
    // offers pin and edit, and neither is asked for here, so they stay out
    // rather than getting ported because the source had them.
    readonly property var actions: ({
        primary: {
            label: "copy",
            invoke: entry => root.copy(entry)
        },

        // Provider-scoped, not per-Entry -- but `extras` only ever dispatches
        // against the highlighted Entry (Launcher.qml's `runAction` returns
        // false with none highlighted), so this is reachable exactly when the
        // list is showing something to clear, which is the only time clearing
        // it means anything anyway.
        extras: [
            {
                chord: "Ctrl+X",
                label: "clear history",
                invoke: () => root.clearHistory(),
                after: "stay"
            },
            {
                // Not Ctrl+D: Linux Qt text fields bind that natively to
                // "delete character forward" (the same Emacs-style
                // line-editing set actions.js's own note on Backspace is
                // naming, just a letter that note did not anticipate), and
                // the query field claims it before this chord ever sees the
                // key.
                chord: "Alt+D",
                label: "delete entry",
                invoke: entry => root.deleteEntry(entry),
                after: "stay"
            }
        ]
    })

    function copy(entry): void {
        const argv = entry.target.isImage
            ? Clip.copyImageArgv(entry.target.raw)
            : Clip.copyArgv(entry.target.raw);
        Quickshell.execDetached(argv);
    }

    // Runs `cliphist wipe` to completion before asking for a fresh listing --
    // execDetached would return before the wipe finishes, so a refresh fired
    // right after it could still read the old history back. `after: "stay"`
    // above leaves the Launcher's own refresh to `wiper`'s `onExited`, once
    // there is actually something new to read.
    function clearHistory(): void {
        if (wiper.running)
            return;
        wiper.running = true;
    }

    readonly property Process wiper: Process {
        id: wiper
        command: Clip.clearCommand()
        onExited: root.refresh()
    }

    // `cliphist delete`, like decode, reads the id-and-preview line off
    // stdin rather than taking an argument -- see the note on deleteArgv in
    // lib/clipboard.js. Run through a Process rather than execDetached for
    // the same reason the wiper is: refresh has to wait for the delete to
    // actually land, not race a detached process that may still be running.
    function deleteEntry(entry): void {
        if (remover.running)
            return;
        remover.command = Clip.deleteArgv(entry.target.raw);
        remover.running = true;
    }

    readonly property Process remover: Process {
        id: remover
        onExited: root.refresh()
    }

    // A refresh asked for while `finder` is already mid-run, queued rather
    // than dropped -- `wiper` and `remover` both call refresh() from their
    // own onExited, and one landing while open() or another refresh already
    // has `finder` running must still be honoured once it settles, or the
    // list keeps showing an entry that is already gone. `finder`'s own
    // onExited is what drains this.
    property bool refreshPending: false

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Called at startup and again on every open, the same as the
    // windows and screenshots Providers -- something copied since the
    // Launcher last opened should be first in the list the next time it does.
    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Clip.listCommand();
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    // Assigned to a property rather than nested bare, the same reason
    // Calculator.qml's own Process is: QtObject has no default property to
    // nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped, the same as Screenshots.qml's own `find`:
        // an empty list already says plainly that nothing was found, and
        // `cliphist list` on an empty history is not a fault to log.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and not a duplicate of the
        // collector's own handler -- the same reasoning as Screenshots.qml's
        // own `onExited`. Which of `onStreamFinished` and `onExited` fires
        // first is not something this file gets to assume, so both settle
        // the same text.
        //
        // Drains `refreshPending`: a refresh() that arrived while this run
        // was already in flight gets the fresh run it asked for, once this
        // one is out of the way, rather than being silently dropped.
        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
