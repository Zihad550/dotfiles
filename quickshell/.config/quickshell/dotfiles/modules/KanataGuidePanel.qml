import QtQuick
import qs
import "lib/kanataLayers.js" as Layers

// The Layer Guide's keyboard: one key per physical position, showing what it
// produces on the selected layer. KanataGuide.qml owns the window around it.
Rectangle {
    id: root

    property string selectedLayer: "base"
    property int keySize: 44
    readonly property int gap: 5
    readonly property int step: root.keySize + root.gap
    // Row stagger of a US keyboard, in key widths. Rows 0 and 1 start at Tab and
    // Caps Lock; row 3 is the Space bar.
    readonly property var offsets: [0, 0.25, 1.75, 3.75]
    readonly property string title: `${Layers.LAYERS[root.selectedLayer].label} · ${Layers.LAYERS[root.selectedLayer].activation ?? "Default layer"}`
    readonly property int rowCount: rows.count

    width: content.width + 2 * Theme.notificationPadding
    height: content.height + 2 * Theme.notificationPadding
    color: Theme.background
    border.color: Theme.accent
    border.width: 1
    radius: 10

    Column {
        id: content

        x: Theme.notificationPadding
        y: Theme.notificationPadding
        spacing: root.gap

        Text {
            text: root.title
            color: Theme.accent
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            font.bold: true
            textFormat: Text.PlainText
        }

        Repeater {
            id: rows

            model: Layers.guideRows(root.selectedLayer)

            delegate: Row {
                required property var modelData
                required property int index

                leftPadding: Math.round(root.offsets[index] * root.step)
                spacing: root.gap

                Repeater {
                    model: parent.modelData

                    delegate: Rectangle {
                        required property var modelData

                        width: modelData.key === "spc" ? 4 * root.step - root.gap : root.keySize
                        height: root.keySize
                        radius: 6
                        color: {
                            if (modelData.trigger)
                                return Theme.accent;
                            if (modelData.mapped)
                                return Qt.alpha(Theme.accent, 0.22);
                            return Qt.alpha(Theme.foreground, 0.07);
                        }
                        border.color: modelData.mapped ? Theme.accent : Qt.alpha(Theme.foreground, 0.2)
                        border.width: 1

                        Text {
                            x: 4
                            y: 2
                            text: modelData.name
                            color: modelData.trigger ? Theme.background : Theme.foreground
                            opacity: 0.7
                            font.family: Theme.fontFamily
                            font.pixelSize: Math.round(root.keySize * 0.22)
                            textFormat: Text.PlainText
                        }

                        Text {
                            anchors.centerIn: parent
                            text: modelData.trigger ? "held" : modelData.output
                            color: modelData.trigger ? Theme.background : Theme.foreground
                            opacity: modelData.mapped || modelData.trigger ? 1 : 0.55
                            font.family: Theme.fontFamily
                            font.pixelSize: Math.round(root.keySize * (modelData.trigger || modelData.output.length > 3 ? 0.24 : 0.34))
                            font.bold: modelData.mapped || modelData.trigger
                            textFormat: Text.PlainText
                        }

                        Text {
                            anchors.bottom: parent.bottom
                            anchors.bottomMargin: 2
                            anchors.horizontalCenter: parent.horizontalCenter
                            visible: !modelData.trigger && modelData.hold !== ""
                            text: modelData.hold
                            color: Theme.warn
                            font.family: Theme.fontFamily
                            font.pixelSize: Math.round(root.keySize * 0.2)
                            textFormat: Text.PlainText
                        }
                    }
                }
            }
        }
    }
}
