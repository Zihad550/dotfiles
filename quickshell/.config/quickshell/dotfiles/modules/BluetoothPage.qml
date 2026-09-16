import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Io
import Quickshell.Services.Pipewire
import qs
import "lib/bluetooth.js" as Model

// Visual design ported from resources/omarchy/shell/plugins/panels/bluetooth/Panel.qml.
QuickSettingsPage {
    id: root

    title: ""

    signal closeRequested

    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property var groups: Model.deviceGroups(Bluetooth.devices.values)
    readonly property var hardwareSinks: Pipewire.nodes.values.filter(node => node.isSink && !node.isStream)
    property var deviceActions: ({})
    property string pairingAddress: ""
    property string pairingFailure: ""
    property bool discoveryAcquired: false
    property var pendingAudioDevice: null
    property int audioAttempts: 0

    // Omarchy sizes fonts from a 12px base; scale them to this theme's font size.
    readonly property real fontUnit: Theme.fontSize / 12
    readonly property int cornerRadius: 4
    readonly property color hoverFill: root.alpha(Theme.foreground, 0.08)
    readonly property color selectedFill: root.alpha(Theme.foreground, 0.18)
    readonly property color dimForeground: Qt.darker(Theme.foreground, 1.5)
    readonly property bool availableVisible: !!root.adapter?.discovering && root.groups.available.length > 0

    property int phraseIndex: 0
    readonly property var activePhrases: [
        "Untangling wires",
        "Streaming vikings",
        "Pairing mysteries",
        "Herding headsets",
        "Taming radios",
        "Summoning speakers",
        "Wrangling codecs",
        "Polishing packets",
    ]
    readonly property bool rotatingPhrases: root.active && !!root.adapter?.enabled
    readonly property string heroStatusText: {
        if (!root.adapter) return "No adapter";
        if (!root.adapter.enabled) return "Turned Off";
        return root.activePhrases[root.phraseIndex % root.activePhrases.length];
    }
    readonly property string heroIcon: {
        if (!root.adapter?.enabled) return "󰂲";
        return root.groups.connected.length > 0 ? "󰂱" : "󰂯";
    }

    function px(size: real): int {
        return Math.round(size * root.fontUnit);
    }

    function alpha(base: color, opacity: real): color {
        return Qt.rgba(base.r, base.g, base.b, opacity);
    }

    function deviceForAddress(address: string): var {
        return Bluetooth.devices.values.find(device => device.address === address) ?? null;
    }

    function actionState(address: string): var {
        return root.deviceActions[address] || { pending: "", failed: "", error: "", deadline: 0 };
    }

    function setPending(address: string, action: string): void {
        if (action) {
            root.deviceActions = Model.withActionState(root.deviceActions, address, {
                pending: action,
                failed: "",
                error: "",
                deadline: Date.now() + (action === "pairing" ? 55000 : 20000),
            });
        } else {
            const state = root.actionState(address);
            root.deviceActions = state.failed || state.error
                ? Model.withActionState(root.deviceActions, address, { pending: "" })
                : Model.withActionState(root.deviceActions, address, null);
        }
    }

    function failAction(address: string, action: string, message: string): void {
        root.deviceActions = Model.withActionState(root.deviceActions, address, {
            pending: "",
            failed: action,
            error: message,
            deadline: 0,
        });
    }

    function statusFor(row, section: string): string {
        const state = root.actionState(row.address);
        if (state.error) return state.error;
        if (state.pending === "forgetting") return "Forgetting…";
        if (state.pending === "disconnecting") return "Disconnecting…";
        if (row.connected) {
            if (row.batteryAvailable) return `${row.batteryPercent}%`;
            return section === "connected" ? "" : "Connected";
        }
        if (state.pending === "pairing") return "Pairing…";
        if (state.pending === "connecting") return "Connecting…";
        return "";
    }

    function actionTooltipFor(row, section: string): string {
        if (row.connected) return "Disconnect";
        return section === "available" ? "Pair" : "Connect";
    }

    function toggleBluetooth(): void {
        if (root.adapter) root.adapter.enabled = !root.adapter.enabled;
    }

    function activateDevice(row): void {
        if (!row || root.actionState(row.address).pending) return;
        const device = root.deviceForAddress(row.address);
        if (!device) {
            root.failAction(row.address, "", "Device is no longer available.");
            return;
        }
        if (row.connected) {
            root.setPending(row.address, "disconnecting");
            device.disconnect();
        } else if (row.paired) {
            root.setPending(row.address, "connecting");
            device.connect();
        } else {
            if (pairProcess.running) {
                root.failAction(row.address, "", "Finish the current pairing attempt first.");
                return;
            }
            root.pairingAddress = row.address;
            root.pairingFailure = "";
            root.setPending(row.address, "pairing");
            pairProcess.command = ["df-bluetooth-pair", row.address];
            pairProcess.running = true;
        }
    }

    function forgetDevice(address: string): void {
        if (root.actionState(address).pending) return;
        const device = root.deviceForAddress(address);
        if (!device) return;
        root.setPending(address, "forgetting");
        device.forget();
    }

    // Omarchy's right-click: disconnect a connected device, forget a paired one.
    function secondaryAction(row): void {
        if (!Model.hasSecondaryActions(row)) return;
        if (row.connected) root.activateDevice(row);
        else root.forgetDevice(row.address);
    }

    function scheduleAudioOutput(device): void {
        root.pendingAudioDevice = {
            address: device.address || "",
            name: device.name || "",
            deviceName: device.deviceName || "",
        };
        root.audioAttempts = 0;
        audioSwitch.restart();
    }

    function settlePending(): void {
        for (const address in root.deviceActions) {
            const state = root.deviceActions[address];
            const action = state.pending || state.failed;
            const device = root.deviceForAddress(address);
            const connected = (action === "pairing" || action === "connecting") && device?.connected;
            const disconnected = action === "disconnecting" && device && !device.connected;
            const forgotten = action === "forgetting"
                && (!device || !device.paired && !device.bonded && !device.trusted);
            if (!connected && !disconnected && !forgotten) continue;
            if (connected)
                root.scheduleAudioOutput(device);
            root.deviceActions = Model.withActionState(root.deviceActions, address, null);
        }
    }

    function switchAudioOutput(): void {
        if (!root.pendingAudioDevice) return;
        const sink = Model.bluetoothSinkForDevice(root.hardwareSinks, root.pendingAudioDevice);
        if (sink) {
            Pipewire.preferredDefaultAudioSink = sink;
            Quickshell.execDetached(["df-audio-output-set-default", String(sink.id), String(sink.name)]);
            root.pendingAudioDevice = null;
            return;
        }
        root.audioAttempts += 1;
        if (root.audioAttempts < 8) audioSwitch.restart();
        else root.pendingAudioDevice = null;
    }

    function acquireDiscovery(): void {
        if (root.discoveryAcquired) return;
        BluetoothDiscovery.acquire();
        root.discoveryAcquired = true;
    }

    function releaseDiscovery(): void {
        if (!root.discoveryAcquired) return;
        BluetoothDiscovery.release();
        root.discoveryAcquired = false;
        root.deviceActions = ({});
        root.pendingAudioDevice = null;
        audioSwitch.stop();
    }

    onActiveChanged: {
        if (root.active) root.acquireDiscovery();
        else root.releaseDiscovery();
    }
    onGroupsChanged: root.settlePending()
    onRotatingPhrasesChanged: {
        if (!root.rotatingPhrases) {
            phraseSwap.stop();
            heroStatus.opacity = 1;
        }
    }
    Component.onDestruction: root.releaseDiscovery()

    Process {
        id: pairProcess

        stderr: StdioCollector {
            onStreamFinished: root.pairingFailure = this.text.trim()
        }

        onExited: exitCode => {
            const address = root.pairingAddress;
            root.pairingAddress = "";
            if (exitCode !== 0) {
                root.failAction(
                    address,
                    "pairing",
                    root.pairingFailure || "Pairing failed. Use bluetui for PIN or confirmation requests."
                );
            }
        }
    }

    Timer {
        interval: 1000
        repeat: true
        running: root.active && Model.hasPendingActions(root.deviceActions)
        onTriggered: root.deviceActions = Model.expirePendingActions(root.deviceActions, Date.now())
    }

    Timer {
        id: audioSwitch
        interval: 500
        onTriggered: root.switchAudioOutput()
    }

    Timer {
        interval: 2800
        repeat: true
        running: root.rotatingPhrases
        onTriggered: phraseSwap.restart()
    }

    SequentialAnimation {
        id: phraseSwap

        PropertyAnimation {
            target: heroStatus
            property: "opacity"
            to: 0
            duration: 180
            easing.type: Easing.OutQuad
        }
        ScriptAction {
            script: root.phraseIndex = (root.phraseIndex + 1) % root.activePhrases.length
        }
        PropertyAnimation {
            target: heroStatus
            property: "opacity"
            to: 1
            duration: 260
            easing.type: Easing.InQuad
        }
    }

    Column {
        width: parent.width
        spacing: 14

        Item {
            width: parent.width
            height: Math.max(heroIconText.implicitHeight, heroLabels.implicitHeight, powerSwitch.implicitHeight)

            Text {
                id: heroIconText

                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: root.heroIcon
                color: Theme.foreground
                opacity: root.adapter?.enabled ? 1 : 0.5
                font.family: Theme.fontFamily
                font.pixelSize: root.px(24)
                textFormat: Text.PlainText
            }

            Column {
                id: heroLabels

                anchors.left: heroIconText.right
                anchors.leftMargin: 14
                anchors.right: powerSwitch.visible ? powerSwitch.left : parent.right
                anchors.rightMargin: powerSwitch.visible ? 12 : 0
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Text {
                    width: parent.width
                    text: "Bluetooth"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(14)
                    font.bold: true
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }

                Text {
                    id: heroStatus

                    width: parent.width
                    text: root.heroStatusText.toUpperCase()
                    color: Qt.darker(Theme.foreground, 1.4)
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(10)
                    font.bold: true
                    font.letterSpacing: 1.2
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }
            }

            PowerSwitch {
                id: powerSwitch

                visible: !!root.adapter
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                checked: !!root.adapter?.enabled
                onToggled: root.toggleBluetooth()
            }

            Tooltip {
                target: powerSwitch
                text: root.adapter?.enabled ? "Turn Bluetooth off" : "Turn Bluetooth on"
                shown: powerSwitch.hot
            }
        }

        Separator {}

        Column {
            width: parent.width
            visible: root.groups.connected.length > 0
            spacing: 10

            SectionHeader {
                text: "CONNECTED"
            }

            Repeater {
                model: root.groups.connected

                DeviceRow {
                    section: "connected"
                }
            }
        }

        Separator {
            visible: root.groups.connected.length > 0 && (root.groups.paired.length > 0 || root.availableVisible)
        }

        Column {
            width: parent.width
            visible: root.groups.paired.length > 0
            spacing: 10

            SectionHeader {
                text: "PAIRED"
            }

            Repeater {
                model: root.groups.paired

                DeviceRow {
                    section: "paired"
                }
            }
        }

        Separator {
            visible: root.groups.paired.length > 0 && root.availableVisible
        }

        Column {
            width: parent.width
            visible: root.availableVisible
            spacing: 10

            SectionHeader {
                text: "AVAILABLE"
            }

            Repeater {
                model: root.availableVisible ? root.groups.available : []

                DeviceRow {
                    section: "available"
                }
            }
        }

        Text {
            width: parent.width
            visible: root.groups.connected.length === 0 && root.groups.paired.length === 0 && !root.availableVisible
            text: !root.adapter ? "No Bluetooth adapter"
                : !root.adapter.enabled ? "Turn Bluetooth on to scan"
                : "Scanning for devices…"
            color: root.dimForeground
            font.family: Theme.fontFamily
            font.pixelSize: root.px(11)
            textFormat: Text.PlainText
            wrapMode: Text.WordWrap
        }

        Separator {}

        Item {
            id: bluetuiRow

            readonly property bool hot: bluetuiMouse.containsMouse || activeFocus

            function launch(): void {
                Quickshell.execDetached(["ghostty", "-e", "bluetui"]);
                root.closeRequested();
            }

            width: parent.width
            height: bluetuiContent.implicitHeight + 12
            activeFocusOnTab: visible
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    bluetuiRow.launch();
                    event.accepted = true;
                }
            }

            CursorFill {
                hot: bluetuiRow.hot
            }

            Row {
                id: bluetuiContent

                anchors.left: parent.left
                anchors.leftMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                spacing: 10

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "󰒓"
                    color: root.dimForeground
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(16)
                    textFormat: Text.PlainText
                }

                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 1

                    Text {
                        text: "Pair with PIN or confirmation"
                        color: Theme.foreground
                        font.family: Theme.fontFamily
                        font.pixelSize: root.px(12)
                        textFormat: Text.PlainText
                    }

                    Text {
                        text: "Opens bluetui"
                        color: root.dimForeground
                        font.family: Theme.fontFamily
                        font.pixelSize: root.px(10)
                        textFormat: Text.PlainText
                    }
                }
            }

            MouseArea {
                id: bluetuiMouse

                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: bluetuiRow.launch()
            }
        }
    }

    component Separator: Rectangle {
        width: parent ? parent.width : 0
        height: 1
        color: root.alpha(Theme.foreground, 0.12)
    }

    component SectionHeader: Text {
        color: Qt.darker(Theme.foreground, 1.4)
        font.family: Theme.fontFamily
        font.pixelSize: root.px(10)
        font.bold: true
        textFormat: Text.PlainText
        topPadding: Math.ceil(font.pixelSize * 0.15)
    }

    // Hover and keyboard focus share one look (Omarchy's hover cursor); a
    // connected row keeps the selected look at rest.
    component CursorFill: Rectangle {
        property bool hot: false
        property bool current: false

        anchors.fill: parent
        radius: root.cornerRadius
        color: hot ? root.hoverFill : (current ? root.selectedFill : "transparent")
        border.width: hot || current ? 1 : 0
        border.color: hot ? root.alpha(Theme.foreground, 0.25) : Theme.foreground

        Behavior on color {
            ColorAnimation {
                duration: 60
            }
        }
    }

    component PowerSwitch: Item {
        id: toggle

        property bool checked: false
        readonly property bool hot: switchMouse.containsMouse || activeFocus
        readonly property int trackHeight: 22
        readonly property int knobSize: 16
        readonly property int pad: 6

        signal toggled

        implicitWidth: track.width + pad * 2
        implicitHeight: trackHeight + pad * 2
        width: implicitWidth
        height: implicitHeight
        activeFocusOnTab: visible
        Keys.onPressed: event => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                toggle.toggled();
                event.accepted = true;
            }
        }

        Rectangle {
            anchors.fill: parent
            visible: toggle.hot
            radius: root.cornerRadius
            color: "transparent"
            border.width: 1
            border.color: root.alpha(Theme.foreground, 0.25)
        }

        Rectangle {
            id: track

            anchors.centerIn: parent
            width: Math.round(toggle.trackHeight * 1.9)
            height: toggle.trackHeight
            radius: height / 2
            color: toggle.checked ? root.selectedFill : root.alpha(Theme.foreground, 0.04)
            border.width: 1
            border.color: toggle.checked ? Theme.foreground : root.alpha(Theme.foreground, 0.4)

            Behavior on color {
                ColorAnimation {
                    duration: 120
                }
            }

            Rectangle {
                readonly property int inset: Math.round((toggle.trackHeight - toggle.knobSize) / 2)

                width: toggle.knobSize
                height: toggle.knobSize
                radius: height / 2
                x: toggle.checked ? track.width - width - inset : inset
                anchors.verticalCenter: parent.verticalCenter
                color: toggle.checked ? Theme.foreground : Qt.darker(Theme.foreground, 1.25)

                Behavior on x {
                    NumberAnimation {
                        duration: 120
                        easing.type: Easing.OutCubic
                    }
                }
            }
        }

        MouseArea {
            id: switchMouse

            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: toggle.toggled()
        }
    }

    // Two-line device row. modelData is a primitives-only row from Model.deviceGroups.
    component DeviceRow: Item {
        id: row

        required property var modelData
        property string section: ""

        readonly property var actionInfo: root.actionState(modelData.address)
        readonly property bool connected: modelData.connected
        readonly property bool busy: actionInfo.pending !== ""
        readonly property bool forgetAvailable: Model.hasSecondaryActions(modelData)
        readonly property bool hot: rowMouse.containsMouse || forgetMouse.containsMouse || activeFocus
        readonly property string statusText: root.statusFor(modelData, section)
        readonly property color statusColor: {
            if (actionInfo.error) return Theme.error;
            return connected || busy ? Theme.foreground : root.dimForeground;
        }

        width: parent ? parent.width : 0
        height: rowContent.implicitHeight + 12
        activeFocusOnTab: visible
        Keys.onPressed: event => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                root.activateDevice(row.modelData);
                event.accepted = true;
            } else if ((event.key === Qt.Key_Delete || event.key === Qt.Key_X) && row.forgetAvailable) {
                root.forgetDevice(row.modelData.address);
                event.accepted = true;
            }
        }

        CursorFill {
            hot: row.hot
            current: row.connected
        }

        MouseArea {
            id: rowMouse

            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            cursorShape: row.busy ? Qt.ArrowCursor : Qt.PointingHandCursor
            onClicked: mouse => {
                if (mouse.button === Qt.RightButton) root.secondaryAction(row.modelData);
                else root.activateDevice(row.modelData);
            }
        }

        Item {
            id: rowContent

            anchors.left: parent.left
            anchors.right: parent.right
            anchors.leftMargin: 10
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter
            implicitHeight: Math.max(deviceIcon.implicitHeight, info.implicitHeight, forgetButton.height)

            Text {
                id: deviceIcon

                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: row.connected ? "󰂱" : "󰂯"
                color: row.actionInfo.error ? root.dimForeground : row.statusColor
                font.family: Theme.fontFamily
                font.pixelSize: root.px(16)
                textFormat: Text.PlainText
            }

            Column {
                id: info

                anchors.left: deviceIcon.right
                anchors.leftMargin: 10
                anchors.right: forgetButton.visible ? forgetButton.left : parent.right
                anchors.rightMargin: forgetButton.visible ? 8 : 0
                anchors.verticalCenter: parent.verticalCenter
                spacing: 1

                Text {
                    width: parent.width
                    text: row.modelData.label || "Device"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(12)
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }

                Text {
                    width: parent.width
                    visible: row.statusText !== ""
                    text: row.statusText
                    color: row.statusColor
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(10)
                    textFormat: Text.PlainText
                    wrapMode: Text.Wrap
                }
            }

            Rectangle {
                id: forgetButton

                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(22, root.px(14) + 8)
                height: width
                visible: row.forgetAvailable && row.hot && !row.busy
                radius: root.cornerRadius
                color: forgetMouse.containsMouse ? root.hoverFill : "transparent"

                Text {
                    anchors.centerIn: parent
                    text: "󰅙"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: root.px(14)
                    textFormat: Text.PlainText
                }

                MouseArea {
                    id: forgetMouse

                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.forgetDevice(row.modelData.address)
                }

                Tooltip {
                    target: forgetButton
                    text: "Forget"
                    shown: forgetMouse.containsMouse
                }
            }
        }

        Tooltip {
            target: row
            text: root.actionTooltipFor(row.modelData, row.section)
            shown: rowMouse.containsMouse && !row.busy
        }
    }

    PwObjectTracker {
        objects: root.hardwareSinks
    }
}
