import QtQuick
import qs

// BacklightService is the single source of truth, shared by every
// per-monitor panel and by the media-key OSD. This control only requests an
// absolute target; it never raises the OSD itself.
Item {
    id: root

    readonly property bool available: BacklightService.available
    readonly property int percent: BacklightService.requested

    property bool sliderFocusVisible: false

    implicitHeight: Theme.quickSettingsRowHeight
    visible: root.available

    function setBrightness(value: int): void {
        BacklightService.setAbsolute(Math.max(0, Math.min(100, value)));
    }

    function setBrightnessFromX(x: real): void {
        root.setBrightness(Math.round(x / track.width * 100));
    }

    Text {
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: 48
        horizontalAlignment: Text.AlignHCenter
        text: "󰃠"
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize + 1
        textFormat: Text.PlainText
    }

    Item {
        id: track

        anchors.left: parent.left
        anchors.right: percentLabel.left
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: 48
        anchors.rightMargin: Theme.edgeMargin
        height: 12

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 5
            radius: height / 2
            color: Theme.foreground
            opacity: 0.25
        }

        Rectangle {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * Math.max(0, Math.min(100, root.percent)) / 100
            height: 5
            radius: height / 2
            color: Theme.accent
        }

        Rectangle {
            x: Math.max(0, Math.min(parent.width - width, parent.width * root.percent / 100 - width / 2))
            anchors.verticalCenter: parent.verticalCenter
            width: 12
            height: 12
            radius: height / 2
            color: Theme.accent
        }

        MouseArea {
            id: trackMouse

            anchors.fill: parent
            hoverEnabled: true
            preventStealing: true

            onPressed: event => root.setBrightnessFromX(event.x)
            onPositionChanged: event => {
                if (pressed)
                    root.setBrightnessFromX(event.x);
            }
            onWheel: event => {
                if (event.angleDelta.y > 0)
                    root.setBrightness(root.percent + 5);
                else if (event.angleDelta.y < 0)
                    root.setBrightness(root.percent - 5);
            }
        }

        Item {
            id: sliderFocus

            anchors.fill: parent
            activeFocusOnTab: root.available && root.visible
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Left || event.key === Qt.Key_Down)
                    root.setBrightness(root.percent - 5);
                else if (event.key === Qt.Key_Right || event.key === Qt.Key_Up)
                    root.setBrightness(root.percent + 5);
                else if (event.key === Qt.Key_Home)
                    root.setBrightness(0);
                else if (event.key === Qt.Key_End)
                    root.setBrightness(100);
                else
                    return;
                event.accepted = true;
            }
            onActiveFocusChanged: root.sliderFocusVisible = activeFocus
        }
    }

    // Fixed width, like Volume's own percentage text, so the row does not
    // resize as the number goes 9% -> 10% -> 100%.
    Text {
        id: percentLabel

        anchors.right: parent.right
        anchors.rightMargin: Theme.edgeMargin
        anchors.verticalCenter: parent.verticalCenter
        width: 44

        text: `${Math.max(0, Math.min(100, root.percent))}%`
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        font.weight: Font.DemiBold
        textFormat: Text.PlainText
        horizontalAlignment: Text.AlignRight
    }

    Tooltip {
        target: root
        text: `Brightness ${Math.max(0, Math.min(100, root.percent))}%`
        shown: root.sliderFocusVisible || trackMouse.containsMouse
    }
}
