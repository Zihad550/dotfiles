import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import qs
import "lib/audio.js" as Audio

// The Audio Page deliberately uses PipeWire nodes for selection. pactl is only
// the compatibility source for port availability, which filters disconnected
// HDMI ports that PipeWire exposes while they are still registered.
QuickSettingsPage {
    id: root

    title: "Audio"

    signal closeRequested

    property var availableNames: []

    readonly property var hardwareSinks: Pipewire.nodes.values.filter(node => node.isSink && !node.isStream)
    readonly property var outputSinks: root.hardwareSinks.filter(node => root.availableNames.includes(node.name))

    function refresh(): void {
        if (root.active && !sinkList.running)
            sinkList.running = true;
    }

    function selectSink(node): void {
        if (node)
            Pipewire.preferredDefaultAudioSink = node;
    }

    function acceptSinkList(text: string): void {
        try {
            root.availableNames = Audio.availableSinkNames(JSON.parse(text));
        } catch (error) {
            console.warn(`dotfiles: could not read audio outputs: ${error}`);
        }
    }

    onActiveChanged: {
        if (root.active) {
            root.refresh();
            refreshTimer.restart();
            subscription.running = true;
        } else {
            root.availableNames = [];
            refreshTimer.stop();
            reconnectTimer.stop();
            sinkList.running = false;
            subscription.running = false;
        }
    }

    Process {
        id: sinkList

        command: ["pactl", "-f", "json", "list", "sinks"]

        stdout: StdioCollector {
            onStreamFinished: root.acceptSinkList(this.text)
        }
    }

    // pactl's event stream gives hotplug an immediate refresh; the timer is a
    // small recovery path for a missed event and for PipeWire node rebinding.
    Process {
        id: subscription

        command: ["pactl", "subscribe"]

        stdout: SplitParser {
            onRead: line => {
                if (line.includes("sink"))
                    root.refresh();
            }
        }

        onExited: {
            if (root.active)
                reconnectTimer.restart();
        }
    }

    Timer {
        id: refreshTimer

        interval: 1500
        repeat: true
        running: root.active
        onTriggered: root.refresh()
    }

    Timer {
        id: reconnectTimer

        interval: 1000
        onTriggered: {
            if (root.active)
                subscription.running = true;
        }
    }

    Repeater {
        model: root.outputSinks

        delegate: PageRow {
            id: outputRow

            required property var modelData

            width: root.width
            icon: "󰓃"
            label: modelData.description || modelData.nickname || modelData.name
            detail: modelData.name === Pipewire.defaultAudioSink?.name ? "Default" : ""

            onClicked: root.selectSink(outputRow.modelData)

        }
    }

    PageRow {
        width: root.width
        visible: root.outputSinks.length === 0
        enabled: false
        icon: "󰖁"
        label: "No audio outputs available"
    }

    PageRow {
        width: root.width
        icon: "󰒓"
        label: "Advanced audio settings"
        detail: "pavucontrol"

        onClicked: {
            Quickshell.execDetached(["pavucontrol"]);
            root.closeRequested();
        }
    }

    PwObjectTracker {
        objects: root.hardwareSinks
    }
}
