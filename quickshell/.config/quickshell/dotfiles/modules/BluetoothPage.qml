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
    property var pendingActions: ({})
    property var actionErrors: ({})
    property var failedActions: ({})
    property string openActionsAddress: ""
    property string pairingAddress: ""
    property string pairingFailure: ""
    property bool discoveryAcquired: false
    property var pendingAudioDevice: null
    property int audioAttempts: 0

    function deviceForAddress(address: string): var {
        return Bluetooth.devices.values.find(device => device.address === address) ?? null;
    }

    function setPending(address: string, action: string): void {
        root.pendingActions = Model.withAddressValue(root.pendingActions, address, action);
        if (action) {
            root.actionErrors = Model.withAddressValue(root.actionErrors, address, "");
            root.failedActions = Model.withAddressValue(root.failedActions, address, "");
            pendingTimeout.restart();
        }
    }

    function detailFor(row): string {
        const pending = root.pendingActions[row.address] || "";
        if (pending === "pairing") return "Pairing…";
        if (pending === "connecting") return "Connecting…";
        if (pending === "disconnecting") return "Disconnecting…";
        if (pending === "forgetting") return "Forgetting…";
        if (row.connected && row.batteryAvailable) return `Connected · ${row.batteryPercent}%`;
        if (row.connected) return "Connected";
        return row.paired ? "Paired" : "Available";
    }

    function activateDevice(row): void {
        if (!row || root.pendingActions[row.address]) return;
        const device = root.deviceForAddress(row.address);
        if (!device) {
            root.actionErrors = Model.withAddressValue(root.actionErrors, row.address, "Device is no longer available.");
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
                root.actionErrors = Model.withAddressValue(root.actionErrors, row.address, "Finish the current pairing attempt first.");
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
        if (root.pendingActions[address]) return;
        const device = root.deviceForAddress(address);
        root.openActionsAddress = "";
        if (!device) return;
        root.setPending(address, "forgetting");
        device.forget();
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
        for (const address in root.pendingActions) {
            const action = root.pendingActions[address];
            const device = root.deviceForAddress(address);
            if ((action === "pairing" || action === "connecting") && device?.connected) {
                root.scheduleAudioOutput(device);
                root.setPending(address, "");
            } else if (action === "disconnecting" && device && !device.connected) {
                root.setPending(address, "");
            } else if (action === "forgetting" && (!device || !device.paired && !device.bonded && !device.trusted)) {
                root.setPending(address, "");
            }
        }
        for (const address in root.failedActions) {
            const action = root.failedActions[address];
            const device = root.deviceForAddress(address);
            const connected = (action === "pairing" || action === "connecting") && device?.connected;
            if (connected
                    || action === "disconnecting" && device && !device.connected
                    || action === "forgetting" && (!device || !device.paired && !device.bonded && !device.trusted)) {
                if (connected)
                    root.scheduleAudioOutput(device);
                root.failedActions = Model.withAddressValue(root.failedActions, address, "");
                root.actionErrors = Model.withAddressValue(root.actionErrors, address, "");
            }
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
        root.pendingActions = ({});
        root.actionErrors = ({});
        root.failedActions = ({});
        root.openActionsAddress = "";
        root.pendingAudioDevice = null;
        audioSwitch.stop();
        pendingTimeout.stop();
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
                root.failedActions = Model.withAddressValue(root.failedActions, address, "pairing");
                root.actionErrors = Model.withAddressValue(
                    root.actionErrors,
                    address,
                    root.pairingFailure || "Pairing failed. Use bluetui for PIN or confirmation requests."
                );
                root.setPending(address, "");
            }
        }
    }

    Timer {
        id: pendingTimeout
        interval: 20000
        onTriggered: {
            let errors = root.actionErrors;
            let failures = root.failedActions;
            for (const address in root.pendingActions) {
                errors = Model.withAddressValue(errors, address, "Bluetooth did not confirm the requested change.");
                failures = Model.withAddressValue(failures, address, root.pendingActions[address]);
            }
            root.actionErrors = errors;
            root.failedActions = failures;
            root.pendingActions = ({});
        }
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
                enabled: !root.pendingActions[deviceEntry.modelData.address]
                icon: deviceEntry.modelData.icon || ""
                label: deviceEntry.modelData.label
                overflowVisible: deviceEntry.modelData.connected || deviceEntry.modelData.paired
                onClicked: root.activateDevice(deviceEntry.modelData)
                onRightClicked: root.openActionsAddress = root.openActionsAddress === deviceEntry.modelData.address ? "" : deviceEntry.modelData.address
                onOverflowClicked: root.openActionsAddress = root.openActionsAddress === deviceEntry.modelData.address ? "" : deviceEntry.modelData.address
            }

            Text {
                width: parent.width - 24
                x: 12
                text: root.actionErrors[deviceEntry.modelData.address] || root.detailFor(deviceEntry.modelData)
                color: root.actionErrors[deviceEntry.modelData.address] ? Theme.error : Theme.foreground
                opacity: root.actionErrors[deviceEntry.modelData.address] ? 1 : 0.62
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
