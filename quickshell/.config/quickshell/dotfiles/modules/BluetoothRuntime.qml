import QtQuick
import Quickshell.Bluetooth

// Loaded only after BluetoothAvailability confirms that BlueZ owns its D-Bus
// name, keeping Quickshell.Bluetooth out of systems without Bluetooth.
Item {
    id: root

    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property var connectedDevices: Bluetooth.devices.values.filter(device => device.connected)
    readonly property bool transitioning: root.adapter?.state === BluetoothAdapterState.Enabling
        || root.adapter?.state === BluetoothAdapterState.Disabling

    function setEnabled(enabled: bool): void {
        if (root.adapter)
            root.adapter.enabled = enabled;
    }
}
