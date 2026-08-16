import QtQuick
import qs

// A control on the primary Quick Settings surface. The main segment changes
// state; the optional chevron enters the control's Page.
Item {
    id: root

    property string icon: ""
    property string label: ""
    property bool active: false
    property bool busy: false
    property bool chevronVisible: false

    signal clicked
    signal chevronClicked

    readonly property bool interactive: root.enabled && !root.busy
    readonly property color settledColor: root.active
        ? Theme.accent
        : Qt.rgba(Theme.foreground.r, Theme.foreground.g, Theme.foreground.b, 0.12)

    function activateMain(event): void {
        if (!root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.clicked();
            event.accepted = true;
        }
    }

    function activateChevron(event): void {
        if (!root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.chevronClicked();
            event.accepted = true;
        }
    }

    implicitHeight: Theme.quickSettingsTileHeight
    activeFocusOnTab: root.interactive && root.visible
    opacity: root.enabled ? 1 : 0.45
    scale: mainMouse.pressed || chevronMouse.pressed ? 0.98 : 1

    Keys.onPressed: event => root.activateMain(event)

    Behavior on opacity {
        NumberAnimation {
            duration: Theme.quickSettingsFastMotion
            easing.type: Easing.OutCubic
        }
    }

    Behavior on scale {
        NumberAnimation {
            duration: Theme.quickSettingsFastMotion
            easing.type: Easing.OutCubic
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: root.settledColor

        Behavior on color {
            ColorAnimation {
                duration: Theme.quickSettingsFastMotion
                easing.type: Easing.OutCubic
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: Theme.foreground
        opacity: mainMouse.containsMouse || chevronMouse.containsMouse ? 0.10 : 0

        Behavior on opacity {
            NumberAnimation {
                duration: Theme.quickSettingsFastMotion
                easing.type: Easing.OutCubic
            }
        }
    }

    Item {
        id: mainSegment

        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: root.chevronVisible ? divider.left : parent.right

        Text {
            id: glyph

            anchors.left: parent.left
            anchors.leftMargin: 16
            anchors.verticalCenter: parent.verticalCenter

            text: root.icon
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 1
            textFormat: Text.PlainText
        }

        Text {
            anchors.left: glyph.right
            anchors.leftMargin: 10
            anchors.right: busyIndicator.visible ? busyIndicator.left : parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter

            text: root.label
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            font.weight: Font.DemiBold
            textFormat: Text.PlainText
            elide: Text.ElideRight
            maximumLineCount: 1
        }

        Text {
            id: busyIndicator

            visible: root.busy
            anchors.right: parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter

            text: "◌"
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize

            RotationAnimation on rotation {
                running: busyIndicator.visible
                from: 0
                to: 360
                duration: 900
                loops: Animation.Infinite
            }
        }

        MouseArea {
            id: mainMouse

            anchors.fill: parent
            enabled: root.interactive
            hoverEnabled: true

            onPressed: root.forceActiveFocus()
            onClicked: root.clicked()
        }
    }

    Rectangle {
        id: divider

        visible: root.chevronVisible
        anchors.right: chevronSegment.left
        anchors.verticalCenter: parent.verticalCenter
        width: 1
        height: parent.height - 16
        color: root.active ? Theme.background : Theme.foreground
        opacity: 0.22
    }

    Item {
        id: chevronSegment

        visible: root.chevronVisible
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 42

        activeFocusOnTab: root.interactive && root.chevronVisible && root.visible
        Keys.onPressed: event => root.activateChevron(event)

        Text {
            anchors.centerIn: parent
            text: "›"
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 4
            textFormat: Text.PlainText
        }

        MouseArea {
            id: chevronMouse

            anchors.fill: parent
            enabled: root.interactive
            hoverEnabled: true

            onPressed: chevronSegment.forceActiveFocus()
            onClicked: root.chevronClicked()
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 4
            radius: height / 2
            color: "transparent"
            border.color: root.active ? Theme.foreground : Theme.accent
            border.width: chevronSegment.activeFocus ? 2 : 0
        }
    }

    Rectangle {
        anchors.fill: mainSegment
        anchors.margins: 3
        radius: height / 2
        color: "transparent"
        border.color: root.active ? Theme.foreground : Theme.accent
        border.width: root.activeFocus ? 2 : 0
    }

    Tooltip {
        target: root
        text: root.label
        shown: mainMouse.containsMouse || chevronMouse.containsMouse || root.activeFocus || chevronSegment.activeFocus
    }
}
