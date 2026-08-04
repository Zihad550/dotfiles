import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/systemd.js" as S

// The systemd Provider: every running user and system service, restart on
// Return -- ticket 16's bin/walker/manage-systemd-processes (deleted) as a
// Provider. Selecting a row still restarts the same unit the script did; the
// system-unit command differs by one word, and that word is argued in
// lib/systemd.js.
//
// The Provider interface it fills -- label, ready, catalog, actions, refresh
// -- is documented at the top of Applications.qml.
//
// **The scope is the whole design.** The script listed the user services and
// the system services as two groups, one below the other, and a system unit
// needed privilege the user unit did not. That difference is this Provider's
// privilege handling -- here it is polkit rather than the script's sudo, for
// the reason lib/systemd.js gives -- and it is kept in the row rather than
// smuggled into the Action: an Entry's sub-line says which scope it is in,
// and `restart()` reads the scope off the Entry's own target, so the command
// that runs is decided by the row that was chosen. A row that hid its scope
// would be a row that asks for authorization when the user thought they were
// restarting a user unit -- which is why the scope is a property of the
// listing, not of the Action.
//
// **Restart closes the Launcher and notifies, and both halves were learned
// the hard way.** This stayed open with `after: "refresh"` first, on the
// argument that restarting a service is something you plausibly do twice in a
// row. The host said otherwise, twice over:
//
// - A system unit raises a polkit dialog, which is an ordinary window, and
//   this Launcher is an overlay-layer surface painted above every ordinary
//   window (Launcher.qml's WlrLayershell.layer). Staying open hid the dialog
//   behind itself -- the password prompt could not be reached until the
//   Launcher was dismissed, which took two Escapes because leaving a nested
//   Provider is the first one.
// - Re-listing was never confirmation anyway. The listing is
//   `--state=running`, which reads identically whether the unit restarted or
//   nothing happened at all, so a user unit's row simply vanished and came
//   back with no way to tell what that meant.
//
// So the outcome is reported instead of implied: the restart runs through a
// Process rather than execDetached, and its exit code becomes a notification
// (S.notifyArgv). systemctl exits 0 only when the unit is back up, so one
// number distinguishes "restarted", "you dismissed the dialog" and "the unit
// failed to start" -- and its own stderr, which is better at saying which than
// anything invented here, rides along on failure.
NestableProvider {
    id: root

    readonly property string label: "systemd"

    readonly property string description: "Restart a systemd service"

    // Never "not ready": a scope with nothing running is legitimate, and
    // each listing arrives in one burst anyway.
    readonly property bool ready: true

    // Fed by the two Processes below -- one listing per scope, each a plain
    // string, re-parsed only in the bindings that need it.
    property string userListingText: ""
    property string systemListingText: ""
    readonly property var userListing: S.parseListing(root.userListingText)
    readonly property var systemListing: S.parseListing(root.systemListingText)

    // Same trap Clipboard.qml's own note names: empty results and a wrong
    // property name look identical, and `ready: true` means this Provider
    // never says "waiting" to give the difference away.
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
    // from -- see the header for why the scope rides on the row. The two
    // corpora are concatenated with the system owners offset by the user
    // count, since each corpus's owners index into its own listing.
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

            // Close -- see the header.
            after: "close"
        }
    })

    // The primary Action: restart the unit in the scope the row is in --
    // `systemctl --user restart` for a user unit, plain `systemctl restart`
    // for a system one, which polkit authorizes through the session's
    // authentication agent. See S.restartArgv, where the choice not to carry
    // the script's `sudo` is argued: sudo needs a terminal, and a detached
    // exec has none.
    //
    // A Process rather than execDetached, which is the whole of how the
    // outcome gets reported -- execDetached has no exit code to read. The
    // unit name is held on the Provider because `entry` is gone by the time
    // the Process exits: the Launcher has closed and its Entries with it.
    //
    // One Process, not one per restart: a second restart while the first is
    // still running would otherwise lose the first's notification. Restarts
    // are seconds apart at worst and the guard keeps the name and the exit
    // code paired, which is the thing that must not slip.
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
        // notification shows, and it is better at naming the fault than
        // anything this file could invent.
        stderr: StdioCollector {
            id: restartError
        }

        onExited: exitCode => {
            Quickshell.execDetached(S.notifyArgv(root.restartingUnit, exitCode, restartError.text));
            root.restartingUnit = "";

            // The rows are stale now whether or not it worked -- and this
            // Provider may well be reopened before the unit settles.
            root.refresh();
        }
    }

    // Optional on the Provider interface: ask both scopes for a fresh
    // listing. Called at startup and again on every open.
    //
    // **One function per scope, and that is not tidiness.** The processes
    // Provider has a single finder, so its pending flag can re-run the whole
    // of refresh(). Two finders cannot: a pending flag that re-ran *both*
    // scopes would have each scope's exit restart the other and find this one
    // still running, setting the other's flag -- user exits, restarts user,
    // arms system; system exits, restarts system, arms user -- a respawn loop
    // with nothing to end it, armed by any `after: "refresh"` landing while a
    // listing is in flight. So a scope's pending flag re-runs only its own
    // scope, and refresh() is just the two of them.
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

    // Assigned to properties rather than nested bare -- the same reason
    // Themes.qml's own Process is: QtObject has no default property to nest
    // children into.
    readonly property Process finderUser: Process {
        id: finderUser

        stdout: StdioCollector {
            id: userOutput
            onStreamFinished: root.userListingText = userOutput.text
        }

        // Collected and dropped, the same as Clipboard.qml's own `finder`.
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
