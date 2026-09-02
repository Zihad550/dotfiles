import QtQuick
import Quickshell.Networking
import qs

// The transport Tiles share a grid so either one can disappear without leaving
// a placeholder. The Network Page itself lives in QuickSettings' page stack.
Item {
    id: root

    property var controller: null
    readonly property var networkDevices: Networking.devices ? Networking.devices.values : []
    property var wifiDevice: root.networkDevices.find(
        device => device.type === DeviceType.Wifi
    ) ?? null
    readonly property var wifiNetwork: root.wifiDevice
        && root.wifiDevice.networks
        ? root.wifiDevice.networks.values.find(network => network.connected) ?? null
        : null
    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]
    readonly property bool wifiConnecting: root.wifiDevice?.state === ConnectionState.Connecting
    readonly property var wiredDevices: root.networkDevices.filter(
        device => device.type === DeviceType.Wired
    )

    signal pageRequested(bool keyboard)

    readonly property bool available: root.wifiDevice !== null || root.wiredDevices.length > 0

    visible: root.available

    implicitHeight: root.available ? tileGrid.implicitHeight : 0

    function wifiGlyph(): string {
        if (!Networking.wifiHardwareEnabled || !Networking.wifiEnabled)
            return "󰤭";
        if (!root.wifiNetwork)
            return "󰤮";
        const strength = root.wifiNetwork.signalStrength ?? 0;
        const index = Math.min(root.wifiIcons.length - 1, Math.floor(strength * root.wifiIcons.length));
        return root.wifiIcons[index];
    }

    function focusFirstTile(): void {
        if (wifiTile.visible && wifiTile.enabled) {
            wifiTile.forceActiveFocus();
            return;
        }
        for (const child of tileGrid.children) {
            if (child.visible && child.activeFocusOnTab) {
                child.forceActiveFocus();
                return;
            }
        }
    }

    Flow {
        id: tileGrid

        width: parent.width
        spacing: Theme.quickSettingsGap
        visible: root.available

        readonly property real tileWidth: width >= 330
            ? (width - Theme.quickSettingsGap) / 2
            : width

        Tile {
            id: wifiTile

            visible: root.wifiDevice !== null
            width: tileGrid.tileWidth
            navigationContainer: tileGrid
            enabled: Networking.wifiHardwareEnabled
            icon: root.wifiGlyph()
            label: root.wifiNetwork ? root.wifiNetwork.name : "Wi-Fi"
            active: Networking.wifiHardwareEnabled && Networking.wifiEnabled
            busy: root.wifiConnecting
            chevronVisible: true

            onClicked: {
                if (!root.controller || root.controller.networkManagerAvailable)
                    Networking.wifiEnabled = !Networking.wifiEnabled;
            }
            onChevronClicked: keyboard => {
                if ((!root.controller || root.controller.networkManagerAvailable)
                        && !Networking.wifiEnabled)
                    Networking.wifiEnabled = true;
                root.pageRequested(keyboard);
            }
        }

        Repeater {
            model: root.wiredDevices

            delegate: WiredTile {
                property var wiredDevice: modelData

                width: tileGrid.tileWidth
                navigationContainer: tileGrid
                device: wiredDevice
                controller: root.controller

                onPageRequested: keyboard => root.pageRequested(keyboard)
            }
        }
    }
}
