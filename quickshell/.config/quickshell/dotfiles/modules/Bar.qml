import QtQuick
import Quickshell
import qs

PanelWindow {
    id: bar

    required property var modelData
    screen: modelData

    // Snapshotted imperatively, not left as a live binding on modelData.name:
    // on monitor unplug the ShellScreen can fire its own change signals
    // while tearing down, which a `: modelData.name` binding would still be
    // subscribed to. Assigning once here freezes the value before that.
    property string monitorName
    Component.onCompleted: bar.monitorName = modelData.name

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
        StatusCluster {
            id: statusCluster

            panelShown: quickSettings.shown
            onClicked: quickSettings.toggle()
        }
    }

    QuickSettings {
        id: quickSettings

        target: statusCluster

        // Lets SUPER+CTRL+A (hypr/.config/hypr/lua/bindings/utilities.lua)
        // find this monitor's panel via shell.qml's GlobalShortcut -- see
        // QuickSettingsRegistry.qml.
        Component.onCompleted: QuickSettingsRegistry.register(bar.monitorName, quickSettings)
        Component.onDestruction: QuickSettingsRegistry.unregister(bar.monitorName, quickSettings)
    }
}
