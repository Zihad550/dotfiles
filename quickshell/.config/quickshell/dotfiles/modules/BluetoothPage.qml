import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Io
import Quickshell.Services.Pipewire
import qs
import "lib/bluetooth.js" as Model

QuickSettingsPage {
    id: root

    title: "Bluetooth"

    signal closeRequested

    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property var groups: Model.deviceGroups(Bluetooth.devices.values)
    readonly property var hardwareSinks: Pipewire.nodes.values.filter(node => node.isSink && !node.isStream)
    property var deviceActions: ({})
    property string openActionsAddress: ""
    property string pairingAddress: ""
    property string pairingFailure: ""
    property bool discoveryAcquired: false
    property var pendingAudioDevice: null
    property int audioAttempts: 0

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

    function detailFor(row): string {
        const pending = root.actionState(row.address).pending;
        if (pending === "pairing") return "Pairing…";
        if (pending === "connecting") return "Connecting…";
        if (pending === "disconnecting") return "Disconnecting…";
        if (pending === "forgetting") return "Forgetting…";
        if (row.connected && row.batteryAvailable) return `Connected · ${row.batteryPercent}%`;
        if (row.connected) return "Connected";
        return row.paired ? "Paired" : "Available";
    }

    function activateDevice(row): void {
        if (!row || root.actionState(row.address).pending) return;
        const device = root.deviceForAddress(row.address);
        if (!device) {
            root.failAction(row.address, "", "Device is no longer available.");
            return;
        }
        root.openActionsAddress = "";
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
        root.openActionsAddress = "";
        if (!device) return;
        root.setPending(address, "forgetting");
        device.forget();
    }

    function toggleActions(row): void {
        if (!Model.hasSecondaryActions(row)) return;
        root.openActionsAddress = root.openActionsAddress === row.address ? "" : row.address;
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
        root.openActionsAddress = "";
        root.pendingAudioDevice = null;
        audioSwitch.stop();
    }

    onActiveChanged: {
        if (root.active) root.acquireDiscovery();
        else root.releaseDiscovery();
    }
    onGroupsChanged: root.settlePending()
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

    PageRow {
        width: root.width
        icon: root.adapter?.enabled ? "󰂯" : "󰂲"
        label: "Bluetooth power"
        detail: root.adapter?.enabled ? "On" : "Off"
        onClicked: if (root.adapter) root.adapter.enabled = !root.adapter.enabled
    }

    Text {
        width: root.width
        visible: root.groups.connected.length > 0
        text: "CONNECTED"
        color: Theme.foreground
        opacity: 0.62
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize - 2
        font.weight: Font.DemiBold
        textFormat: Text.PlainText
    }

    Repeater {
        model: root.groups.connected
        delegate: deviceDelegate
    }

    Text {
        width: root.width
        visible: root.groups.paired.length > 0
        text: "PAIRED"
        color: Theme.foreground
        opacity: 0.62
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize - 2
        font.weight: Font.DemiBold
        textFormat: Text.PlainText
    }

    Repeater {
        model: root.groups.paired
        delegate: deviceDelegate
    }

    Text {
        width: root.width
        visible: root.adapter?.discovering && root.groups.available.length > 0
        text: "AVAILABLE"
        color: Theme.foreground
        opacity: 0.62
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize - 2
        font.weight: Font.DemiBold
        textFormat: Text.PlainText
    }

    Repeater {
        model: root.adapter?.discovering ? root.groups.available : []
        delegate: deviceDelegate
    }

    PageRow {
        width: root.width
        visible: root.adapter?.enabled && root.adapter?.discovering && root.groups.connected.length === 0
            && root.groups.paired.length === 0 && root.groups.available.length === 0
        enabled: false
        icon: "󰑐"
        label: "Scanning for Bluetooth devices"
    }

    PageRow {
        width: root.width
        visible: !root.adapter?.enabled
        enabled: false
        icon: "󰂲"
        label: "Turn Bluetooth on to find devices"
    }

    PageRow {
        width: root.width
        icon: "󰒓"
        label: "Pair with PIN or confirmation"
        detail: "bluetui"
        onClicked: {
            Quickshell.execDetached(["ghostty", "-e", "bluetui"]);
            root.closeRequested();
        }
    }

    Component {
        id: deviceDelegate

        Column {
            id: deviceEntry
            required property var modelData

            width: root.width
            spacing: 2

            PageRow {
                width: parent.width
                enabled: !root.actionState(deviceEntry.modelData.address).pending
                icon: deviceEntry.modelData.icon || ""
                label: deviceEntry.modelData.label
                overflowVisible: Model.hasSecondaryActions(deviceEntry.modelData)
                onClicked: root.activateDevice(deviceEntry.modelData)
                onRightClicked: root.toggleActions(deviceEntry.modelData)
                onOverflowClicked: root.toggleActions(deviceEntry.modelData)
            }

            Text {
                width: parent.width - 24
                x: 12
                text: root.actionState(deviceEntry.modelData.address).error || root.detailFor(deviceEntry.modelData)
                color: root.actionState(deviceEntry.modelData.address).error ? Theme.error : Theme.foreground
                opacity: root.actionState(deviceEntry.modelData.address).error ? 1 : 0.62
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize - 2
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
            }

            PageRow {
                width: parent.width - 12
                x: 12
                visible: root.openActionsAddress === deviceEntry.modelData.address
                label: "Forget"
                onClicked: root.forgetDevice(deviceEntry.modelData.address)
            }
        }
    }

    PwObjectTracker {
        objects: root.hardwareSinks
    }
}
