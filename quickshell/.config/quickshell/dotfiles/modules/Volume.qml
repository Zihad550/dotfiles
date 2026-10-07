import QtQuick
import Quickshell.Services.Pipewire
import qs
import "lib/statusCluster.js" as Status
import "lib/audio.js" as Audio

// The effective default sink is the single source of truth for the primary
// surface. The chevron is the only route to the output-selection Page.
Item {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property bool available: !!root.sink?.audio
    readonly property bool muted: root.sink?.audio?.muted ?? false
    readonly property int volume: Math.round(Audio.enabledChannelVolume(root.sink?.audio?.volumes ?? [], root.sink?.audio?.channels ?? [], root.savedChannelVolumes) * 100)
    property var savedVolumesBySink: ({})
    readonly property var savedChannelVolumes: root.savedVolumesBySink[root.sink?.name] ?? ({})

    function saveChannelVolumes(saved): void {
        if (root.sink)
            root.savedVolumesBySink = Object.assign({}, root.savedVolumesBySink, { [root.sink.name]: saved });
    }

    Connections {
        target: root.sink?.audio ?? null

        function onVolumesChanged(): void {
            const saved = Object.assign({}, root.savedChannelVolumes);
            const channels = root.sink.audio.channels;
            const volumes = root.sink.audio.volumes;
            let changed = false;
            for (let index = 0; index < channels.length; index++) {
                if (volumes[index] > 0 && saved[channels[index]] !== undefined) {
                    delete saved[channels[index]];
                    changed = true;
                }
            }
            if (changed)
                root.saveChannelVolumes(saved);
        }
    }
    readonly property string icon: Status.volumeIcon(root.available, root.muted, root.volume)

    property bool sliderFocusVisible: false
    property bool muteFocusVisible: false
    property bool pageFocusVisible: false

    signal pageRequested(bool keyboard)

    implicitHeight: Theme.quickSettingsRowHeight
    activeFocusOnTab: root.enabled && root.visible

    function setVolume(percent: int): void {
        if (root.sink?.audio)
            root.sink.audio.volumes = Audio.setEnabledChannelVolume(root.sink.audio.volumes, root.sink.audio.channels, root.savedChannelVolumes, Math.max(0, Math.min(100, percent)) / 100);
    }

    function toggleChannel(channel: int): void {
        const audio = root.sink?.audio;
        const index = audio ? Array.from(audio.channels).indexOf(channel) : -1;
        if (index < 0)
            return;
        const volumes = Array.from(audio.volumes);
        const saved = Object.assign({}, root.savedChannelVolumes);
        if (volumes[index] > 0) {
            saved[channel] = volumes[index];
            volumes[index] = 0;
        } else {
            volumes[index] = saved[channel] ?? Math.max(root.volume / 100, 0.5);
            delete saved[channel];
        }
        root.saveChannelVolumes(saved);
        audio.volumes = volumes;
    }

    function toggleMute(): void {
        if (!root.sink?.audio)
            return;
        root.sink.audio.muted = !root.sink.audio.muted;
    }

    function setVolumeFromX(x: real): void {
        root.setVolume(Math.round(x / track.width * 100));
    }

    Item {
        id: track

        anchors.left: channelButtons.right
        anchors.right: percentLabel.left
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: 8
        anchors.rightMargin: Theme.edgeMargin
        height: 12

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 5
            radius: height / 2
            color: Theme.foreground
            opacity: root.available ? 0.25 : 0.12
        }

        Rectangle {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * Math.max(0, Math.min(100, root.volume)) / 100
            height: 5
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
            id: trackMouse

            // No `enabled: root.available` gate: setVolume() is already a
            // no-op without a sink, and disabling the MouseArea outright
            // would also suppress hover, leaving the Tooltip unreachable
            // over the slider's own hit area while unavailable.
            anchors.fill: parent
            hoverEnabled: true
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

    // Fixed width, like the OSD's own percentage text, so the row does not
    // resize as the number goes 9% -> 10% -> 100%.
    Text {
        id: percentLabel

        anchors.right: pageTarget.left
        anchors.verticalCenter: parent.verticalCenter
        width: 44

        visible: root.available
        text: `${Math.max(0, Math.min(100, root.volume))}%`
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
        horizontalAlignment: Text.AlignRight
    }

    // Kept separate from percentLabel, which hides while unavailable: this
    // hit area stays live regardless, so hover doesn't drop the Tooltip
    // crossing the gap between the track and the chevron.
    Item {
        anchors.right: pageTarget.left
        anchors.verticalCenter: parent.verticalCenter
        width: 44
        height: track.height

        MouseArea {
            id: percentMouse

            anchors.fill: parent
            hoverEnabled: true
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
            id: muteMouse

            anchors.fill: parent
            hoverEnabled: true
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

    Row {
        id: channelButtons

        anchors.left: muteTarget.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: 4

        Repeater {
            model: [PwAudioChannel.FrontLeft, PwAudioChannel.FrontRight].filter(channel => Array.from(root.sink?.audio?.channels ?? []).includes(channel))

            delegate: Item {
                id: channelButton

                required property int modelData
                readonly property int channelIndex: Array.from(root.sink?.audio?.channels ?? []).indexOf(modelData)
                readonly property bool silenced: (root.sink?.audio?.volumes[channelIndex] ?? 0) === 0
                readonly property string channelName: modelData === PwAudioChannel.FrontLeft ? "Left" : "Right"
                property bool focusVisible: false

                width: 30
                height: Theme.quickSettingsRowHeight
                activeFocusOnTab: root.enabled && root.visible
                onActiveFocusChanged: focusVisible = activeFocus
                Keys.onPressed: event => {
                    if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                        root.toggleChannel(modelData);
                        event.accepted = true;
                    }
                }

                Rectangle {
                    anchors.fill: parent
                    anchors.topMargin: 6
                    anchors.bottomMargin: 6
                    radius: 6
                    color: channelButton.silenced ? Theme.warn : Theme.accent
                    opacity: channelMouse.containsMouse ? 0.25 : 0.12
                }

                Text {
                    anchors.centerIn: parent
                    text: channelButton.modelData === PwAudioChannel.FrontLeft ? "L" : "R"
                    color: channelButton.silenced || root.muted ? Theme.warn : Theme.accent
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    textFormat: Text.PlainText
                }

                Rectangle {
                    anchors.fill: parent
                    anchors.margins: 2
                    radius: 6
                    color: "transparent"
                    border.color: Theme.accent
                    border.width: channelButton.focusVisible ? 2 : 0
                }

                MouseArea {
                    id: channelMouse

                    anchors.fill: parent
                    hoverEnabled: true
                    onPressed: {
                        channelButton.forceActiveFocus();
                        channelButton.focusVisible = false;
                    }
                    onClicked: root.toggleChannel(channelButton.modelData)
                }

                Tooltip {
                    target: channelButton
                    text: `${channelButton.channelName} speaker: ${channelButton.silenced ? "disabled" : "enabled"}. Click to ${channelButton.silenced ? "enable" : "disable"}.`
                    shown: channelMouse.containsMouse || channelButton.focusVisible
                }
            }
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
            id: pageMouse

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
        shown: root.muteFocusVisible || muteMouse.containsMouse || root.sliderFocusVisible || trackMouse.containsMouse || percentMouse.containsMouse || root.pageFocusVisible || pageMouse.containsMouse
    }

    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
