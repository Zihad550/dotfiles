import QtQuick
import qs

// The Bar's Layer Indicator. Shows only what Kanata confirmed; stopped and
// unavailable states read differently from Base.
Item {
    id: root

    readonly property var status: KanataService.layerStatus
    readonly property string text: `󰌌 ${root.status.short}`

    visible: KanataService.installed
    implicitWidth: label.implicitWidth + 16
    implicitHeight: Theme.barHeight

    Text {
        id: label

        anchors.centerIn: parent
        text: root.text
        color: {
            if (root.status.guided)
                return Theme.accent;
            if (root.status.id === "unknown" || root.status.id === "unavailable")
                return Theme.warn;
            return Theme.foreground;
        }
        opacity: root.status.id === "base" || root.status.id === "stopped" ? 0.6 : 1
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        font.bold: root.status.guided
        textFormat: Text.PlainText
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: guide.toggle()
    }

    KanataGuide {
        id: guide
        target: root
    }

    Tooltip {
        target: root
        text: `Kanata layer: ${root.status.label}`
        shown: mouse.containsMouse && !guide.shown
    }
}
