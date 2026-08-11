import QtQuick
import Quickshell.Networking
import qs

// waybar: "network", wifi icons by signal strength, 󰀂 ethernet, 󰤮 disconnected,
// on-click nmtui. waybar polled every 3s; NetworkManager signals drive this.
//
// Now a row in Quick Settings, so waybar's tooltip text became the row detail.
// Ticket 03: click opens the Wi-Fi Page in place of nmtui, and the name slot
// shows the connected SSID.
MenuRow {
    id: root

    // Any Wi-Fi device, connected or not -- the Page needs one to scan on
    // even when this row itself is showing "Disconnected" or "Wired".
    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property bool wired: Networking.devices.values.some(device => device.type === DeviceType.Wired && device.connected)
    readonly property var wifiNetwork: wifiDevice ? (wifiDevice.networks.values.find(network => network.connected) ?? null) : null

    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]

    // QuickSettings must not bind this to closing the panel -- same reasoning
    // as TailscaleRow's onCloseRequested comment.
    signal requestWifiPage

    icon: {
        if (wifiDevice?.connected) {
            // signalStrength is 0.0-1.0.
            const strength = wifiNetwork?.signalStrength ?? 0;
            const index = Math.min(wifiIcons.length - 1, Math.floor(strength * wifiIcons.length));
            return wifiIcons[index];
        }
        if (wired)
            return "󰀂";
        return "󰤮";
    }

    label: wifiNetwork ? wifiNetwork.name : "Network"

    detail: {
        if (wifiNetwork)
            return `${Math.round(wifiNetwork.signalStrength * 100)}%`;
        if (wifiDevice?.connected)
            return "Connected";
        if (wired)
            return "Wired";
        return "Disconnected";
    }

    onClicked: root.requestWifiPage()
}
