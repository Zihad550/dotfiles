import QtQuick
import Quickshell
import qs

PopupWindow {
    id: root

    property Item target
    property string text: ""
    property bool shown: false

    anchor.item: target
    anchor.rect.x: target ? (target.width - root.width) / 2 : 0
    anchor.rect.y: target ? target.height : 0

    visible: shown && text !== ""
    color: "transparent"

    implicitWidth: content.implicitWidth + 16
    implicitHeight: content.implicitHeight + 10

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        Text {
            id: content

            anchors.centerIn: parent
            text: root.text
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            textFormat: Text.PlainText
            horizontalAlignment: Text.AlignHCenter
        }
    }
}
