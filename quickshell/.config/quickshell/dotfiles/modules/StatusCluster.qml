import QtQuick
import Quickshell.Networking
import Quickshell.Services.Pipewire
import Quickshell.Services.UPower
import qs
import "lib/statusCluster.js" as Status

Item {
    id: root

    component Indicator: Text {
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    property bool panelShown: false

    signal clicked

    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) ?? null
    readonly property var wifiNetwork: wifiDevice?.networks.values.find(network => network.connected) ?? null
    readonly property bool wifiEnabled: Networking.wifiHardwareEnabled && Networking.wifiEnabled
    readonly property bool wiredConnected: Networking.devices.values.some(device => device.type === DeviceType.Wired && device.connected)

    readonly property var bluetoothRuntime: bluetoothLoader.item
    readonly property var bluetoothAdapter: root.bluetoothRuntime?.adapter ?? null
    readonly property int bluetoothConnectedCount: root.bluetoothRuntime?.connectedDevices?.length ?? 0

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property bool muted: sink?.audio?.muted ?? false
    readonly property int volume: sink?.audio ? Math.round(sink.audio.volume * 100) : 0

    readonly property UPowerDevice battery: UPower.displayDevice
    readonly property bool charging: battery?.state === UPowerDeviceState.Charging
    readonly property bool full: battery?.state === UPowerDeviceState.FullyCharged
    readonly property int batteryPercent: {
        const raw = battery?.percentage ?? 0;
        return Math.round(raw > 1 ? raw : raw * 100);
    }
    readonly property string batteryTone: Status.batteryTone(root.charging, root.batteryPercent)
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

    readonly property string networkTooltip: {
        if (root.wiredConnected)
            return "Wired connected";
        if (!root.wifiDevice)
            return "";
        if (!root.wifiEnabled)
            return "Wi-Fi disabled";
        if (!root.wifiNetwork)
            return "Wi-Fi disconnected";
        return `${root.wifiNetwork.name} (${Math.round(root.wifiNetwork.signalStrength * 100)}%)`;
    }

    readonly property string volumeTooltip: {
        if (!root.sink?.audio)
            return "Volume unavailable";
        return root.muted ? `Volume muted (${root.volume}%)` : `Volume ${root.volume}%`;
    }

    readonly property string batteryTooltip: {
        if (!root.battery?.isLaptopBattery)
            return "";
        const watts = Math.round(root.battery.changeRate ?? 0);
        return root.charging ? `Battery ${root.batteryPercent}% (${watts}W charging)` : `Battery ${root.batteryPercent}% (${watts}W discharging)`;
    }

    readonly property string tooltipText: [
        root.networkTooltip,
        TailscaleService.connected ? TailscaleService.tooltip : "",
        root.bluetoothAdapter?.enabled ? `Bluetooth (${root.bluetoothConnectedCount} connected)` : "",
        root.volumeTooltip,
        root.batteryTooltip
    ].filter(text => text !== "").join("\n")

    implicitWidth: indicators.implicitWidth + 16
    implicitHeight: Theme.barHeight

    Rectangle {
        anchors.fill: parent
        anchors.topMargin: 2
        anchors.bottomMargin: 2

        color: root.panelShown ? Theme.accent : Theme.foreground
        opacity: {
            if (root.panelShown)
                return 0.24;
            if (mouse.containsMouse)
                return 0.16;
            return 0.1;
        }
        radius: height / 2

        Behavior on opacity {
            NumberAnimation {
                duration: 120
                easing.type: Easing.OutCubic
            }
        }
    }

    Row {
        id: indicators

        anchors.centerIn: parent
        spacing: 8

        Indicator {
            visible: text !== ""
            text: Status.networkIcon({
                wiredConnected: root.wiredConnected,
                wifiAdapterExists: root.wifiDevice !== null,
                wifiEnabled: root.wifiEnabled,
                wifiConnected: root.wifiNetwork !== null,
                wifiStrength: root.wifiNetwork?.signalStrength ?? 0
            })
        }

        Indicator {
            visible: TailscaleService.connected
            text: TailscaleService.icon
            color: Theme.ok
        }

        Indicator {
            visible: root.bluetoothAdapter?.enabled ?? false
            text: ""
        }

        Indicator {
            text: Status.volumeIcon(!!root.sink?.audio, root.muted, root.volume)
            color: root.muted || !root.sink?.audio ? Theme.warn : Theme.foreground
        }

        Indicator {
            visible: root.battery?.isLaptopBattery ?? false
            text: Status.batteryIcon(root.charging, root.full, root.batteryPercent)
            color: root.batteryColor
        }
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true

        onClicked: root.clicked()
    }

    Tooltip {
        target: root
        text: root.tooltipText
        shown: mouse.containsMouse
    }

    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }

    Loader {
        id: bluetoothLoader

        active: BluetoothAvailability.available
        source: "BluetoothRuntime.qml"
    }
}
