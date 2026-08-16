import QtQuick
import Quickshell
import Quickshell.Bluetooth
import qs

// Native operations are limited to devices BlueZ already knows. Authenticated
// pairing stays with bluetui, which owns the confirmation and PIN workflow.
QuickSettingsPage {
    id: root

    title: "Bluetooth"

    signal closeRequested

    readonly property BluetoothAdapter adapter: Bluetooth.defaultAdapter
    readonly property var knownDevices: [...Bluetooth.devices.values]
        .filter(device => device.connected || device.paired)
        .sort((a, b) => {
            if (a.connected !== b.connected)
                return a.connected ? -1 : 1;
            return root.deviceName(a).localeCompare(root.deviceName(b));
        })

    property var pendingDevice: null
    property string pendingOperation: ""
    property var contextMenuTarget: null

    function deviceName(device): string {
        return device.name || device.deviceName || device.address || "Unknown device";
    }

    function detailFor(device): string {
        if (device === root.pendingDevice) {
            if (root.pendingOperation === "connect")
                return "Connecting…";
            if (root.pendingOperation === "disconnect")
                return "Disconnecting…";
        }
        return device.connected ? "Connected" : "Paired";
    }

    function clearPending(): void {
        root.pendingDevice = null;
        root.pendingOperation = "";
    }

    function activateDevice(device, keyboard): void {
        if (root.pendingDevice || !device)
            return;

        root.contextMenuTarget = null;
        root.pendingDevice = device;
        root.pendingOperation = device.connected ? "disconnect" : "connect";
        if (device.connected)
            device.disconnect();
        else
            device.connect();
    }

    function openActions(device): void {
        if (root.pendingDevice || !device.connected && !device.paired)
            return;
        root.contextMenuTarget = root.contextMenuTarget === device ? null : device;
    }

    function disconnectDevice(device): void {
        root.contextMenuTarget = null;
        root.activateDevice(device, false);
    }

    function forgetDevice(device): void {
        if (root.pendingDevice)
            return;
        root.contextMenuTarget = null;
        device.forget();
    }

    onActiveChanged: {
        if (!root.active) {
            root.clearPending();
            root.contextMenuTarget = null;
        }
    }

    Timer {
        interval: 250
        repeat: true
        running: root.pendingDevice !== null

        onTriggered: {
            if (!root.pendingDevice)
                return;
            const state = root.pendingDevice.state;
            if (state !== BluetoothDeviceState.Connecting && state !== BluetoothDeviceState.Disconnecting)
                root.clearPending();
        }
    }

    Repeater {
        model: root.knownDevices

        delegate: Column {
            id: entry

            required property var modelData
            readonly property bool menuOpen: root.contextMenuTarget === entry.modelData

            width: root.width
            spacing: 2

            PageRow {
                width: entry.width
                enabled: !root.pendingDevice
                icon: entry.modelData.icon || ""
                label: root.deviceName(entry.modelData)
                detail: root.detailFor(entry.modelData)
                overflowVisible: entry.modelData.connected || entry.modelData.paired

                onClicked: keyboard => root.activateDevice(entry.modelData, keyboard)
                onRightClicked: root.openActions(entry.modelData)
                onOverflowClicked: root.openActions(entry.modelData)
            }

            PageRow {
                width: entry.width - 12
                x: 12
                visible: entry.menuOpen && entry.modelData.connected
                label: "Disconnect"

                onClicked: root.disconnectDevice(entry.modelData)
            }

            PageRow {
                width: entry.width - 12
                x: 12
                visible: entry.menuOpen && entry.modelData.paired
                label: "Forget"

                onClicked: root.forgetDevice(entry.modelData)
            }
        }
    }

    PageRow {
        width: root.width
        visible: root.knownDevices.length === 0
        enabled: false
        icon: "󰂲"
        label: "No paired Bluetooth devices"
    }

    PageRow {
        width: root.width
        enabled: !root.pendingDevice
        icon: "󰂱"
        label: "Pair new device"
        detail: "bluetui"

        onClicked: {
            Quickshell.execDetached(["ghostty", "-e", "bluetui"]);
            root.closeRequested();
        }
    }
}
