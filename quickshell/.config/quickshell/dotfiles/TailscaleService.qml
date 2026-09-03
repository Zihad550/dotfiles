pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "modules/lib/tailscale.js" as Model

// Tailscale state, shared by the Status Cluster and the Quick Settings toggle.
//
// A singleton because Variants builds one Bar per monitor: with the Process
// living in the bar module, a two-monitor session ran two copies of the status
// stream. There is one here no matter how many bars exist. The Tailscale Page
// is instantiated the same way, which is why it owns Profile state too rather
// than loading it itself.
//
// Privilege and failure handling for the four operations below (enabling,
// listing, switching, connecting):
// docs/adr/0030-tailscale-privilege-and-failure-handling.md
Singleton {
    id: root

    // "connected" | "disconnected" | "not-installed" | "" (unknown yet)
    property string statusClass: ""
    property string tooltip: ""

    // Account-level tailnet name (e.g. "mamacrm.com"); "" when not connected.
    // Assigned unconditionally from every status line so a disconnect cannot
    // leave a stale name standing next to an inactive tile.
    property string tailnet: ""

    readonly property bool connected: statusClass === "connected"
    readonly property bool installed: statusClass !== "not-installed"

    // True while `tailscale up`/`down` is in flight, whichever Process is
    // running it. The state shown comes from the status stream, which only
    // reports once the daemon has actually switched, so without this the
    // toggle looks dead for a second or two.
    readonly property bool busy: toggleProc.running || connectProc.running || switching

    readonly property string icon: statusClass === "" ? "" : (statusClass === "not-installed" ? "󰌾" : "󰄺")

    // Normalized Profiles from the last load that actually reached the
    // daemon; kept across a failed refresh per Model.mergeProfilesResult.
    property var profiles: []
    // "" (never loaded) | "ready" | "empty" | "unsupported" | "daemon-failure"
    // | "malformed" | "permission-cancelled" | "timeout"
    property string profilesState: ""
    property string profilesMessage: ""
    readonly property bool profilesLoading: profilesProc.running

    // Which of the four operations most recently failed in a way worth
    // retrying, so a Retry Row can rerun exactly that one -- never more than
    // one at a time, and never on its own (see retryFailedOperation()).
    // "" | "profiles" | "switch" | "connect"
    property string failedOperation: ""
    // The Profile a failed "switch"/"connect" belonged to; "" for Profile
    // listing or a bare enable that names no particular Profile.
    property string failedOperationProfileId: ""
    // "" | "permission-cancelled" | "timeout" | "authentication-required"
    property string failedOperationState: ""
    property string failedOperationMessage: ""

    // How many Tailscale Page instances (one per monitor, see class comment)
    // currently show. Failures render inline while at least one does, and as
    // a single notification once none do -- a plain bool would double-fire
    // the notification on a two-monitor session where one Page closes just
    // as the other's failure lands.
    property int visiblePageCount: 0

    function pageShown(): void {
        root.visiblePageCount += 1;
    }

    function pageHidden(): void {
        root.visiblePageCount = Math.max(0, root.visiblePageCount - 1);
    }

    function notifyIfHidden(message: string): void {
        if (root.visiblePageCount > 0)
            return;
        Quickshell.execDetached(["notify-send", "-u", "critical", "Tailscale", message]);
    }

    // Records a failed operation's outcome for the Retry Row and, when no
    // Page is showing to display it inline, a notification.
    function reportOperationFailure(operation: string, profileId: string, result: var): void {
        root.failedOperation = operation;
        root.failedOperationProfileId = profileId;
        root.failedOperationState = result.state;
        root.failedOperationMessage = result.message;
        root.notifyIfHidden(result.message);
    }

    function toggle(): void {
        if (busy || !installed)
            return;
        if (root.connected) {
            toggleProc.command = [`${Quickshell.env("HOME")}/.config/quickshell/dotfiles/scripts/tailscale-toggle.sh`, "down"];
            toggleProc.running = true;
            return;
        }
        root.connect();
    }

    // Fire-and-forget: the chevron navigates immediately and must not wait on
    // this, and the singleton outlives the Page so leaving it does not cancel
    // the request. Reuses connect() rather than a second privileged path.
    function enable(): void {
        if (busy || !installed || connected)
            return;
        root.connect();
    }

    // Bringing Tailscale on and (re)connecting the current Profile are the
    // same daemon operation -- df-tailscale connect only issues `up` when
    // not already Running -- so toggle()'s "on" leg and enable() both funnel
    // through here rather than switchProfile()'s own reconnect branch, which
    // additionally pins switchingProfileId to a specific Row.
    function connect(): void {
        root.failedOperation = "";
        connectProc.running = true;
    }

    // No polling Timer: refresh happens when the Page opens.
    function loadProfiles(): void {
        if (!installed || profilesProc.running)
            return;
        profilesProc.running = true;
    }

    // Profile ID mid-switch/connect; "" when idle. Owned here, not by the
    // Page, so closing Quick Settings can't cancel it (see class comment).
    property string switchingProfileId: ""
    readonly property bool switching: switchingProfileId !== ""

    // Activating a non-current Profile switches by ID then connects it;
    // activating the current one only (re)connects, and is a true no-op if
    // it is already connected. Every path ends in loadProfiles() so what
    // is shown is Tailscale's confirmed state, never an assumed one -- see
    // switchProc/connectProc's onExited.
    function switchProfile(id: string): void {
        // busy, not switching: a connect started by the Tile's chevron is a
        // transition too, and must not race a switch.
        if (busy || !id)
            return;
        root.failedOperation = "";
        const current = Model.currentProfile(root.profiles);
        if (current && current.id === id) {
            if (root.connected)
                return;
            root.switchingProfileId = id;
            connectProc.running = true;
            return;
        }
        root.switchingProfileId = id;
        switchProc.command = ["df-tailscale", "switch", id];
        switchProc.running = true;
    }

    // Reruns exactly the operation that last failed, and only because this
    // was called -- there is no automatic retry loop.
    function retryFailedOperation(): void {
        if (root.busy || root.failedOperation === "")
            return;
        const operation = root.failedOperation;
        const profileId = root.failedOperationProfileId;
        root.failedOperation = "";
        if (operation === "profiles") {
            root.loadProfiles();
        } else if (operation === "switch") {
            root.switchingProfileId = profileId;
            switchProc.command = ["df-tailscale", "switch", profileId];
            switchProc.running = true;
        } else if (operation === "connect") {
            root.switchingProfileId = profileId;
            connectProc.running = true;
        }
    }

    Process {
        id: statusProc

        command: [`${Quickshell.env("HOME")}/.config/quickshell/dotfiles/scripts/tailscale-status.sh`]
        running: true

        stdout: SplitParser {
            onRead: line => {
                try {
                    const status = JSON.parse(line);
                    root.statusClass = status.class ?? "";
                    root.tooltip = status.tooltip ?? "";
                    root.tailnet = status.tailnet ?? "";
                } catch (e) {
                    // Ignore partial or non-JSON lines.
                }
            }
        }

        onExited: restart.start()
    }

    // Not a poll. The script streams and only exits if it dies (tailscaled
    // upgrade, OOM); this is a 2s restart backoff so the icon does not freeze
    // on a stale state, and so a script that fails instantly does not spin.
    Timer {
        id: restart

        interval: 2000
        onTriggered: statusProc.running = true
    }

    // The script notifies on failure itself, so nothing is parsed here; this
    // exists to hold `running` for the busy flag.
    Process {
        id: toggleProc
    }

    Process {
        id: profilesProc

        command: ["df-tailscale", "profiles"]

        stdout: StdioCollector {
            id: profilesStdout
        }
        stderr: StdioCollector {
            id: profilesStderr
        }

        onExited: (exitCode, exitStatus) => {
            const result = Model.classifyProfiles(exitCode, profilesStdout.text, profilesStderr.text);
            const merged = Model.mergeProfilesResult(
                { state: root.profilesState, profiles: root.profiles, message: root.profilesMessage },
                result
            );
            root.profiles = merged.profiles;
            root.profilesState = merged.state;
            root.profilesMessage = merged.message;

            if (Model.isRetryableState(result.state)) {
                root.reportOperationFailure("profiles", "", result);
            } else if (root.failedOperation === "profiles") {
                root.failedOperation = "";
            }
        }
    }

    Process {
        id: switchProc

        stdout: StdioCollector {
            id: switchStdout
        }
        stderr: StdioCollector {
            id: switchStderr
        }

        // A failed switch never reaches connectProc; the refresh below shows
        // whichever Profile Tailscale actually left selected.
        onExited: exitCode => {
            if (exitCode === 0) {
                connectProc.running = true;
                return;
            }
            const result = Model.classifyAction(exitCode, switchStdout.text, switchStderr.text);
            root.reportOperationFailure("switch", root.switchingProfileId, result);
            root.switchingProfileId = "";
            root.loadProfiles();
        }
    }

    Process {
        id: connectProc

        command: ["df-tailscale", "connect"]

        stdout: StdioCollector {
            id: connectStdout
        }
        stderr: StdioCollector {
            id: connectStderr
        }

        onExited: exitCode => {
            const result = Model.classifyAction(exitCode, connectStdout.text, connectStderr.text);
            if (result.state === "ok") {
                if (root.failedOperation === "connect")
                    root.failedOperation = "";
            } else {
                root.reportOperationFailure("connect", root.switchingProfileId, result);
            }
            root.switchingProfileId = "";
            root.loadProfiles();
        }
    }
}
