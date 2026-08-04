import QtQuick
import Quickshell
import qs

PanelWindow {
    id: bar

    required property var modelData
    screen: modelData

    anchors {
        top: true
        left: true
        right: true
    }

    implicitHeight: Theme.barHeight
    exclusiveZone: Theme.barHeight
    color: Theme.background

    Workspaces {
        anchors.left: parent.left
        anchors.leftMargin: Theme.edgeMargin
        anchors.verticalCenter: parent.verticalCenter
        barScreen: bar.modelData
    }

    Clock {
        anchors.centerIn: parent
    }

    Row {
        anchors.right: parent.right
        anchors.rightMargin: Theme.edgeMargin
        anchors.verticalCenter: parent.verticalCenter
        spacing: 0

        Voxtype {}
        Tailscale {}
        Battery {}

        // Network, bluetooth and volume moved into Quick Settings behind this.
        BarItem {
            id: gear

            text: "󰒓"
            textColor: quickSettings.shown ? Theme.accent : Theme.foreground
            // Deliberately no tooltip: it anchors where the panel opens.
            onClicked: quickSettings.toggle()
        }
    }

    QuickSettings {
        id: quickSettings

        target: gear
    }
}
