import QtQuick
import qs

// A list control inside a Quick Settings Page. Rare secondary actions live
// behind the optional trailing overflow target and remain available by
// right-click on the main segment.
Item {
    id: root

    property string icon: ""
    property string label: ""
    property string detail: ""
    property bool overflowVisible: false
    property bool interactive: true
    property bool disclosureVisible: false
    property bool disclosureOpen: false
    property bool mainFocusVisible: false
    property bool overflowFocusVisible: false

    signal clicked(bool keyboard)
    signal pressed
    signal rightClicked
    signal overflowClicked

    function activateMain(event): void {
        if (!root.enabled || !root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.clicked(true);
            event.accepted = true;
        }
    }

    function activateOverflow(event): void {
        if (!root.enabled || !root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.overflowClicked();
            event.accepted = true;
        }
    }

    implicitHeight: Theme.quickSettingsRowHeight
    activeFocusOnTab: root.enabled && root.interactive && root.visible
    Keys.onPressed: event => root.activateMain(event)
    onActiveFocusChanged: root.mainFocusVisible = root.activeFocus
    opacity: root.enabled ? 1 : 0.45
    scale: root.interactive && (mainMouse.pressed || disclosureMouse.pressed || overflowMouse.pressed)
        ? 0.99 : 1

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
        radius: 10
        color: Theme.foreground
        opacity: mainMouse.containsMouse || overflowMouse.containsMouse ? 0.12 : 0.07

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
        anchors.right: root.overflowVisible ? overflowSegment.left
            : root.disclosureVisible ? disclosureSegment.left : parent.right

        Text {
            id: glyph

            visible: root.icon !== ""
            anchors.left: parent.left
            anchors.leftMargin: 12
            anchors.verticalCenter: parent.verticalCenter

            text: root.icon
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            textFormat: Text.PlainText
        }

        Text {
            id: labelText

            anchors.left: root.icon === "" ? parent.left : glyph.right
            anchors.leftMargin: 12
            anchors.right: detailText.visible ? detailText.left : parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter

            text: root.label
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            textFormat: Text.PlainText
            elide: Text.ElideRight
            maximumLineCount: 1
        }

        Text {
            id: detailText

            visible: root.detail !== ""
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, Math.max(0, parent.width * 0.45))

            text: root.detail
            color: Theme.foreground
            opacity: 0.62
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            textFormat: Text.PlainText
            elide: Text.ElideRight
            horizontalAlignment: Text.AlignRight
            maximumLineCount: 1
        }

        MouseArea {
            id: mainMouse

            anchors.fill: parent
            enabled: root.enabled && root.interactive
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton

            onPressed: {
                root.pressed();
                root.forceActiveFocus();
                root.mainFocusVisible = false;
            }
            onClicked: event => {
                if (event.button === Qt.RightButton)
                    root.rightClicked();
                else
                    root.clicked(false);
            }
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 2
            radius: 9
            color: "transparent"
            border.color: Theme.accent
            border.width: root.mainFocusVisible ? 2 : 0
        }
    }

    Item {
        id: disclosureSegment

        visible: root.disclosureVisible
        anchors.right: root.overflowVisible ? overflowSegment.left : parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 32

        Text {
            anchors.centerIn: parent
            text: root.disclosureOpen ? "⌃" : "⌄"
            color: Theme.foreground
            opacity: 0.72
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            textFormat: Text.PlainText
        }

        MouseArea {
            id: disclosureMouse

            anchors.fill: parent
            enabled: root.enabled && root.interactive
            hoverEnabled: true

            onPressed: {
                root.pressed();
                root.forceActiveFocus();
                root.mainFocusVisible = false;
            }
            onClicked: root.clicked(false)
        }
    }

    Item {
        id: overflowSegment

        visible: root.overflowVisible
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 40

        activeFocusOnTab: root.enabled && root.interactive && root.overflowVisible && root.visible
        Keys.onPressed: event => root.activateOverflow(event)
        onActiveFocusChanged: root.overflowFocusVisible = overflowSegment.activeFocus

        Text {
            anchors.centerIn: parent
            text: "⋮"
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 2
            textFormat: Text.PlainText
        }

        MouseArea {
            id: overflowMouse

            anchors.fill: parent
            enabled: root.enabled && root.interactive
            hoverEnabled: true

            onPressed: {
                overflowSegment.forceActiveFocus();
                root.overflowFocusVisible = false;
            }
            onClicked: root.overflowClicked()
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 3
            radius: 8
            color: "transparent"
            border.color: Theme.accent
            border.width: root.overflowFocusVisible ? 2 : 0
        }
    }

    Tooltip {
        target: root
        text: root.label
        shown: mainMouse.containsMouse || overflowMouse.containsMouse || root.mainFocusVisible || root.overflowFocusVisible
    }
}
