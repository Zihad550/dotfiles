import QtQuick
import Quickshell.Networking
import qs

// waybar: "network", wifi icons by signal strength, 󰀂 ethernet, 󰤮 disconnected,
// on-click nmtui. waybar polled every 3s; NetworkManager signals drive this.
//
// Now a row in Quick Settings. Ticket 03: click opens the Wi-Fi Page in
// place of nmtui. Ticket 05: the glyph is a second click target, toggling
// the radio. Ticket 06: wired state moved to its own row -- WiredRow.
MenuRow {
    id: root

    // Any Wi-Fi device, connected or not -- the Page needs one to scan on
    // even when this row itself is showing "Disconnected".
    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property var wifiNetwork: wifiDevice ? (wifiDevice.networks.values.find(network => network.connected) ?? null) : null

    // A hard block is a physical switch software can't undo, and with no
    // device there is nothing to scan or toggle -- both targets go inert
    // for these two, via `enabled` below, rather than each pretending to act.
    readonly property bool hardBlocked: !Networking.wifiHardwareEnabled
    readonly property bool noAdapter: wifiDevice === null
    readonly property bool inert: root.hardBlocked || root.noAdapter

    readonly property bool connecting: wifiDevice?.state === ConnectionState.Connecting

    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]

    // Opening the Page must not close the panel it is drawn in.
    signal requestWifiPage

    enabled: !root.inert
    opacity: root.inert ? 0.4 : 1

    icon: {
        // Distinct from 󰤮's "on, no link", so the glyph visibly changes on
        // toggle.
        if (root.inert || !Networking.wifiEnabled)
            return "󰤭";
        if (wifiDevice?.connected) {
            // signalStrength is 0.0-1.0.
            const strength = wifiNetwork?.signalStrength ?? 0;
            const index = Math.min(wifiIcons.length - 1, Math.floor(strength * wifiIcons.length));
            return wifiIcons[index];
        }
        return "󰤮";
    }

    label: {
        if (root.noAdapter)
            return "No adapter";
        if (root.hardBlocked)
            return "Blocked";
        if (!Networking.wifiEnabled)
            return "Wi-Fi off";
        if (root.connecting)
            return "Connecting…";
        if (wifiNetwork)
            return wifiNetwork.name;
        return "Disconnected";
    }

    detail: {
        if (wifiNetwork)
            return `${Math.round(wifiNetwork.signalStrength * 100)}%`;
        if (wifiDevice?.connected)
            return "Connected";
        return "";
    }

    glyphClickable: !root.inert

    onGlyphClicked: Networking.wifiEnabled = !Networking.wifiEnabled

    onClicked: {
        // Clicking the name while off can only have meant "get me online".
        if (!Networking.wifiEnabled)
            Networking.wifiEnabled = true;
        root.requestWifiPage();
    }
}
