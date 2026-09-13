const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const Model = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/bluetooth.js");

test("Bluetooth rows use stable values and deterministic groups", () => {
    const groups = Model.deviceGroups([
        { name: "AA:BB:CC:DD:EE:FF", address: "1" },
        { name: "Mouse", paired: true, address: "2" },
        { name: "Headphones", connected: true, batteryAvailable: true, battery: 0.72, address: "3" },
        { name: "Keyboard", address: "4" },
        { name: "Adapter", connected: true, address: "5" },
        { name: "0000110b-0000-1000-8000-00805f9b34fb", address: "6" },
    ]);

    assert.deepStrictEqual(groups.connected.map(row => row.label), ["Adapter", "Headphones"]);
    assert.deepStrictEqual(groups.paired.map(row => row.label), ["Mouse"]);
    assert.deepStrictEqual(groups.available.map(row => row.label), ["Keyboard"]);
    assert.deepStrictEqual(groups.connected[1], {
        address: "3",
        label: "Headphones",
        icon: "",
        connected: true,
        paired: false,
        batteryAvailable: true,
        batteryPercent: 72,
    });
});

test("Bluetooth pending and failure maps change immutably", () => {
    const pending = { "AA:BB": "connecting" };
    const next = Model.withAddressValue(pending, "CC:DD", "pairing");
    const cleared = Model.withAddressValue(next, "AA:BB", "");

    assert.deepStrictEqual(pending, { "AA:BB": "connecting" });
    assert.deepStrictEqual(next, { "AA:BB": "connecting", "CC:DD": "pairing" });
    assert.deepStrictEqual(cleared, { "CC:DD": "pairing" });
});

test("Bluetooth audio output matching prefers an address over a duplicate display name", () => {
    const sinks = [
        { id: 1, isSink: true, isStream: false, ready: true, name: "bluez_output.11_22_33_44_55_66.1", properties: { "device.product.name": "Buds" } },
        { id: 2, isSink: true, isStream: false, ready: true, name: "bluez_output.AA_BB_CC_DD_EE_FF.1", properties: { "device.product.name": "Buds" } },
    ];

    assert.strictEqual(Model.bluetoothSinkForDevice(sinks, { address: "AA:BB:CC:DD:EE:FF", name: "Buds" }), sinks[1]);
    assert.strictEqual(Model.bluetoothSinkForDevice([
        { id: 3, isSink: true, isStream: false, ready: true, name: "alsa_output.usb", properties: { "device.product.name": "Buds" } },
    ], { address: "AA:BB:CC:DD:EE:FF", name: "Buds" }).id, 3);
});

function fakeBluetoothctl() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-bluetooth-"));
    const executable = path.join(directory, "bluetoothctl");
    fs.writeFileSync(executable, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_BLUETOOTH_LOG"
case "$1" in
  show) printf '\\tPowered: %s\\n' "\${FAKE_POWERED:-yes}" ;;
  power) exit "\${FAKE_POWER_EXIT:-0}" ;;
  --agent) sleep "\${FAKE_PAIR_SLEEP:-0}"; exit "\${FAKE_PAIR_EXIT:-0}" ;;
  trust) exit "\${FAKE_TRUST_EXIT:-0}" ;;
  connect) exit "\${FAKE_CONNECT_EXIT:-0}" ;;
esac
`);
    fs.chmodSync(executable, 0o755);
    return directory;
}

function runPair(directory, address, overrides = {}) {
    const log = path.join(directory, "calls.log");
    return {
        log,
        result: childProcess.spawnSync(path.join(repoRoot, "bin/df-bluetooth-pair"), [address], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${directory}:/usr/bin:/bin`,
                FAKE_BLUETOOTH_LOG: log,
                DF_BLUETOOTH_PAIR_TIMEOUT: "1",
                ...overrides,
            },
        }),
    };
}

test("Bluetooth pairing rejects invalid addresses before invoking bluetoothctl", t => {
    const directory = fakeBluetoothctl();
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const run = runPair(directory, "not-an-address");

    assert.notStrictEqual(run.result.status, 0);
    assert.match(run.result.stderr, /valid Bluetooth address/i);
    assert.strictEqual(fs.existsSync(run.log), false);
});

test("Bluetooth pairing powers on, scopes its agent, then trusts and connects", t => {
    const directory = fakeBluetoothctl();
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const run = runPair(directory, "AA:BB:CC:DD:EE:FF", { FAKE_POWERED: "no" });

    assert.strictEqual(run.result.status, 0, run.result.stderr);
    assert.deepStrictEqual(fs.readFileSync(run.log, "utf8").trim().split("\n"), [
        "show",
        "power on",
        "--agent NoInputNoOutput pair AA:BB:CC:DD:EE:FF",
        "trust AA:BB:CC:DD:EE:FF",
        "connect AA:BB:CC:DD:EE:FF",
    ]);
});

test("Bluetooth pairing reports timeouts and suggests the interactive fallback", t => {
    const directory = fakeBluetoothctl();
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const run = runPair(directory, "AA:BB:CC:DD:EE:FF", { FAKE_PAIR_SLEEP: "2" });

    assert.notStrictEqual(run.result.status, 0);
    assert.match(run.result.stderr, /timed out/i);
    assert.match(run.result.stderr, /bluetui/i);
});

test("Bluetooth pairing returns a useful message when bluetoothctl fails", t => {
    const directory = fakeBluetoothctl();
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const run = runPair(directory, "AA:BB:CC:DD:EE:FF", { FAKE_PAIR_EXIT: "1" });

    assert.notStrictEqual(run.result.status, 0);
    assert.match(run.result.stderr, /native pairing failed/i);
    assert.match(run.result.stderr, /PIN or confirmation/i);
});

test("Bluetooth audio handoff sets both defaults and moves only application streams", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-bluetooth-audio-"));
    const log = path.join(directory, "calls.log");
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    for (const command of ["wpctl", "pactl"]) {
        const executable = path.join(directory, command);
        fs.writeFileSync(executable, `#!/bin/sh
printf '${command} %s\\n' "$*" >> "$FAKE_AUDIO_LOG"
if [ "$*" = "list sink-inputs" ]; then
cat <<'EOF'
Sink Input #41
    application.name = "Firefox"
Sink Input #42
    media.name = "filter-chain output"
Sink Input #43
    application.name = "EasyEffects"
EOF
fi
`);
        fs.chmodSync(executable, 0o755);
    }

    const result = childProcess.spawnSync(path.join(repoRoot, "bin/df-audio-output-set-default"), ["12", "bluez_output.test"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${directory}:/usr/bin:/bin`, FAKE_AUDIO_LOG: log },
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(fs.readFileSync(log, "utf8").trim().split("\n"), [
        "wpctl set-default 12",
        "pactl set-default-sink bluez_output.test",
        "pactl list sink-inputs",
        "pactl move-sink-input 41 bluez_output.test",
    ]);
});
