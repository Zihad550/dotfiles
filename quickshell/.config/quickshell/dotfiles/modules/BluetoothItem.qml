import QtQuick
import Quickshell
import Quickshell.Bluetooth
import qs

// waybar: "bluetooth", format "", format-disabled "󰂲", format-connected ""
// (waybar used the same glyph for connected and disconnected),
// tooltip "Devices connected: {num_connections}", on-click bluetui.
//
// Now a row in the gear menu, so waybar's tooltip text became the row detail.
MenuRow {
    id: root

    readonly property BluetoothAdapter adapter: Bluetooth.defaultAdapter
    readonly property int connectedCount: Bluetooth.devices.values.filter(device => device.connected).length

    icon: !adapter || !adapter.enabled ? "󰂲" : ""
    label: "Bluetooth"

    detail: {
        if (!adapter)
            return "Unavailable";
        if (!adapter.enabled)
            return "Off";
        return `${connectedCount} connected`;
    }

    onClicked: Quickshell.execDetached(["ghostty", "-e", "bluetui"])
}
