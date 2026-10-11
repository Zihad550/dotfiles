const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

test("QML speaker writes survive stale hardware volume, rapid slider changes, and output switches", t => {
    const binary = spawnSync("quickshell", ["-V"]);
    if (binary.error?.code === "ENOENT") {
        t.skip("quickshell is unavailable");
        return;
    }
    assert.ifError(binary.error);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-backend-test-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const config = path.join(directory, "config");
    const runtime = path.join(directory, "runtime");
    const bin = path.join(directory, "bin");
    fs.cpSync(root, config, { recursive: true });
    fs.mkdirSync(runtime, { mode: 0o700 });
    fs.mkdirSync(bin);
    const stateFile = path.join(directory, "backend.json");
    const commandsFile = path.join(directory, "commands.json");
    const portFile = path.join(directory, "port.json");
    const slowReadFile = path.join(directory, "slow-read");
    fs.writeFileSync(portFile, JSON.stringify("speaker"));
    fs.writeFileSync(stateFile, JSON.stringify({ main: [26214, 26214], second: [52429, 52429], failure: [26214, 26214] }));
    fs.writeFileSync(commandsFile, "[]");
    fs.writeFileSync(path.join(bin, "pactl"), `#!${process.execPath}
const fs = require("node:fs");
const stateFile = ${JSON.stringify(stateFile)};
const commandsFile = ${JSON.stringify(commandsFile)};
const portFile = ${JSON.stringify(portFile)};
const slowReadFile = ${JSON.stringify(slowReadFile)};
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
if (args[0] === "set-test-port") {
    fs.writeFileSync(portFile, JSON.stringify(args[1]));
} else if (args[0] === "set-test-slow-read") {
    fs.writeFileSync(slowReadFile, "");
} else if (args[0] === "set-sink-volume") {
    if (args[1] === "failure") { console.error("fixture write rejected"); process.exit(1); }
    state[args[1]] = args.slice(2).map(Number);
    fs.writeFileSync(stateFile, JSON.stringify(state));
    const commands = JSON.parse(fs.readFileSync(commandsFile, "utf8"));
    commands.push(args);
    fs.writeFileSync(commandsFile, JSON.stringify(commands));
} else if (args[0] === "subscribe") {
    // Stay connected so the reconnect timer's refreshes cannot mask a dropped event.
    const parent = process.ppid;
    setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 50);
} else {
    const port = JSON.parse(fs.readFileSync(portFile, "utf8"));
    console.log(JSON.stringify(Object.entries(state).map(([name, values]) => ({
        name, channel_map: "front-right,front-left",
        active_port: name === "second" ? "headphones" : port,
        ports: [{ name: "speaker", type: "Speaker" }, { name: "headphones", type: "Headphones" }],
        volume: { "front-right": { value: values[0] }, "front-left": { value: values[1] } }
    }))));
    // One-shot: hold a stale read open so a port change lands while it is in flight.
    if (fs.existsSync(slowReadFile)) {
        fs.rmSync(slowReadFile);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
}
`, { mode: 0o755 });
    const serviceFile = path.join(config, "AudioService.qml");
    fs.writeFileSync(serviceFile, fs.readFileSync(serviceFile, "utf8").replace(
        "readonly property PwNode sink: Pipewire.defaultAudioSink",
        `property QtObject sink: QtObject {
            property string name: "main"
            property bool ready: true
            property QtObject audio: QtObject {
                property var channels: [PwAudioChannel.FrontLeft, PwAudioChannel.FrontRight]
                property var volumes: [0.4, 0.4]
                property bool muted: false
            }
        }`,
    ).replace("objects: root.sink ? [root.sink] : []", "objects: []"));
    const volumeFile = path.join(config, "modules/Volume.qml");
    fs.writeFileSync(volumeFile, fs.readFileSync(volumeFile, "utf8").replace("readonly property PwNode sink:", "readonly property var sink:"));
    fs.writeFileSync(path.join(config, "shell.qml"), `import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import Quickshell.Io
import qs
import "modules"
import "modules/lib/statusCluster.js" as Status
ShellRoot {
    Volume { id: control; width: 400 }
    Volume { id: otherMonitor; width: 400 }
    property int step: 0
    readonly property string headphonesIcon: Status.volumeIcon(true, false, 100, true)
    readonly property string headphonesMutedIcon: Status.volumeIcon(true, true, 100, true)
    readonly property string speakerMutedIcon: Status.volumeIcon(true, true, 100, false)
    Process {
        id: portSwitch
        command: ["sh", "-c", "sleep 0.1 && exec pactl set-test-port headphones"]
        onExited: AudioService.refreshVolumes()
    }
    Process {
        id: slowRead
        command: ["pactl", "set-test-slow-read"]
        onExited: {
            AudioService.refreshVolumes();
            portSwitch.running = true;
        }
    }
    Component.onCompleted: {
        control.toggleChannel(PwAudioChannel.FrontLeft);
        check(Object.keys(AudioService.savedChannelVolumes).length === 0, "initial click must wait for confirmed channel order");
        // The stand-in sink never changes, so nothing else triggers the first read.
        AudioService.refreshVolumes();
    }
    function check(condition, message): void { if (!condition) throw new Error(message); }
    Timer {
        interval: 30; running: true; repeat: true
        onTriggered: {
            if (AudioService.activeWrite || AudioService.writes.length || !AudioService.backendBySink.main) return;
            if (slowRead.running || portSwitch.running || (step === 14 && !AudioService.usesHeadphones) || (step === 15 && AudioService.usesHeadphones)) return;
            switch (step++) {
            case 0: control.setVolume(40); break;
            case 1: control.toggleChannel(PwAudioChannel.FrontRight); break;
            case 2: control.setVolume(75); break;
            case 3:
                check(AudioService.volumes[0] === 0 && Math.abs(AudioService.volumes[1] - 0.75) < 0.001 && control.volume === 75, "slider must change the enabled side while the other stays silent");
                otherMonitor.toggleChannel(PwAudioChannel.FrontRight); break;
            case 4:
                check(AudioService.volumes.every(v => Math.abs(v - 0.75) < 0.001), "both channels must reset to equal volume");
                control.toggleChannel(PwAudioChannel.FrontLeft); break;
            case 5:
                check(AudioService.volumes[1] === 0 && control.volume === 75, "left must really be silent after raising volume");
                control.setVolume(0); control.setVolume(60); break;
            case 6:
                check(AudioService.volumes[1] === 0 && control.volume === 60, "rapid slider changes must preserve disable");
                AudioService.sink.name = "second";
                check(AudioService.usesHeadphones && control.icon === headphonesIcon, "output switch must select headphone icon");
                control.setVolume(20);
                AudioService.sink.name = "main";
                break;
            case 7:
                check(AudioService.savedChannelVolumes[PwAudioChannel.FrontLeft] !== undefined, "returning output must remember disabled channel");
                otherMonitor.toggleChannel(PwAudioChannel.FrontLeft); break;
            case 8:
                check(AudioService.volumes.every(v => Math.abs(v - 0.6) < 0.001), "both enabled after output switch must synchronize");
                control.toggleChannel(PwAudioChannel.FrontLeft);
                control.toggleChannel(PwAudioChannel.FrontRight); break;
            case 9:
                check(AudioService.volumes.every(v => v === 0) && control.volume === 60, "both disabled must remember shared volume");
                control.setVolume(85); break;
            case 10:
                check(AudioService.volumes.every(v => v === 0) && control.volume === 85, "slider must update shared level without enabling either side");
                otherMonitor.toggleChannel(PwAudioChannel.FrontLeft); break;
            case 11:
                check(AudioService.volumes[0] === 0 && Math.abs(AudioService.volumes[1] - 0.85) < 0.001, "first re-enabled side must use the latest shared level");
                control.toggleChannel(PwAudioChannel.FrontRight); break;
            case 12:
                check(AudioService.volumes.every(v => Math.abs(v - 0.85) < 0.001), "second side must use the same shared level");
                AudioService.sink.name = "failure";
                control.toggleChannel(PwAudioChannel.FrontLeft); break;
            case 13:
                check(AudioService.error !== "", "failed backend writes must be reported");
                check(AudioService.savedChannelVolumes[PwAudioChannel.FrontLeft] === undefined, "failed disable must roll back selection");
                AudioService.sink.name = "main";
                check(!AudioService.usesHeadphones && control.icon !== headphonesIcon, "speaker output must restore volume icon");
                // Start a slow read, then switch the port while that read is in flight.
                slowRead.running = true;
                break;
            case 14:
                check(control.icon === headphonesIcon && otherMonitor.icon === headphonesIcon, "port change during a stale read must update both panels");
                control.toggleMute();
                check(AudioService.sink.audio.muted && control.icon === headphonesMutedIcon, "headphone button must mute and show headphones-off");
                portSwitch.command = ["pactl", "set-test-port", "speaker"];
                portSwitch.running = true;
                break;
            case 15:
                check(control.icon === speakerMutedIcon, "speaker port must restore muted speaker icon");
                control.toggleMute();
                check(!AudioService.sink.audio.muted, "speaker button must still unmute");
                console.log("PASS: acknowledged stereo controls");
                Qt.quit();
            }
        }
    }
}`);
    const result = spawnSync("quickshell", ["-p", config], {
        env: { ...process.env, QT_QPA_PLATFORM: "offscreen", XDG_RUNTIME_DIR: runtime, PATH: `${bin}:${process.env.PATH}` },
        encoding: "utf8", timeout: 8000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.strictEqual(result.status, 0, output);
    assert.match(output, /PASS: acknowledged stereo controls/);
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assert.deepStrictEqual(state.main, [55706, 55706]);
    assert.deepStrictEqual(state.second, [13107, 13107]);
    assert.deepStrictEqual(state.failure, [26214, 26214]);
    const commands = JSON.parse(fs.readFileSync(commandsFile, "utf8"));
    assert.ok(commands.some(args => args[1] === "main" && args[2] === "49152" && args[3] === "0"));
});
