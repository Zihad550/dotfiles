import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/webapps.js" as Web

// The Webapps Provider: the live Desktop Entries installed by one of the
// repo's webapp launchers, with removal as its primary Action.
//
// It is intentionally keyless and entered from the "?" list. Launching stays
// in Applications, so a Webapp appears there exactly as it did before.
NestableProvider {
    id: root

    readonly property string label: "webapps"
    readonly property string description: "List and remove installed Webapps"

    // No Webapps is a valid machine state, not a loading failure.
    readonly property bool ready: true

    // DesktopEntries watches the application directories. Keeping this as a
    // binding makes installation and removal update the catalog automatically.
    readonly property var applications: DesktopEntries.applications.values.filter(application => Web.isWebapp(application))

    readonly property var catalog: {
        const built = Web.catalogOf(root.applications, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null)
        };
    }

    readonly property var actions: ({
        primary: {
            label: "remove",
            invoke: entry => root.remove(entry),
            after: "stay"
        }
    })

    // One Process and one guard: a second Return cannot replace the identity
    // whose failure still needs reporting.
    property string removingId: ""
    property string removingName: ""

    function remove(entry): void {
        if (remover.running) {
            console.warn("launcher: webapps Provider is still removing",
                root.removingName, "-- ignoring", entry.name);
            return;
        }

        root.removingId = entry.target.id;
        root.removingName = entry.name;
        remover.command = Web.removeArgv(root.home, root.removingId);
        remover.running = true;
    }

    readonly property string home: Quickshell.env("HOME")

    readonly property Process remover: Process {
        id: remover

        stdout: StdioCollector {}

        stderr: StdioCollector {
            id: removeError
        }

        onExited: exitCode => {
            const notification = Web.notifyArgv(root.removingName, exitCode, removeError.text);
            root.removingId = "";
            root.removingName = "";
            if (notification !== null)
                Quickshell.execDetached(notification);
        }
    }
}
