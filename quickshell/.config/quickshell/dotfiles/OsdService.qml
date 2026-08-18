pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire

// The on-screen display, replacing swayosd-server.
//
// swayosd was a client/server pair: the media keys ran `swayosd-client
// --output-volume raise`, which asked the server to both *apply* the change and
// draw the overlay. Both halves live here now -- shell.qml exposes this over
// IPC and hypr/lua/bindings/media.lua calls `qs -c dotfiles ipc call osd ...`.
//
// Volume is applied through Pipewire directly rather than by shelling out, so
// the bar's volume slider and this stay on one source of truth. BacklightService
// likewise owns brightness state and execution for every caller.
//
// Not replaced: swayosd's caps/num-lock indicators, which need its
// libinput backend reading /dev/input. autostart.lua never started that.
Singleton {
    id: root

    // What the overlay is currently showing. `value` is 0.0-1.0, or -1 for the
    // messages that have no bar (mic mute, audio output switch).
    property string icon: ""
    property real value: -1
    property string text: ""
    property bool shown: false

    // swayosd's default was 1s of visibility; a little longer reads better when
    // a message rather than a bar is on screen.
    readonly property int timeout: 1500

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property PwNode source: Pipewire.defaultAudioSource

    readonly property var volumeIcons: ["", "", ""]
    readonly property string mutedIcon: ""

    function show(icon: string, value: real, text: string): void {
        root.icon = icon;
        root.value = value;
        root.text = text;
        root.shown = true;
        hide.restart();
    }

    // `--output-volume raise|lower|+1|-1`.
    //
    // Raise and lower are separate entry points, and steps are always positive,
    // because these arrive as CLI arguments: `qs ipc call osd volume -5` would
    // have the argument parser reading `-5` as an option, not a value.
    function volumeRaise(step: string): void {
        adjustVolume(parseStep(step));
    }

    function volumeLower(step: string): void {
        adjustVolume(-parseStep(step));
    }

    function adjustVolume(step: int): void {
        if (!sink?.audio || step === 0)
            return;

        const current = Math.round(sink.audio.volume * 100);
        sink.audio.volume = Math.max(0, Math.min(100, current + step)) / 100;

        // swayosd unmutes when you raise from muted; without this the bar moves
        // and nothing comes out.
        if (step > 0 && sink.audio.muted)
            sink.audio.muted = false;

        showVolume();
    }

    // Steps come from the keybinds as strings. A missing or unparseable one
    // falls back to swayosd's 5% default rather than doing nothing visible.
    function parseStep(step: string): int {
        const parsed = parseInt(step, 10);
        return isNaN(parsed) || parsed <= 0 ? 5 : parsed;
    }

    // `--output-volume mute-toggle`.
    function volumeMute(): void {
        if (!sink?.audio)
            return;
        sink.audio.muted = !sink.audio.muted;
        showVolume();
    }

    // `--input-volume mute-toggle`. No bar: the mic's own level is not what the
    // key changed, and showing it invites adjusting the wrong thing.
    function micMute(): void {
        if (!source?.audio)
            return;
        source.audio.muted = !source.audio.muted;
        show(source.audio.muted ? "󰍭" : "󰍬", -1, source.audio.muted ? "Microphone muted" : "Microphone on");
    }

    // `--brightness raise|lower|+1|-1`.
    function brightnessRaise(step: string): void {
        BacklightService.raise(parseStep(step));
    }

    function brightnessLower(step: string): void {
        BacklightService.lower(parseStep(step));
    }

    // `--playerctl next|previous|play-pause`.
    function player(action: string): void {
        if (action === "next")
            show("󰒭", -1, "");
        else if (action === "previous")
            show("󰒮", -1, "");

        // play-pause draws nothing yet: which icon is right depends on the
        // state the player lands in, which the status read below reports.
        playerProc.command = ["sh", "-c", `playerctl ${action} >/dev/null 2>&1; playerctl status 2>/dev/null || true`];
        playerProc.running = true;
    }

    // `--custom-message`, used by df-hypr-audio-switch.
    function message(text: string): void {
        show("", -1, text);
    }

    // df-hypr-audio-switch also passed `--custom-icon sink-volume-<level>-symbolic`
    // alongside its message. The level name is mapped to a glyph here so no
    // nerd font codepoint has to survive a trip through a shell script.
    function outputSwitched(name: string, level: string): void {
        const icons = {
            "muted": root.mutedIcon,
            "low": root.volumeIcons[0],
            "medium": root.volumeIcons[1],
            "high": root.volumeIcons[2]
        };
        show(icons[level] ?? "", -1, name);
    }

    function showVolume(): void {
        if (!sink?.audio)
            return;
        const percent = Math.round(sink.audio.volume * 100);
        if (sink.audio.muted) {
            show(root.mutedIcon, percent / 100, "");
            return;
        }
        const index = Math.min(volumeIcons.length - 1, Math.floor(percent / 100 * volumeIcons.length));
        show(volumeIcons[index], percent / 100, "");
    }

    Timer {
        id: hide

        interval: root.timeout
        onTriggered: root.shown = false
    }

    Connections {
        target: BacklightService
        function onConfirmed(percent: int): void {
            root.show("󰃠", percent / 100, "");
        }
    }

    Process {
        id: playerProc

        stdout: SplitParser {
            onRead: line => {
                const status = line.trim();
                if (status === "Playing")
                    root.show("󰐊", -1, "");
                else if (status === "Paused" || status === "Stopped")
                    root.show("󰏤", -1, "");
            }
        }
    }

    // Pipewire node properties are only valid while the node is bound.
    PwObjectTracker {
        objects: [root.sink, root.source].filter(node => node !== null)
    }
}
