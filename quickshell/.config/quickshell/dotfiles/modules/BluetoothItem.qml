import QtQuick
import Quickshell
import Quickshell.Bluetooth
import qs

// waybar: "bluetooth", format "", format-disabled "󰂲", format-connected ""
// (waybar used the same glyph for connected and disconnected),
// tooltip "Devices connected: {num_connections}", on-click bluetui.
BarItem {
    id: root

    readonly property BluetoothAdapter adapter: Bluetooth.defaultAdapter
    readonly property int connectedCount: Bluetooth.devices.values.filter(device => device.connected).length

    text: {
        if (!adapter || !adapter.enabled)
            return "󰂲";
        return "";
    }

    tooltipText: `Devices connected: ${connectedCount}`

    onClicked: Quickshell.execDetached(["ghostty", "-e", "bluetui"])
}
