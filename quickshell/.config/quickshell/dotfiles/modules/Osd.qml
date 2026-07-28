import QtQuick
import Quickshell
import qs

// The overlay swayosd-server used to draw: a pill near the bottom of the
// screen with an icon, a level bar, and optionally a line of text.
//
// Same window strategy as NotificationPopup: no window at all while idle, and
// `screen` left unset so the compositor puts it on the active monitor. That
// replaces swayosd-client's `--monitor "$(hyprctl monitors -j | jq ...)"`,
// which spawned two processes on every single volume keypress.
Scope {
    id: root

    LazyLoader {
        active: OsdService.shown

        PanelWindow {
            anchors.bottom: true
            margins.bottom: Theme.osdMargin

            // Reserve nothing: this floats over whatever is on screen.
            exclusiveZone: 0
            color: "transparent"

            implicitWidth: Theme.osdWidth
            implicitHeight: Theme.osdHeight

            Rectangle {
                anchors.fill: parent
                color: Theme.background
                border.color: Theme.accent
                border.width: 1
                radius: 8

                Text {
                    id: glyph

                    anchors.left: parent.left
                    anchors.leftMargin: Theme.notificationPadding
                    anchors.verticalCenter: parent.verticalCenter

                    visible: OsdService.icon !== ""
                    text: OsdService.icon
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.osdIconSize
                    textFormat: Text.PlainText
                }

                // swayosd's `show_percentage = true`. Fixed width rather than
                // hugging the text, so the bar does not resize as the number
                // goes 9% -> 10% -> 100%.
                Text {
                    id: percent

                    anchors.right: parent.right
                    anchors.rightMargin: Theme.notificationPadding
                    anchors.verticalCenter: parent.verticalCenter

                    visible: OsdService.value >= 0
                    width: 44
                    text: `${Math.round(Math.max(0, Math.min(1, OsdService.value)) * 100)}%`
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    textFormat: Text.PlainText
                    horizontalAlignment: Text.AlignRight
                }

                // The level bar, for the keys that change a level. Messages
                // (mic mute, output switch) pass -1 and get the text below.
                Item {
                    anchors.left: glyph.visible ? glyph.right : parent.left
                    anchors.leftMargin: Theme.notificationPadding
                    anchors.right: percent.visible ? percent.left : parent.right
                    anchors.rightMargin: Theme.notificationPadding
                    anchors.verticalCenter: parent.verticalCenter

                    visible: OsdService.value >= 0
                    height: 6

                    Rectangle {
                        anchors.fill: parent
                        radius: height / 2
                        color: Theme.foreground
                        opacity: 0.25
                    }

                    Rectangle {
                        width: parent.width * Math.max(0, Math.min(1, OsdService.value))
                        height: parent.height
                        radius: height / 2
                        color: Theme.accent

                        // swayosd animated its bar; a hard jump on a key repeat
                        // reads as flicker.
                        Behavior on width {
                            NumberAnimation {
                                duration: 80
                                easing.type: Easing.OutCubic
                            }
                        }
                    }
                }

                Text {
                    anchors.left: glyph.visible ? glyph.right : parent.left
                    anchors.leftMargin: Theme.notificationPadding
                    anchors.right: parent.right
                    anchors.rightMargin: Theme.notificationPadding
                    anchors.verticalCenter: parent.verticalCenter

                    visible: OsdService.value < 0 && OsdService.text !== ""
                    text: OsdService.text
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }
            }
        }
    }
}
