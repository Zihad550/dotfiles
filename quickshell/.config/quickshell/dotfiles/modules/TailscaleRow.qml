import QtQuick
import Quickshell
import qs

// `tailscale up`/`down` as a switch. The Status Cluster owns the glance; this
// is the control.
//
// QuickSettings deliberately does not wire this row's closeRequested: the point
// of flipping a switch is watching it settle, and the state only lands once
// the status stream reports the daemon actually switched.
MenuRow {
    id: root

    icon: TailscaleService.icon
    label: "Tailscale"

    detail: {
        if (!TailscaleService.installed)
            return "Not installed";
        if (TailscaleService.busy)
            return "...";
        return "";
    }

    toggleVisible: TailscaleService.installed
    toggleOn: TailscaleService.connected

    // toggle() ignores clicks while one is in flight; this is the visible half
    // of that.
    opacity: TailscaleService.busy ? 0.6 : 1

    onClicked: TailscaleService.toggle()
}
