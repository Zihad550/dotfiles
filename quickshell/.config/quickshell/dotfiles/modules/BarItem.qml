import QtQuick
import Quickshell
import qs

// Shared chrome for every right-side module: text, click/scroll handling and a
// hover tooltip. Replaces what waybar's CSS did per-#id.
Item {
    id: root

    property string text: ""
    property color textColor: Theme.foreground
    property string tooltipText: ""

    // waybar style.css used `margin: 0 8px` on most modules, `min-width: 12px`.
    property real marginLeft: Theme.edgeMargin
    property real marginRight: Theme.edgeMargin
    property int minContentWidth: 12

    signal clicked
    signal rightClicked
    signal scrollUp
    signal scrollDown

    // An empty string hides the module entirely, matching waybar's behaviour
    // when a format resolves to "" (voxtype when idle).
    visible: text !== ""
    implicitWidth: visible ? Math.max(label.implicitWidth, minContentWidth) + marginLeft + marginRight : 0
    implicitHeight: Theme.barHeight

    Text {
        id: label

        anchors.centerIn: parent
        anchors.horizontalCenterOffset: (root.marginLeft - root.marginRight) / 2

        text: root.text
        color: root.textColor
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton

        onClicked: event => {
            if (event.button === Qt.RightButton)
                root.rightClicked();
            else
                root.clicked();
        }

        onWheel: event => {
            if (event.angleDelta.y > 0)
                root.scrollUp();
            else if (event.angleDelta.y < 0)
                root.scrollDown();
        }
    }

    Tooltip {
        target: root
        text: root.tooltipText
        shown: mouse.containsMouse
    }
}
