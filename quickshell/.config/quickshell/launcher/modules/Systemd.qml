import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/systemd.js" as S

// The systemd Provider: every running user and system service, restart on
// Return. Provider interface: see docs/launcher-spec.md.
//
// The scope is the whole design: a system unit needs polkit authorization a
// user unit doesn't (see lib/systemd.js), and that difference is kept in the
// row rather than the Action -- an Entry's sub-line says which scope it's
// in, and restart() reads the scope off the Entry's own target, so the
// command that runs is decided by the row that was chosen. A row that hid
// its scope could authorize something the user thought was a plain user restart.
//
// Restart closes the Launcher and notifies -- both learned the hard way from
// staying open with `after: "refresh"`:
// - A system unit raises a polkit dialog, an ordinary window, and the
//   Launcher is an overlay-layer surface painted above every ordinary
//   window -- staying open hid the dialog behind itself.
// - Re-listing was never confirmation anyway: the listing is
//   `--state=running`, which reads identically whether the unit restarted or
//   nothing happened, so a row just vanished and came back with no way to tell why.
// So the outcome is reported instead of implied: restart runs through a
// Process, not execDetached, and its exit code becomes a notification.
NestableProvider {
    id: root

    readonly property string label: "systemd"
    readonly property string description: "Restart a systemd service"

    // Never "not ready": a scope with nothing running is legitimate.
    readonly property bool ready: true

    // Fed by the two Processes below -- one listing per scope.
    property string userListingText: ""
    property string systemListingText: ""
    readonly property var userListing: S.parseListing(root.userListingText)
    readonly property var systemListing: S.parseListing(root.systemListingText)

    property string loggedState: ""
    onUserListingChanged: root.report()
    onSystemListingChanged: root.report()
    function report(): void {
        const state = root.userListing.length + ":" + root.systemListing.length;
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: systemd Provider sees", root.userListing.length,
            "user and", root.systemListing.length, "system service(s)");
    }

    // Both scopes in one catalog, each Entry carrying the scope it came
    // from. The two corpora are concatenated with the system owners offset
    // by the user count, since each corpus's owners index into its own listing.
    readonly property var catalog: {
        const user = Catalog.keylessCatalog(root.userListing,
            unit => S.entryFor(unit, "user", root), S.textsFor);
        const system = Catalog.keylessCatalog(root.systemListing,
            unit => S.entryFor(unit, "system", root), S.textsFor);
        const offset = user.entries.length;
        return {
            entries: user.entries.concat(system.entries),
            corpus: Matching.prepare(user.texts.concat(system.texts), null,
                user.owners.concat(system.owners.map(index => index + offset)))
        };
    }

    readonly property var actions: ({
        primary: {
            label: "restart",
            invoke: entry => root.restart(entry),
            after: "close"
        }
    })

    // The unit name is held on the Provider, not read off `entry`, because
    // the Launcher has closed (and its Entries with it) by the time the
    // Process exits.
    //
    // One Process, not one per restart: a second restart while the first is
    // still running would otherwise lose the first's notification.
    property string restartingUnit: ""

    function restart(entry): void {
        if (restarter.running) {
            console.warn("launcher: systemd Provider is still restarting",
                root.restartingUnit, "-- ignoring", entry.target.unit);
            return;
        }

        root.restartingUnit = entry.target.unit;
        restarter.command = S.restartArgv(entry.target.scope, entry.target.unit);
        restarter.running = true;
    }

    readonly property Process restarter: Process {
        id: restarter

        stdout: StdioCollector {}

        // Kept, not dropped: systemctl's own failure line is what the
        // notification shows, better than anything invented here.
        stderr: StdioCollector {
            id: restartError
        }

        onExited: exitCode => {
            Quickshell.execDetached(S.notifyArgv(root.restartingUnit, exitCode, restartError.text));
            root.restartingUnit = "";

            // The rows are stale now whether or not it worked.
            root.refresh();
        }
    }

    // One function per scope, deliberately: a single pending flag re-running
    // *both* scopes could form a respawn loop (user exits, restarts user,
    // finds system still running, arms system's flag; system exits, restarts
    // system, arms user's flag; repeat) armed by any `after: "refresh"`
    // landing mid-listing. A scope's pending flag re-runs only its own scope.
    property bool userRefreshPending: false
    property bool systemRefreshPending: false

    function refresh(): void {
        root.refreshUser();
        root.refreshSystem();
    }

    function refreshUser(): void {
        if (finderUser.running) {
            root.userRefreshPending = true;
            return;
        }
        finderUser.command = S.listCommand("user");
        finderUser.running = true;
    }

    function refreshSystem(): void {
        if (finderSystem.running) {
            root.systemRefreshPending = true;
            return;
        }
        finderSystem.command = S.listCommand("system");
        finderSystem.running = true;
    }

    Component.onCompleted: root.refresh()

    // QtObject has no default property to nest children into.
    readonly property Process finderUser: Process {
        id: finderUser

        stdout: StdioCollector {
            id: userOutput
            onStreamFinished: root.userListingText = userOutput.text
        }

        stderr: StdioCollector {}

        onExited: {
            root.userListingText = userOutput.text;
            if (root.userRefreshPending) {
                root.userRefreshPending = false;
                root.refreshUser();
            }
        }
    }

    readonly property Process finderSystem: Process {
        id: finderSystem

        stdout: StdioCollector {
            id: systemOutput
            onStreamFinished: root.systemListingText = systemOutput.text
        }

        stderr: StdioCollector {}

        onExited: {
            root.systemListingText = systemOutput.text;
            if (root.systemRefreshPending) {
                root.systemRefreshPending = false;
                root.refreshSystem();
            }
        }
    }
}
