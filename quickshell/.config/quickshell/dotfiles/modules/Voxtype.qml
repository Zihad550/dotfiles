import QtQuick
import Quickshell
import Quickshell.Io
import qs

BarItem {
    id: root

    property string statusClass: ""
    property string tip: ""

    readonly property var icons: ({
        idle: "",
        recording: "󰍬",
        transcribing: "󰔟"
    })

    marginLeft: 7.5
    marginRight: 0

    text: icons[statusClass] ?? ""
    tooltipText: tip

    onClicked: Quickshell.execDetached(["df-voxtype-config"])
    onRightClicked: Quickshell.execDetached(["df-voxtype-edit"])

    Process {
        id: proc

        command: ["df-voxtype-status"]
        running: true

        stdout: SplitParser {
            onRead: line => {
                try {
                    const status = JSON.parse(line);
                    root.statusClass = status.class ?? "idle";
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
