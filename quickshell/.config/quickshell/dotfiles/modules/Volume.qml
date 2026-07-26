import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import qs

// waybar: "pulseaudio", format "{icon}   {volume}%", scroll-step 5,
// on-click pavucontrol, tooltip "Playing at {volume}%".
BarItem {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property bool muted: sink?.audio?.muted ?? false
    readonly property int volume: sink?.audio ? Math.round(sink.audio.volume * 100) : 0

    readonly property var icons: ["", "", ""]

    text: {
        if (!sink?.audio)
            return "";
        if (muted)
            return "";
        const index = Math.min(icons.length - 1, Math.floor(volume / 100 * icons.length));
        return `${icons[index]}   ${volume}%`;
    }

    tooltipText: muted ? "Muted" : `Playing at ${volume}%`

    onClicked: Quickshell.execDetached(["pavucontrol"])
    onScrollUp: setVolume(volume + 5)
    onScrollDown: setVolume(volume - 5)

    function setVolume(percent: int): void {
        if (sink?.audio)
            sink.audio.volume = Math.max(0, Math.min(100, percent)) / 100;
    }

    // Pipewire object properties are only valid while the node is bound.
    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
