import QtQuick
import Quickshell
import Quickshell.Io
import qs

// waybar: "custom/tailscale", 10s poll of a shell script emitting waybar JSON.
//
// The script moved into this config and now streams (see its header), so this
// holds one long-lived process read by SplitParser rather than re-execing on a
// timer -- same shape as Voxtype.qml.
BarItem {
    id: root

    property string statusClass: ""

    text: statusClass === "" ? "" : (statusClass === "not-installed" ? "󰌾" : "󰄺")

    // style.css hardcoded catppuccin hexes here; these now follow the theme.
    textColor: {
        switch (statusClass) {
        case "connected":
            return Theme.ok;
        case "disconnected":
            return Theme.error;
        case "not-installed":
            return Theme.warn;
        default:
            return Theme.foreground;
        }
    }

    Process {
        id: proc

        command: [`${Quickshell.env("HOME")}/.config/quickshell/dotfiles/scripts/tailscale-status.sh`]
        running: true

        stdout: SplitParser {
            onRead: line => {
                try {
                    const status = JSON.parse(line);
                    root.statusClass = status.class ?? "";
                    root.tooltipText = status.tooltip ?? "";
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
        onTriggered: proc.running = true
    }
}
