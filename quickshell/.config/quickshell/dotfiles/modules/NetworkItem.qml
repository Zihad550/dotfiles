import QtQuick
import Quickshell
import Quickshell.Networking
import qs

// waybar: "network", wifi icons by signal strength, 󰀂 ethernet, 󰤮 disconnected,
// on-click nmtui. waybar polled every 3s; NetworkManager signals drive this.
BarItem {
    id: root

    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi && device.connected) ?? null
    readonly property bool wired: Networking.devices.values.some(device => device.type === DeviceType.Wired && device.connected)
    readonly property var wifiNetwork: wifiDevice ? (wifiDevice.networks.values.find(network => network.connected) ?? null) : null

    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]

    text: {
        if (wifiDevice) {
            // signalStrength is 0.0-1.0.
            const strength = wifiNetwork?.signalStrength ?? 0;
            const index = Math.min(wifiIcons.length - 1, Math.floor(strength * wifiIcons.length));
            return wifiIcons[index];
        }
        if (wired)
            return "󰀂";
        return "󰤮";
    }

    tooltipText: {
        if (wifiNetwork)
            return `${wifiNetwork.name}\nSignal: ${Math.round(wifiNetwork.signalStrength * 100)}%`;
        if (wifiDevice)
            return "Connected";
        if (wired)
            return "Wired";
        return "Disconnected";
    }

    onClicked: Quickshell.execDetached(["ghostty", "-e", "nmtui"])
}
