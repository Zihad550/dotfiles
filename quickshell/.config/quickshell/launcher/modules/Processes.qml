import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/processes.js" as Proc

// The processes Provider: every running process, kill -9 on Return -- ticket
// 16's bin/walker/manage-processes (deleted) as a Provider. Selecting a row
// is still exactly what selecting a row in the script did.
//
// The Provider interface it fills -- label, ready, catalog, actions, refresh
// -- is documented at the top of Applications.qml. Structurally this is
// Clipboard.qml with a ps listing in place of `cliphist list`: a Process
// feeding a listing string, a pure module turning that into Entries, one
// Action.
//
// **Kill is the primary Action, and the label is "kill", on purpose.** The
// script's only action on a selection was `kill -9`, so that is what Return
// means here -- but in the merged pool "firefox" now names a window, an
// application and a process in the same list, and the process row's footer
// says plainly that Return destroys the process. The vocabulary's whole
// guarantee -- the keys do what the footer says -- is what makes a destructive
// Action acceptable in the pool at all.
//
// **In the pool, after applications**, and that ordering is what keeps this
// Provider safe to rank alongside the rest: a Query that names a running
// thing ties between its window, its application and its process, and the
// tie must go to focus-then-launch, never to kill. Windows beat applications
// (ticket 05), and applications beat processes here -- the launcher wins a
// three-way tie over the kill row.
NestableProvider {
    id: root

    readonly property string label: "processes"

    readonly property string description: "Kill a running process"

    // Never "not ready": a session with nothing to kill is legitimate, and
    // the listing arrives in one burst anyway. Same reasoning as the windows
    // Provider's own `ready`.
    readonly property bool ready: true

    // Fed by the Process below. A plain string, re-parsed only in the binding
    // that needs it -- the same shape Clipboard.qml's own `listingText` is.
    property string listingText: ""
    readonly property var listing: Proc.parseListing(root.listingText)

    // Same trap Clipboard.qml's own note names: an empty result and a wrong
    // property name look identical from inside the Launcher, and `ready: true`
    // means this Provider never says "waiting" to give the difference away.
    property string loggedState: ""
    onListingChanged: {
        const state = String(root.listing.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: processes Provider sees", root.listing.length, "process(es)");
    }

    readonly property var catalog: {
        const built = Catalog.keylessCatalog(root.listing,
            item => Proc.entryFor(item, root), Proc.textsFor);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null, built.owners)
        };
    }

    readonly property var actions: ({
        primary: {
            label: "kill",
            invoke: entry => root.kill(entry)
        }
    })

    // The primary Action, and the script's own verb and signal: `kill -9`,
    // destructive by design -- the ticket's own requirement is that
    // destructive Actions behave as the scripts did, and a SIGKILL is what
    // this row has always meant. The footer's "kill" is the consent the
    // script's single-purpose menu never needed to ask for.
    //
    // A Process rather than execDetached, so the outcome can be said out loud
    // -- the same change the systemd Provider's restart needed, for the same
    // reason: the Launcher has closed by the time this finishes (`after` is
    // the default close, since killing is final and the script dismissed
    // itself too), and the list is not a report. A row is gone on the next
    // open whether the kill worked or the process had already exited on its
    // own, and `kill -9` on something owned by another user fails in exactly
    // the same invisible way.
    //
    // The name is held on the Provider because `entry` does not survive the
    // close; one Process with a guard, so a second kill cannot lose the
    // first's notification. See S.notifyArgv's twin in lib/processes.js.
    property string killingName: ""

    function kill(entry): void {
        if (killer.running) {
            console.warn("launcher: processes Provider is still killing",
                root.killingName, "-- ignoring", entry.name);
            return;
        }

        root.killingName = entry.name;
        killer.command = Proc.killArgv(entry.target.pid);
        killer.running = true;
    }

    readonly property Process killer: Process {
        id: killer

        stdout: StdioCollector {}

        // Kept rather than dropped: "No such process" and "Operation not
        // permitted" are different faults, and kill says which.
        stderr: StdioCollector {
            id: killError
        }

        onExited: exitCode => {
            Quickshell.execDetached(Proc.notifyArgv(root.killingName, exitCode, killError.text));
            root.killingName = "";
            root.refresh();
        }
    }

    // Optional on the Provider interface: ask for a fresh listing. Called at
    // startup and again on every open, the same as the clipboard Provider's
    // own refresh -- processes come and go between opens.
    property bool refreshPending: false

    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Proc.listCommand();
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    // Assigned to a property rather than nested bare, the same reason
    // Themes.qml's own Process is: QtObject has no default property to nest a
    // child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped, the same as Clipboard.qml's own `finder`:
        // an empty listing already says plainly that nothing was found.
        stderr: StdioCollector {}

        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
