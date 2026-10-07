pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Services.Pipewire
import "modules/lib/audio.js" as Audio

// Backend confirmation and channel-selection contract: see docs/audio-channels.md.
Singleton {
    id: root

    readonly property PwNode sink: Pipewire.defaultAudioSink
    readonly property var stereoChannelIds: ({ "front-left": PwAudioChannel.FrontLeft, "front-right": PwAudioChannel.FrontRight })
    readonly property var channels: root.backendChannelMapsBySink[root.sink?.name]?.map((channel, index) => root.stereoChannelIds[channel] ?? root.sink?.audio?.channels[index]) ?? root.sink?.audio?.channels ?? []
    readonly property var requestedWrite: root.writes.slice().reverse().find(write => write.sinkName === root.sink?.name) ?? (root.activeWrite?.sinkName === root.sink?.name ? root.activeWrite : null)
    readonly property var volumes: root.requestedWrite?.volumes ?? root.backendVolumesBySink[root.sink?.name] ?? root.sink?.audio?.volumes ?? []
    readonly property bool writable: !!root.sink?.ready && !!root.backendVolumesBySink[root.sink.name] && !!root.backendChannelMapsBySink[root.sink.name]
    readonly property var savedChannelVolumes: root.savedVolumesBySink[root.sink?.name] ?? ({})
    readonly property int volume: Math.round(Audio.sharedChannelVolume(root.volumes, root.channels, root.savedChannelVolumes) * 100)

    property var savedVolumesBySink: ({})
    property var backendVolumesBySink: ({})
    property var backendChannelMapsBySink: ({})
    property var writes: []
    property var activeWrite: null
    property string error: ""

    onSinkChanged: root.refreshVolumes()

    function saveChannelVolumes(sinkName: string, saved): void {
        root.savedVolumesBySink = Object.assign({}, root.savedVolumesBySink, { [sinkName]: saved });
    }

    function setVolume(percent: int): void {
        if (!root.writable || !root.sink.audio || root.volumes.length !== root.channels.length)
            return;
        const volume = Math.max(0, Math.min(100, percent)) / 100;
        const previousSaved = root.savedChannelVolumes;
        const saved = {};
        for (const channel of Object.keys(previousSaved))
            saved[channel] = volume;
        const volumes = Audio.setEnabledChannelVolume(root.volumes, root.channels, saved, volume);
        root.saveChannelVolumes(root.sink.name, saved);
        root.queueWrite(volumes, previousSaved);
    }

    function toggleChannel(channel: int): void {
        if (!root.writable || !root.sink.audio || root.volumes.length !== root.channels.length || !Array.from(root.channels).includes(channel))
            return;
        const previousSaved = root.savedChannelVolumes;
        const result = Audio.toggleSpeakerChannel(root.volumes, root.channels, previousSaved, channel);
        root.saveChannelVolumes(root.sink.name, result.savedVolumes);
        root.queueWrite(result.volumes, previousSaved);
    }

    function queueWrite(volumes, previousSaved): void {
        const sinkName = root.sink.name;
        const queued = root.writes.find(write => write.sinkName === sinkName);
        const pending = queued ?? (root.activeWrite?.sinkName === sinkName ? root.activeWrite : null);
        const write = { sinkName: sinkName, volumes: Array.from(volumes), savedVolumes: root.savedChannelVolumes, previousSaved: pending?.previousSaved ?? previousSaved };
        // Keep the latest drag position per output; never overlap backend writes.
        root.writes = root.writes.filter(queued => queued.sinkName !== sinkName).concat([write]);
        root.startNextWrite();
    }

    function startNextWrite(): void {
        if (volumeWriter.running || volumeReader.running || root.activeWrite || root.writes.length === 0)
            return;
        root.activeWrite = root.writes[0];
        root.writes = root.writes.slice(1);
        root.error = "";
        volumeWriter.command = ["pactl", "set-sink-volume", root.activeWrite.sinkName].concat(root.activeWrite.volumes.map(volume => `${Math.round(volume * 65536)}`));
        volumeWriter.running = true;
    }

    function finishWrite(success: bool): void {
        const write = root.activeWrite;
        if (write) {
            if (success) {
                root.writes = root.writes.map(queued => queued.sinkName === write.sinkName ? Object.assign({}, queued, { previousSaved: write.savedVolumes }) : queued);
            } else {
                root.error = "Could not change speaker volume";
                if (!root.writes.some(queued => queued.sinkName === write.sinkName))
                    root.saveChannelVolumes(write.sinkName, write.previousSaved);
            }
        }
        root.activeWrite = null;
        Qt.callLater(root.startNextWrite);
    }

    function refreshVolumes(): void {
        if (!volumeWriter.running && !volumeReader.running)
            volumeReader.running = true;
    }

    Process {
        id: volumeWriter

        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            if (exitCode !== 0 || exitStatus !== 0) {
                console.warn(`dotfiles: could not write speaker volume: ${volumeWriter.stderr.text.trim()}`);
                root.finishWrite(false);
            } else {
                root.refreshVolumes();
            }
        }
    }

    Process {
        id: volumeReader

        command: ["pactl", "-f", "json", "list", "sinks"]
        stdout: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            let success = false;
            if (exitCode === 0 && exitStatus === 0) {
                try {
                    const sinks = JSON.parse(volumeReader.stdout.text);
                    const backend = {};
                    const channelMaps = {};
                    for (const sink of sinks) {
                        const volumes = Audio.sinkChannelVolumes(sink);
                        if (volumes) {
                            backend[sink.name] = volumes;
                            channelMaps[sink.name] = sink.channel_map.split(",");
                        }
                    }
                    root.backendChannelMapsBySink = channelMaps;
                    root.backendVolumesBySink = backend;
                    const write = root.activeWrite;
                    success = !write || Audio.channelVolumesMatch(backend[write.sinkName], write.volumes);
                } catch (error) {
                    console.warn(`dotfiles: could not read speaker volumes: ${error}`);
                }
            }
            root.finishWrite(success);
        }
    }

    Process {
        id: subscription

        command: ["pactl", "subscribe"]
        running: !!root.sink
        stdout: SplitParser {
            onRead: line => {
                if (line.includes(" on sink #"))
                    root.refreshVolumes();
            }
        }
        onExited: {
            if (root.sink)
                reconnectTimer.restart();
        }
    }

    Timer {
        id: reconnectTimer

        interval: 1000
        onTriggered: {
            if (root.sink) {
                root.refreshVolumes();
                subscription.running = true;
            }
        }
    }

    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
