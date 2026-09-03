import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Services.UPower
import qs
import "lib/statusCluster.js" as Status

// The per-monitor Quick Settings panel beneath the Status Cluster.
PopupWindow {
    id: root

    enum Page {
        Primary,
        Network,
        Audio,
        Bluetooth,
        Power,
        Devcontainer,
        Tailscale
    }

    DevcontainerRoutingState {
        id: devcontainerRouting
    }

    property Item target
    property bool shown: false
    property bool keyboardFocusRequested: false

    // One value represents navigation, so Pages cannot become visible in
    // impossible combinations.
    property int currentPage: QuickSettings.Primary

    readonly property var bluetoothRuntime: bluetoothLoader.item
    readonly property var bluetoothAdapter: root.bluetoothRuntime?.adapter ?? null
    readonly property var bluetoothConnectedDevices: root.bluetoothRuntime?.connectedDevices ?? []
    readonly property bool bluetoothAvailable: root.bluetoothAdapter !== null
    readonly property bool bluetoothTransitioning: root.bluetoothRuntime?.transitioning ?? false
    property bool bluetoothTogglePending: false

    readonly property int monitorWidth: root.screen
        ? Math.max(1, root.screen.width - 2 * Theme.edgeMargin)
        : Theme.quickSettingsWidth
    readonly property int monitorAvailableHeight: root.screen
        ? Math.max(1, root.screen.height - Theme.barHeight)
        : 10000
    readonly property UPowerDevice battery: UPower.displayDevice
    readonly property bool hasLaptopBattery: root.battery?.isLaptopBattery ?? false
    readonly property bool batteryCharging: root.battery?.state === UPowerDeviceState.Charging
    readonly property bool batteryFull: root.battery?.state === UPowerDeviceState.FullyCharged
    readonly property int batteryPercent: {
        const raw = root.battery?.percentage ?? 0;
        return Math.round(raw > 1 ? raw : raw * 100);
    }
    readonly property string batteryState: {
        if (root.batteryCharging)
            return "Charging";
        if (root.batteryFull)
            return "Fully charged";
        return "Discharging";
    }
    readonly property string batteryGlyph: Status.batteryIcon(
        root.batteryCharging,
        root.batteryFull,
        root.batteryPercent
    )
    readonly property string batteryTone: Status.batteryTone(root.batteryCharging, root.batteryPercent)
    readonly property color batteryColor: {
        switch (root.batteryTone) {
        case "ok":
            return Theme.ok;
        case "warn":
            return Theme.warn;
        case "error":
            return Theme.error;
        default:
            return Theme.foreground;
        }
    }
    readonly property string batteryTooltip: `Battery ${root.batteryPercent}% (${root.batteryState.toLowerCase()})`

    Loader {
        id: bluetoothLoader

        active: BluetoothAvailability.available
        source: "BluetoothRuntime.qml"
    }

    readonly property real surfaceImplicitHeight: {
        if (root.currentPage === QuickSettings.Network)
            return networkPage.implicitHeight;
        if (root.currentPage === QuickSettings.Audio)
            return audioPage.implicitHeight;
        if (root.currentPage === QuickSettings.Bluetooth)
            return bluetoothPageLoader.item?.implicitHeight ?? 0;
        if (root.currentPage === QuickSettings.Power)
            return powerPage.implicitHeight;
        if (root.currentPage === QuickSettings.Devcontainer)
            return devcontainerPage.implicitHeight;
        if (root.currentPage === QuickSettings.Tailscale)
            return tailscalePage.implicitHeight;
        return primaryContent.implicitHeight;
    }

    // Set when the focus grab closes the panel. Hyprland may still deliver
    // that click to the Status Cluster underneath; toggle() ignores the
    // resulting immediate reopen.
    property double lastCleared: 0

    function setBluetoothEnabled(enabled: bool): void {
        if (!root.bluetoothRuntime || root.bluetoothTogglePending || root.bluetoothTransitioning)
            return;
        root.bluetoothTogglePending = true;
        root.bluetoothRuntime.setEnabled(enabled);
    }

    function focusCurrentSurface(): void {
        if (!root.shown)
            return;
        if (!root.keyboardFocusRequested)
            panelFocus.forceActiveFocus();
        else if (root.currentPage === QuickSettings.Network)
            networkPage.focusHeader();
        else if (root.currentPage === QuickSettings.Audio)
            audioPage.focusHeader();
        else if (root.currentPage === QuickSettings.Bluetooth && bluetoothPageLoader.item)
            bluetoothPageLoader.item.focusHeader();
        else if (root.currentPage === QuickSettings.Power)
            powerPage.focusHeader();
        else if (root.currentPage === QuickSettings.Devcontainer)
            devcontainerPage.focusHeader();
        else if (root.currentPage === QuickSettings.Tailscale)
            tailscalePage.focusHeader();
        else if (lockAction.visible)
            lockAction.forceActiveFocus();
        else if (networkQuickSettings.available)
            networkQuickSettings.focusFirstTile();
        else
            panelFocus.forceActiveFocus();
    }

    function navigate(page: int, keyboardFocus: bool): void {
        if (page === QuickSettings.Bluetooth && !root.bluetoothAvailable)
            return;
        if (page !== QuickSettings.Primary && page !== QuickSettings.Network && page !== QuickSettings.Audio && page !== QuickSettings.Bluetooth && page !== QuickSettings.Power && page !== QuickSettings.Devcontainer && page !== QuickSettings.Tailscale) {
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
        if (!root.shown) {
            root.currentPage = QuickSettings.Primary;
        } else {
            // The shared module never polls; opening is the deliberate
            // moment to pick up brightness changed while the panel was closed.
            BacklightService.refresh();
            Qt.callLater(() => root.focusCurrentSurface());
        }
    }

    onCurrentPageChanged: Qt.callLater(() => root.focusCurrentSurface())

    Timer {
        interval: 500
        repeat: true
        running: root.bluetoothTogglePending

        onTriggered: {
            if (!root.bluetoothTransitioning)
                root.bluetoothTogglePending = false;
        }
    }

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown && !networkPage.speedTestOpen && !TailscaleService.operationRunning

        onCleared: {
            root.lastCleared = Date.now();
            root.dismiss();
        }
    }

    readonly property var powerPageActions: [
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

                        Item {
                            id: quickSettingsHeader

                            width: parent.width
                            height: Theme.quickSettingsRowHeight

                            Item {
                                id: headerContent

                                anchors.fill: parent

                                Item {
                                    id: batterySummary

                                    anchors.left: parent.left
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: root.hasLaptopBattery ? 90 : 0
                                    height: parent.height
                                    visible: root.hasLaptopBattery

                                    Rectangle {
                                        anchors.fill: parent
                                        radius: height / 2
                                        color: Theme.foreground
                                        opacity: 0.12
                                    }

                                    Row {
                                        anchors.centerIn: parent
                                        spacing: 8

                                        Text {
                                            text: root.batteryGlyph
                                            color: root.batteryColor
                                            font.family: Theme.fontFamily
                                            font.pixelSize: Theme.fontSize + 1
                                            textFormat: Text.PlainText
                                        }

                                        Text {
                                            text: `${root.batteryPercent}%`
                                            color: Theme.foreground
                                            font.family: Theme.fontFamily
                                            font.pixelSize: Theme.fontSize
                                            font.weight: Font.DemiBold
                                            textFormat: Text.PlainText
                                        }
                                    }

                                    MouseArea {
                                        id: batteryMouse

                                        anchors.fill: parent
                                        hoverEnabled: true
                                    }

                                    Tooltip {
                                        target: batterySummary
                                        text: root.batteryTooltip
                                        shown: batteryMouse.containsMouse
                                    }
                                }

                                Row {
                                    id: headerActions

                                    anchors.right: parent.right
                                    anchors.verticalCenter: parent.verticalCenter
                                    spacing: 6

                                    HeaderAction {
                                        id: lockAction

                                        icon: ""
                                        tooltipText: "Lock"

                                        onClicked: {
                                            Quickshell.execDetached(["qs", "-c", "lock", "ipc", "call", "lock", "lock"]);
                                            root.dismiss();
                                        }
                                    }

                                    HeaderAction {
                                        id: powerAction

                                        icon: "󰐥"
                                        tooltipText: "Power"

                                        onClicked: keyboard => root.navigate(QuickSettings.Power, keyboard)
                                    }
                                }
                            }
                        }

                        Volume {
                            id: volumeSlider

                            width: primaryContent.width
                            onPageRequested: keyboard => root.navigate(QuickSettings.Audio, keyboard)
                        }

                        Brightness {
                            width: parent.width
                        }

                        NetworkQuickSettings {
                            id: networkQuickSettings

                            width: parent.width
                            controller: networkPage

                            onPageRequested: keyboard => root.navigate(QuickSettings.Network, keyboard)
                        }

                        Flow {
                            id: tileGrid

                            visible: TailscaleService.installed || root.bluetoothAvailable || devcontainerTile.visible
                            width: parent.width
                            height: tileGrid.visible ? tileGrid.implicitHeight : 0
                            spacing: Theme.quickSettingsGap

                            readonly property real tileWidth: width >= 330
                                ? (width - Theme.quickSettingsGap) / 2
                                : width

                            Tile {
                                id: stayAwakeTile

                                visible: true
                                width: tileGrid.tileWidth
                                navigationContainer: tileGrid

                                icon: "󰒲"
                                label: "Stay Awake"
                                active: StayAwakeState.enabled
                                busy: StayAwakeState.busy
                                chevronVisible: false

                                onClicked: StayAwakeState.toggle()
                            }

                            Tile {
                                id: bluetoothTile

                                visible: root.bluetoothAvailable
                                width: tileGrid.tileWidth
                                navigationContainer: tileGrid
                                enabled: !!root.bluetoothAdapter

                                icon: ""
                                label: {
                                    const connected = root.bluetoothConnectedDevices;
                                    if (connected.length === 1)
                                        return connected[0].name || connected[0].deviceName || connected[0].address || "Bluetooth";
                                    if (connected.length > 1)
                                        return `${connected.length} connected`;
                                    return "Bluetooth";
                                }
                                active: root.bluetoothAdapter?.enabled ?? false
                                busy: root.bluetoothTransitioning || root.bluetoothTogglePending
                                chevronVisible: true

                                onClicked: root.setBluetoothEnabled(!root.bluetoothAdapter.enabled)
                                onChevronClicked: keyboard => {
                                    if (!root.bluetoothAdapter.enabled)
                                        root.setBluetoothEnabled(true);
                                    root.navigate(QuickSettings.Bluetooth, keyboard);
                                }
                            }

                            Tile {
                                id: tailscaleTile

                                visible: TailscaleService.installed
                                width: tileGrid.tileWidth
                                navigationContainer: tileGrid

                                icon: TailscaleService.icon
                                label: TailscaleService.tailnet || "Tailscale"
                                active: TailscaleService.connected
                                busy: TailscaleService.busy
                                chevronVisible: true

                                onClicked: TailscaleService.toggle()
                                onChevronClicked: keyboard => {
                                    root.navigate(QuickSettings.Tailscale, keyboard);
                                    TailscaleService.enable();
                                }
                            }

                            DevcontainerRoutingTile {
                                id: devcontainerTile

                                width: tileGrid.tileWidth
                                navigationContainer: tileGrid
                                routingState: devcontainerRouting

                                onPageRequested: keyboard => root.navigate(QuickSettings.Devcontainer, keyboard)
                            }
                        }

                    }
                }
            }

            Item {
                id: networkSurface

                x: root.currentPage === QuickSettings.Network ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Network
                opacity: root.currentPage === QuickSettings.Network ? 1 : 0

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

                NetworkPage {
                    id: networkPage

                    anchors.fill: parent
                    active: root.shown && root.currentPage === QuickSettings.Network

                    onBack: keyboard => root.showPrimary(keyboard)
                    onCloseRequested: root.dismiss()
                }
            }

            Item {
                id: audioSurface

                x: root.currentPage === QuickSettings.Audio ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Audio
                opacity: root.currentPage === QuickSettings.Audio ? 1 : 0

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

                AudioPage {
                    id: audioPage

                    anchors.fill: parent
                    active: root.shown && root.currentPage === QuickSettings.Audio

                    onBack: keyboard => root.showPrimary(keyboard)
                    onCloseRequested: root.dismiss()
                }
            }

            Item {
                id: bluetoothSurface

                x: root.currentPage === QuickSettings.Bluetooth ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Bluetooth
                opacity: root.currentPage === QuickSettings.Bluetooth ? 1 : 0

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

                Loader {
                    id: bluetoothPageLoader

                    anchors.fill: parent
                    active: root.bluetoothAvailable && root.shown && root.currentPage === QuickSettings.Bluetooth
                    source: "BluetoothPage.qml"

                    onLoaded: {
                        item.active = true;
                        item.back.connect(root.showPrimary);
                        item.closeRequested.connect(root.dismiss);
                    }
                }
            }

            Item {
                id: powerSurface

                x: root.currentPage === QuickSettings.Power ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Power
                opacity: root.currentPage === QuickSettings.Power ? 1 : 0

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

                QuickSettingsPage {
                    id: powerPage

                    anchors.fill: parent
                    title: "Power"
                    active: root.shown && root.currentPage === QuickSettings.Power
                    onBack: keyboard => root.showPrimary(keyboard)

                    Repeater {
                        model: root.powerPageActions

                        delegate: PageRow {
                            required property var modelData

                            width: powerPage.width
                            icon: modelData.icon
                            label: modelData.label

                            onClicked: {
                                Quickshell.execDetached(modelData.command);
                                root.dismiss();
                            }
                        }
                    }
                }
            }

            Item {
                id: devcontainerSurface

                x: root.currentPage === QuickSettings.Devcontainer ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Devcontainer
                opacity: root.currentPage === QuickSettings.Devcontainer ? 1 : 0

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

                DevcontainerRoutingPage {
                    id: devcontainerPage

                    anchors.fill: parent
                    routingState: devcontainerRouting
                    active: root.shown && root.currentPage === QuickSettings.Devcontainer
                    onBack: keyboard => root.showPrimary(keyboard)
                }
            }

            Item {
                id: tailscaleSurface

                x: root.currentPage === QuickSettings.Tailscale ? 0 : 8
                width: parent.width
                height: parent.height
                visible: opacity > 0
                enabled: root.currentPage === QuickSettings.Tailscale
                opacity: root.currentPage === QuickSettings.Tailscale ? 1 : 0

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

                TailscalePage {
                    id: tailscalePage

                    anchors.fill: parent
                    active: root.shown && root.currentPage === QuickSettings.Tailscale
                    onBack: keyboard => root.showPrimary(keyboard)
                }
            }
        }
    }
}
