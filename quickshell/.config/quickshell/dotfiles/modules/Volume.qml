import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import qs

// waybar: "pulseaudio", format "{icon}   {volume}%", scroll-step 5,
// on-click pavucontrol, tooltip "Playing at {volume}%".
//
// Now two lines in Quick Settings: a MenuRow header that keeps waybar's
// click-to-pavucontrol, and a drag slider under it. The slider replaces
// scrolling over the bar module; the wheel still works, but only over it.
Column {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property bool muted: sink?.audio?.muted ?? false
    readonly property int volume: sink?.audio ? Math.round(sink.audio.volume * 100) : 0

    readonly property var icons: ["", "", ""]

    signal closeRequested

    function setVolume(percent: int): void {
        if (sink?.audio)
            sink.audio.volume = Math.max(0, Math.min(100, percent)) / 100;
    }

    MenuRow {
        width: root.width

        icon: {
            if (!root.sink?.audio)
                return "";
            if (root.muted)
                return "";
            const index = Math.min(root.icons.length - 1, Math.floor(root.volume / 100 * root.icons.length));
            return root.icons[index];
        }

        label: "Volume"

        detail: {
            if (!root.sink?.audio)
                return "Unavailable";
            return root.muted ? "Muted" : `${root.volume}%`;
        }

        onClicked: Quickshell.execDetached(["pavucontrol"])
        onCloseRequested: root.closeRequested()
    }

    Item {
        id: slider

        width: root.width
        // Taller than the track so the whole strip is a drag target, and so the
        // track is not flush against the header above it.
        height: 22
        enabled: !!root.sink?.audio
        opacity: enabled ? 1 : 0.4

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 5
            radius: height / 2
            color: Theme.foreground
            opacity: 0.25
        }

        Rectangle {
            id: fill

            anchors.verticalCenter: parent.verticalCenter
            width: parent.width * Math.max(0, Math.min(100, root.volume)) / 100
            height: 5
            radius: height / 2
            color: root.muted ? Theme.warn : Theme.accent
        }

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            x: Math.max(0, Math.min(slider.width - width, fill.width - width / 2))
            width: 11
            height: 11
            radius: height / 2
            color: root.muted ? Theme.warn : Theme.accent
        }

        MouseArea {
            // Not `drag`: MouseArea already has a grouped property by that name,
            // which would win over the id inside these handlers.
            id: dragArea

            anchors.fill: parent
            // Keeps the drag once it starts, rather than losing it to whatever
            // else is watching the popup for mouse movement.
            preventStealing: true

            // Without hoverEnabled, positionChanged only fires while pressed.
            onPressed: event => root.setVolume(Math.round(event.x / slider.width * 100))
            onPositionChanged: event => root.setVolume(Math.round(event.x / slider.width * 100))

            onWheel: event => {
                if (event.angleDelta.y > 0)
                    root.setVolume(root.volume + 5);
                else if (event.angleDelta.y < 0)
                    root.setVolume(root.volume - 5);
            }
        }
    }

    // Pipewire object properties are only valid while the node is bound.
    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
