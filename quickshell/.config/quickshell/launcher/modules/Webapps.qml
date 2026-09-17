import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/webapps.js" as Web

// The Webapps Provider: the live Desktop Entries installed by one of the
// repo's webapp launchers, plus an install row. Installed rows remove on
// Return; the install row collects a name and URL through the Query field.
//
// It is intentionally keyless and entered from the "?" list. Launching stays
// in Applications, so a Webapp appears there exactly as it did before.
NestableProvider {
    id: root

    readonly property string label: "webapps"
    readonly property string description: "Install and remove Webapps"

    onActiveChanged: {
        if (!root.active) {
            root.cancelPrompt();
            root.leave();
        }
    }

    // No Webapps is a valid machine state, not a loading failure.
    readonly property bool ready: true

    // DesktopEntries watches the application directories. Keeping this as a
    // binding makes installation and removal update the catalog automatically.
    readonly property var applications: DesktopEntries.applications.values.filter(application => Web.isWebapp(application))

    readonly property var catalog: {
        const built = Web.catalogOf(root.applications, root, installActions);
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

    readonly property QtObject installActions: QtObject {
        readonly property var actions: ({
            primary: {
                label: "install",
                invoke: () => root.beginInstall(),
                after: "stay"
            }
        })
    }

    property bool prompting: false
    property string promptStage: ""
    property string installName: ""
    readonly property string promptValue: ""
    readonly property string promptVerb: root.promptStage === "name" ? "next" : "install"
    readonly property string promptPlaceholder: root.promptStage === "name"
        ? "Webapp name…" : "Webapp URL…"

    function beginInstall(): void {
        if (installer.running)
            return;
        root.installName = "";
        root.promptStage = "name";
        root.prompting = true;
    }

    function applyPrompt(text): void {
        const value = text.trim();
        if (value === "")
            return;

        if (root.promptStage === "name") {
            root.installName = value;
            root.prompting = false;
            root.promptStage = "url";
            Qt.callLater(() => {
                if (root.active && root.nested)
                    root.prompting = true;
            });
            return;
        }

        installer.command = Web.installArgv(root.home, root.installName, value);
        root.cancelPrompt();
        installer.running = true;
    }

    function cancelPrompt(): void {
        root.prompting = false;
        root.promptStage = "";
        root.installName = "";
    }

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

    readonly property Process installer: Process {
        id: installer

        stdout: StdioCollector {}

        stderr: StdioCollector {
            id: installError
        }

        onExited: exitCode => {
            if (exitCode !== 0)
                Quickshell.execDetached([
                    "notify-send", "--urgency=critical", "Webapp install failed",
                    installError.text.trim() || "exit " + exitCode
                ]);
        }
    }
}
