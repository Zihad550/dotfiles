import QtQuick
import qs

// A compact circular action for the Quick Settings header.
Item {
    id: root

    property string icon: ""
    property string tooltipText: ""
    property bool focusVisible: false

    signal clicked(bool keyboard)

    implicitWidth: Theme.quickSettingsRowHeight
    implicitHeight: Theme.quickSettingsRowHeight
    activeFocusOnTab: root.enabled && root.visible
    scale: mouse.pressed ? 0.96 : 1

    function activate(event): void {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.clicked(true);
            event.accepted = true;
        }
    }

    Keys.onPressed: event => root.activate(event)

    Behavior on scale {
        NumberAnimation {
            duration: Theme.quickSettingsFastMotion
            easing.type: Easing.OutCubic
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: Theme.foreground
        opacity: mouse.containsMouse ? 0.16 : 0.08

        Behavior on opacity {
            NumberAnimation {
                duration: Theme.quickSettingsFastMotion
                easing.type: Easing.OutCubic
            }
        }
    }

    Text {
        anchors.centerIn: parent
        text: root.icon
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize + 1
        textFormat: Text.PlainText
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true

        onPressed: {
            root.forceActiveFocus();
            root.focusVisible = false;
        }
        onClicked: root.clicked(false)
    }

    onActiveFocusChanged: root.focusVisible = root.activeFocus

    Rectangle {
        anchors.fill: parent
        anchors.margins: 2
        radius: height / 2
        color: "transparent"
        border.color: Theme.accent
        border.width: root.focusVisible ? 2 : 0
    }

    Tooltip {
        target: root
        text: root.tooltipText
        shown: mouse.containsMouse || root.focusVisible
    }
}
