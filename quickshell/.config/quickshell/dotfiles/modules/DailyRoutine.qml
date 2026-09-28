import QtQuick
import Quickshell
import Quickshell.Wayland
import qs

PanelWindow {
    id: root

    required property var modelData
    screen: modelData

    anchors.top: true
    anchors.right: true
    margins.top: Theme.barHeight + 16
    margins.right: 16
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.layer: WlrLayer.Bottom
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    implicitWidth: Math.min(340, root.screen ? root.screen.width - 32 : 340)
    implicitHeight: Math.min(card.implicitHeight, root.screen ? root.screen.height - Theme.barHeight - 32 : 600)
    color: "transparent"

    Rectangle {
        id: card

        width: root.width
        implicitHeight: content.implicitHeight + 32
        radius: 16
        color: Qt.rgba(Theme.background.r, Theme.background.g, Theme.background.b, 0.92)
        border.color: Qt.rgba(Theme.foreground.r, Theme.foreground.g, Theme.foreground.b, 0.18)

        Column {
            id: content

            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: 16
            spacing: 12

            Row {
                spacing: 8

                Text {
                    text: "Daily routine"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: 17
                    font.bold: true
                }

                Text {
                    text: `${RoutineState.todayItems.filter(item => item.completed).length}/${RoutineState.todayItems.length}`
                    color: Theme.accent
                    font.family: Theme.fontFamily
                    font.pixelSize: 13
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            Flickable {
                width: parent.width
                implicitHeight: Math.min(list.implicitHeight, root.screen ? Math.max(40, root.screen.height - Theme.barHeight - 155) : 500)
                contentHeight: list.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds

                Column {
                    id: list
                    width: parent.width
                    spacing: 4

                    Text {
                        width: parent.width
                        visible: RoutineState.ready && RoutineState.todayItems.length === 0
                        text: "Add your first item below"
                        color: Theme.foreground
                        opacity: 0.65
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 1
                    }

                    Repeater {
                        model: RoutineState.todayItems

                        Row {
                            id: entry
                            required property var modelData
                            width: list.width
                            spacing: 8

                            Rectangle {
                                id: checkbox
                                width: 20
                                height: 20
                                radius: 5
                                color: entry.modelData.completed ? Theme.accent : "transparent"
                                border.color: Theme.accent
                                anchors.verticalCenter: parent.verticalCenter

                                Text {
                                    anchors.centerIn: parent
                                    visible: entry.modelData.completed
                                    text: "✓"
                                    color: Theme.background
                                    font.pixelSize: 14
                                    font.bold: true
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: RoutineState.toggle(entry.modelData.id)
                                }
                            }

                            Text {
                                width: entry.width - checkbox.width - removeButton.width - 2 * entry.spacing
                                text: entry.modelData.text
                                wrapMode: Text.Wrap
                                color: Theme.foreground
                                opacity: entry.modelData.completed ? 0.55 : 1
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize
                                font.strikeout: entry.modelData.completed
                                anchors.verticalCenter: parent.verticalCenter

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: RoutineState.toggle(entry.modelData.id)
                                }
                            }

                            Text {
                                id: removeButton
                                text: "×"
                                color: Theme.foreground
                                opacity: 0.65
                                font.pixelSize: 20
                                anchors.verticalCenter: parent.verticalCenter

                                MouseArea {
                                    anchors.fill: parent
                                    onClicked: RoutineState.remove(entry.modelData.id)
                                }
                            }
                        }
                    }
                }
            }

            Rectangle {
                width: parent.width
                height: 34
                radius: 8
                color: Qt.rgba(Theme.foreground.r, Theme.foreground.g, Theme.foreground.b, 0.08)

                TextInput {
                    id: input
                    anchors.fill: parent
                    anchors.leftMargin: 10
                    anchors.rightMargin: 10
                    verticalAlignment: TextInput.AlignVCenter
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    selectByMouse: true
                    enabled: RoutineState.ready
                    clip: true

                    Text {
                        anchors.fill: parent
                        verticalAlignment: Text.AlignVCenter
                        visible: !input.text && !input.activeFocus
                        text: RoutineState.ready ? "Add an item and press Enter" : "Loading routine..."
                        color: Theme.foreground
                        opacity: 0.55
                        font: input.font
                    }

                    onAccepted: {
                        if (!text.trim())
                            return;
                        RoutineState.add(text);
                        clear();
                    }
                }
            }
        }
    }
}
