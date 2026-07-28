pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Tailscale state, shared by the bar icon (modules/Tailscale.qml) and the menu
// toggle (modules/TailscaleRow.qml).
//
// A singleton because Variants builds one Bar per monitor: with the Process
// living in the bar module, a two-monitor session ran two copies of the status
// stream. There is one here no matter how many bars exist.
Singleton {
    id: root

    // "connected" | "disconnected" | "not-installed" | "" (unknown yet)
    property string statusClass: ""
    property string tooltip: ""

    readonly property bool connected: statusClass === "connected"
    readonly property bool installed: statusClass !== "not-installed"

    // True while `tailscale up`/`down` is in flight. The state shown comes from
    // the status stream, which only reports once the daemon has actually
    // switched, so without this the toggle looks dead for a second or two.
    readonly property bool busy: toggleProc.running

    readonly property string icon: statusClass === "" ? "" : (statusClass === "not-installed" ? "󰌾" : "󰄺")

    function toggle(): void {
        if (busy || !installed)
            return;
        toggleProc.command = [`${Quickshell.env("HOME")}/.config/quickshell/dotfiles/scripts/tailscale-toggle.sh`, connected ? "down" : "up"];
        toggleProc.running = true;
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
}
