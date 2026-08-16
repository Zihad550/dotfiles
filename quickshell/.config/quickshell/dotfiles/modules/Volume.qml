import QtQuick
import Quickshell.Services.Pipewire
import qs
import "lib/statusCluster.js" as Status

// The effective default sink is the single source of truth for the primary
// surface. The chevron is the only route to the output-selection Page.
Item {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property bool available: !!root.sink?.audio
    readonly property bool muted: root.sink?.audio?.muted ?? false
    readonly property int volume: root.sink?.audio ? Math.round(root.sink.audio.volume * 100) : 0
    readonly property string icon: Status.volumeIcon(root.available, root.muted, root.volume)

    property bool sliderFocusVisible: false
    property bool muteFocusVisible: false
    property bool pageFocusVisible: false

    signal pageRequested(bool keyboard)

    implicitHeight: Theme.quickSettingsRowHeight
    activeFocusOnTab: root.enabled && root.visible

    function setVolume(percent: int): void {
        if (root.sink?.audio)
            root.sink.audio.volume = Math.max(0, Math.min(100, percent)) / 100;
    }

    function toggleMute(): void {
        if (!root.sink?.audio)
            return;
        root.sink.audio.muted = !root.sink.audio.muted;
    }

    function setVolumeFromX(x: real): void {
        root.setVolume(Math.round(x / track.width * 100));
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: Theme.foreground
        opacity: root.available ? 0.10 : 0.06
    }

    Rectangle {
        id: fill

        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: parent.width * Math.max(0, Math.min(100, root.volume)) / 100
        radius: height / 2
        color: root.muted ? Theme.warn : Theme.accent
        opacity: root.available ? 0.22 : 0.08
    }

    Rectangle {
        id: track

        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: 48
        anchors.rightMargin: 48
        height: 5
        radius: height / 2
        color: Theme.foreground
        opacity: root.available ? 0.25 : 0.12

        Rectangle {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            width: parent.width * Math.max(0, Math.min(100, root.volume)) / 100
            radius: height / 2
            color: root.muted ? Theme.warn : Theme.accent
        }

        Rectangle {
            x: Math.max(0, Math.min(parent.width - width, parent.width * root.volume / 100 - width / 2))
            anchors.verticalCenter: parent.verticalCenter
            width: 12
            height: 12
            radius: height / 2
            color: root.muted ? Theme.warn : Theme.accent
            visible: root.available
        }

        MouseArea {
            anchors.fill: parent
            enabled: root.available
            preventStealing: true

            onPressed: event => root.setVolumeFromX(event.x)
            onPositionChanged: event => {
                if (pressed)
                    root.setVolumeFromX(event.x);
            }
            onWheel: event => {
                if (event.angleDelta.y > 0)
                    root.setVolume(root.volume + 5);
                else if (event.angleDelta.y < 0)
                    root.setVolume(root.volume - 5);
            }
        }

        Item {
            id: sliderFocus

            anchors.fill: parent
            activeFocusOnTab: root.available && root.visible
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Left || event.key === Qt.Key_Down)
                    root.setVolume(root.volume - 5);
                else if (event.key === Qt.Key_Right || event.key === Qt.Key_Up)
                    root.setVolume(root.volume + 5);
                else if (event.key === Qt.Key_Home)
                    root.setVolume(0);
                else if (event.key === Qt.Key_End)
                    root.setVolume(100);
                else
                    return;
                event.accepted = true;
            }
            onActiveFocusChanged: root.sliderFocusVisible = activeFocus
        }
    }

    Item {
        id: muteTarget

        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: 48
        height: parent.height
        activeFocusOnTab: root.visible
        Keys.onPressed: event => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                root.toggleMute();
                event.accepted = true;
            }
        }
        onActiveFocusChanged: root.muteFocusVisible = activeFocus

        Text {
            anchors.centerIn: parent
            text: root.icon
            color: root.muted ? Theme.warn : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 1
            textFormat: Text.PlainText
        }

        MouseArea {
            anchors.fill: parent
            onPressed: {
                muteTarget.forceActiveFocus();
                root.muteFocusVisible = false;
            }
            onClicked: root.toggleMute()
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 3
            radius: height / 2
            color: "transparent"
            border.color: Theme.accent
            border.width: root.muteFocusVisible ? 2 : 0
        }
    }

    Item {
        id: pageTarget

        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: 48
        height: parent.height
        activeFocusOnTab: root.visible
        Keys.onPressed: event => {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                root.pageRequested(true);
                event.accepted = true;
            }
        }
        onActiveFocusChanged: root.pageFocusVisible = activeFocus

        Text {
            anchors.centerIn: parent
            text: "›"
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 4
            textFormat: Text.PlainText
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onPressed: {
                pageTarget.forceActiveFocus();
                root.pageFocusVisible = false;
            }
            onClicked: root.pageRequested(false)
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 3
            radius: height / 2
            color: "transparent"
            border.color: Theme.accent
            border.width: root.pageFocusVisible ? 2 : 0
        }
    }

    Tooltip {
        target: root
        text: root.available ? `Volume ${root.volume}%${root.muted ? " (muted)" : ""}` : "Volume unavailable"
        shown: root.muteFocusVisible || root.sliderFocusVisible || root.pageFocusVisible
    }

    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
