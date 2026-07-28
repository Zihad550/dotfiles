import QtQuick
import Quickshell
import qs

// waybar: "custom/tailscale", 10s poll of a shell script emitting waybar JSON.
//
// The script moved into this config and now streams (see its header). State
// lives in TailscaleService so the bar icon and the menu toggle share one
// stream; this is just the bar's view of it.
BarItem {
    id: root

    text: TailscaleService.icon
    tooltipText: TailscaleService.tooltip

    // style.css hardcoded catppuccin hexes here; these now follow the theme.
    textColor: {
        switch (TailscaleService.statusClass) {
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
}
