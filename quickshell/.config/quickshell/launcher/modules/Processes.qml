import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/processes.js" as Proc

// The processes Provider: every running process, kill -9 on Return.
// Structurally this is Clipboard.qml with a ps listing in place of
// `cliphist list`. Provider interface: see docs/launcher-spec.md.
//
// Kill is the primary Action, labelled "kill" so the footer says plainly
// that Return destroys the process -- the vocabulary's guarantee (the keys
// do what the footer says) is what makes a destructive Action acceptable in
// the pool at all.
//
// In the pool, after applications: a Query naming a running thing ties
// between its window, application and process, and the tie must go to
// focus-then-launch, never to kill. Windows beat applications, applications
// beat processes.
NestableProvider {
    id: root

    readonly property string label: "processes"
    readonly property string description: "Kill a running process"

    // Never "not ready": nothing to kill is legitimate.
    readonly property bool ready: true

    // A plain string, re-parsed only where needed.
    property string listingText: ""
    readonly property var listing: Proc.parseListing(root.listingText)

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

    // A Process, not execDetached, so the outcome can be reported (same
    // reason as the systemd Provider's restart): the Launcher closes before
    // this finishes, so the list is not itself a report, and a row is gone
    // on the next open whether the kill worked or the process had already
    // exited on its own.
    //
    // The name is held on the Provider because `entry` doesn't survive the
    // close; one Process with a guard, so a second kill can't lose the first's notification.
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

        // Kept, not dropped: "No such process" and "Operation not
        // permitted" are different faults.
        stderr: StdioCollector {
            id: killError
        }

        onExited: exitCode => {
            Quickshell.execDetached(Proc.notifyArgv(root.killingName, exitCode, killError.text));
            root.killingName = "";
            root.refresh();
        }
    }

    // Called at startup and on every open -- processes come and go between opens.
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

    // QtObject has no default property to nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped: an empty listing already says plainly that
        // nothing was found.
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
