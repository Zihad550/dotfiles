import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Networking
import qs

// The per-monitor Quick Settings panel beneath the Status Cluster.
PopupWindow {
    id: root

    enum Page {
        Primary,
        Wifi
    }

    property Item target
    property bool shown: false
    property bool keyboardFocusRequested: false

    // One value represents navigation, so Pages cannot become visible in
    // impossible combinations.
    property int currentPage: QuickSettings.Primary

    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property var wifiNetwork: root.wifiDevice
        ? (root.wifiDevice.networks.values.find(network => network.connected) ?? null)
        : null
    readonly property bool wifiConnecting: root.wifiDevice?.state === ConnectionState.Connecting
    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]

    readonly property int monitorWidth: root.screen
        ? Math.max(1, root.screen.width - 2 * Theme.edgeMargin)
        : Theme.quickSettingsWidth
    readonly property int monitorAvailableHeight: root.screen
        ? Math.max(1, root.screen.height - Theme.barHeight)
        : 10000
    readonly property real surfaceImplicitHeight: root.currentPage === QuickSettings.Wifi
        ? wifiPage.implicitHeight
        : primaryContent.implicitHeight

    // Set when the focus grab closes the panel. Hyprland may still deliver
    // that click to the Status Cluster underneath; toggle() ignores the
    // resulting immediate reopen.
    property double lastCleared: 0

    function wifiGlyph(): string {
        if (!Networking.wifiHardwareEnabled || !Networking.wifiEnabled)
            return "󰤭";
        if (!root.wifiNetwork)
            return "󰤮";
        const strength = root.wifiNetwork.signalStrength ?? 0;
        const index = Math.min(root.wifiIcons.length - 1, Math.floor(strength * root.wifiIcons.length));
        return root.wifiIcons[index];
    }

    function focusCurrentSurface(): void {
        if (!root.shown)
            return;
        if (!root.keyboardFocusRequested)
            panelFocus.forceActiveFocus();
        else if (root.currentPage === QuickSettings.Wifi)
            wifiPage.focusHeader();
        else if (wifiTile.visible)
            wifiTile.forceActiveFocus();
        else
            panelFocus.forceActiveFocus();
    }

    function navigate(page: int, keyboardFocus: bool): void {
        if (page !== QuickSettings.Primary && page !== QuickSettings.Wifi) {
            console.warn(`dotfiles: unavailable Quick Settings Page ${page}`);
            return;
        }
        root.keyboardFocusRequested = keyboardFocus;
        root.currentPage = page;
    }

    function showPrimary(keyboardFocus: bool): void {
        root.navigate(QuickSettings.Primary, keyboardFocus);
    }

    function dismiss(): void {
        root.shown = false;
    }

    function toggle(keyboardFocus: bool): void {
        if (!root.shown && Date.now() - root.lastCleared < 200)
            return;
        if (root.shown) {
            root.shown = false;
        } else {
            root.keyboardFocusRequested = keyboardFocus;
            root.shown = true;
        }
    }

    onShownChanged: {
        if (!root.shown)
            root.currentPage = QuickSettings.Primary;
        else
            Qt.callLater(() => root.focusCurrentSurface());
    }

    onCurrentPageChanged: Qt.callLater(() => root.focusCurrentSurface())

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown

        onCleared: {
            root.lastCleared = Date.now();
            root.dismiss();
        }
    }

    readonly property var powerActions: [
        {
            icon: "",
            label: "Lock",
            command: ["hyprlock"]
        },
        {
            icon: "󰤄",
            label: "Suspend",
            command: ["systemctl", "suspend"]
        },
        {
            icon: "󰜉",
            label: "Restart",
            command: ["systemctl", "reboot"]
        },
        {
            icon: "󰐥",
            label: "Shutdown",
            command: ["systemctl", "poweroff"]
        },
        {
            icon: "",
            label: "Log out",
            command: ["uwsm", "stop"]
        }
    ]

    anchor.item: root.target
    anchor.rect.x: root.target ? root.target.width - root.width : 0
    anchor.rect.y: root.target ? root.target.height : 0

    visible: root.shown
    grabFocus: root.shown
    color: "transparent"

    implicitWidth: Math.min(Theme.quickSettingsWidth, root.monitorWidth)
    implicitHeight: Math.min(
        root.surfaceImplicitHeight + 2 * Theme.quickSettingsPadding,
        root.monitorAvailableHeight
    )

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        radius: Theme.quickSettingsRadius

        FocusScope {
            id: panelFocus

            anchors.fill: parent
            anchors.margins: Theme.quickSettingsPadding
            focus: root.shown

            Keys.onEscapePressed: {
                if (root.currentPage === QuickSettings.Primary)
                    root.dismiss();
                else
                    root.showPrimary(true);
            }

            Item {
                id: primarySurface

                x: root.currentPage === QuickSettings.Primary ? 0 : -8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Primary
                opacity: root.currentPage === QuickSettings.Primary ? 1 : 0

                Behavior on x {
                    NumberAnimation {
                        duration: Theme.quickSettingsPageMotion
                        easing.type: Easing.OutCubic
                    }
                }

                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.quickSettingsPageMotion
                        easing.type: Easing.OutCubic
                    }
                }

                Flickable {
                    id: primaryScroller

                    anchors.fill: parent
                    contentWidth: width
                    contentHeight: primaryContent.implicitHeight
                    clip: true
                    boundsBehavior: Flickable.StopAtBounds
                    flickableDirection: Flickable.VerticalFlick

                    Column {
                        id: primaryContent

                        width: primaryScroller.width
                        spacing: Theme.quickSettingsGap

                        Flow {
                            id: tileGrid

                            visible: root.wifiDevice !== null
                            width: parent.width
                            height: wifiTile.visible ? Theme.quickSettingsTileHeight : 0
                            spacing: Theme.quickSettingsGap

                            readonly property real tileWidth: width >= 330
                                ? (width - Theme.quickSettingsGap) / 2
                                : width

                            Tile {
                                id: wifiTile

                                visible: tileGrid.visible
                                width: tileGrid.tileWidth
                                enabled: Networking.wifiHardwareEnabled

                                icon: root.wifiGlyph()
                                label: root.wifiNetwork ? root.wifiNetwork.name : "Wi-Fi"
                                active: Networking.wifiHardwareEnabled && Networking.wifiEnabled
                                busy: root.wifiConnecting
                                chevronVisible: true

                                onClicked: Networking.wifiEnabled = !Networking.wifiEnabled
                                onChevronClicked: keyboard => {
                                    if (!Networking.wifiEnabled)
                                        Networking.wifiEnabled = true;
                                    root.navigate(QuickSettings.Wifi, keyboard);
                                }
                            }
                        }

                        Column {
                            id: legacyRows

                            width: parent.width
                            spacing: 2

                            WiredRow {
                                width: legacyRows.width
                            }

                            BluetoothItem {
                                width: legacyRows.width
                                onCloseRequested: root.dismiss()
                            }

                            TailscaleRow {
                                width: legacyRows.width
                            }

                            DevcontainerRoutingRow {
                                width: legacyRows.width
                            }

                            Volume {
                                width: legacyRows.width
                                onCloseRequested: root.dismiss()
                            }

                            Item {
                                width: legacyRows.width
                                height: Theme.quickSettingsPadding

                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: parent.width
                                    height: 1
                                    color: Theme.foreground
                                    opacity: 0.15
                                }
                            }

                            Repeater {
                                model: root.powerActions

                                delegate: MenuRow {
                                    required property var modelData

                                    width: legacyRows.width
                                    icon: modelData.icon
                                    label: modelData.label

                                    onClicked: Quickshell.execDetached(modelData.command)
                                    onCloseRequested: root.dismiss()
                                }
                            }
                        }
                    }
                }
            }

            Item {
                id: wifiSurface

                x: root.currentPage === QuickSettings.Wifi ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Wifi
                opacity: root.currentPage === QuickSettings.Wifi ? 1 : 0

                Behavior on x {
                    NumberAnimation {
                        duration: Theme.quickSettingsPageMotion
                        easing.type: Easing.OutCubic
                    }
                }

                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.quickSettingsPageMotion
                        easing.type: Easing.OutCubic
                    }
                }

                WifiPage {
                    id: wifiPage

                    anchors.fill: parent
                    active: root.shown && root.currentPage === QuickSettings.Wifi

                    onBack: keyboard => root.showPrimary(keyboard)
                    onCloseRequested: root.dismiss()
                }
            }
        }
    }
}
