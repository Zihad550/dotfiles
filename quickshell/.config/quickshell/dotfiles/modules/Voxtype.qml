import QtQuick
import Quickshell
import Quickshell.Io
import qs

// waybar: "custom/voxtype", exec df-voxtype-status, return-type json.
//
// df-voxtype-status runs `voxtype status --follow` and streams one JSON object
// per line, so this is a single long-lived process read by SplitParser rather
// than a re-exec on a timer.
BarItem {
    id: root

    property string statusClass: ""
    property string tip: ""

    readonly property var icons: ({
        idle: "",
        recording: "󰍬",
        transcribing: "󰔟"
    })

    // style.css: #custom-voxtype { margin: 0 0 0 7.5px }
    marginLeft: 7.5
    marginRight: 0

    text: icons[statusClass] ?? ""
    tooltipText: tip

    onClicked: Quickshell.execDetached(["df-voxtype-model"])
    onRightClicked: Quickshell.execDetached(["df-voxtype-config"])

    Process {
        id: proc

        command: ["df-voxtype-status"]
        running: true

        stdout: SplitParser {
            onRead: line => {
                try {
                    const status = JSON.parse(line);
                    root.statusClass = status.alt ?? "";
                    root.tip = status.tooltip ?? "";
                } catch (e) {
                    // Ignore partial or non-JSON lines.
                }
            }
        }

        onExited: restart.start()
    }

    Timer {
        id: restart

        interval: 2000
        onTriggered: proc.running = true
    }
}
