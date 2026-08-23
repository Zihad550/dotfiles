const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Status = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/statusCluster.js");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

async function tailscaleStatus(t, statusCommand) {
    const mockBin = fs.mkdtempSync(path.join(os.tmpdir(), "status-cluster-test-"));
    const tailscale = path.join(mockBin, "tailscale");
    fs.writeFileSync(tailscale, `#!/bin/sh\n${statusCommand}\n`);
    fs.chmodSync(tailscale, 0o755);
    t.after(() => fs.rmSync(mockBin, { recursive: true, force: true }));

    const script = path.join(dotfilesRoot, "scripts/tailscale-status.sh");
    const child = childProcess.spawn(script, [], {
        env: { ...process.env, PATH: `${mockBin}:${process.env.PATH}` },
    });

    return await new Promise((resolve, reject) => {
        let stdout = "";
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error("tailscale status stream produced no initial state"));
        }, 2000);

        child.stdout.on("data", chunk => {
            stdout += chunk;
            const newline = stdout.indexOf("\n");
            if (newline < 0)
                return;
            clearTimeout(timeout);
            child.kill();
            resolve(JSON.parse(stdout.slice(0, newline)));
        });
        child.on("error", error => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

test("the Status Cluster is the one Quick Settings opener and anchor on each bar", () => {
    const bar = source("modules/Bar.qml");

    assert.match(bar, /Voxtype\s*{}[\s\S]*StatusCluster\s*{/);
    assert.match(bar, /onClicked:\s*quickSettings\.toggle\(false\)/);
    assert.match(bar, /QuickSettings\s*{[\s\S]*target:\s*statusCluster/);
    assert.match(bar, /Component\.onCompleted:\s*QuickSettingsRegistry\.register\(bar\.monitorName, quickSettings\)/);
    assert.match(bar, /Component\.onDestruction:\s*QuickSettingsRegistry\.unregister\(bar\.monitorName, quickSettings\)/);
    assert.doesNotMatch(bar, /\bTailscale\s*{}/);
    assert.doesNotMatch(bar, /\bBattery\s*{}/);
    assert.doesNotMatch(bar, /id:\s*gear/);
});

test("hardware-disabled Wi-Fi uses the disabled state", () => {
    const cluster = source("modules/StatusCluster.qml");

    assert.match(cluster, /wifiEnabled:\s*Networking\.wifiHardwareEnabled\s*&&\s*Networking\.wifiEnabled/);
});

test("Tailscale daemon failures are disconnected", async t => {
    const status = await tailscaleStatus(t, `
if [ "$1" = "status" ]; then
    echo "failed to connect to local tailscaled" >&2
    exit 1
fi
exit 1`);

    assert.strictEqual(status.class, "disconnected");
});

test("Tailscale Running state is connected", async t => {
    const status = await tailscaleStatus(t, `
if [ "$1" = "status" ]; then
    printf '%s\\n' '{"BackendState":"Running","TailscaleIPs":["100.64.0.1"]}'
    exit 0
fi
exit 1`);

    assert.strictEqual(status.class, "connected");
});

test("connected status carries the tailnet name", async t => {
    const status = await tailscaleStatus(t, `
if [ "$1" = "status" ]; then
    printf '%s\\n' '{"BackendState":"Running","CurrentTailnet":{"Name":"mamacrm.com"},"TailscaleIPs":["100.64.0.1"]}'
    exit 0
fi
exit 1`);

    assert.strictEqual(status.class, "connected");
    assert.strictEqual(status.tailnet, "mamacrm.com");
});

test("disconnected status clears the tailnet name", async t => {
    const status = await tailscaleStatus(t, `
if [ "$1" = "status" ]; then
    printf '%s\\n' '{"BackendState":"Stopped","CurrentTailnet":{"Name":"mamacrm.com"}}'
    exit 0
fi
exit 1`);

    assert.strictEqual(status.class, "disconnected");
    assert.strictEqual(status.tailnet, "");
});

function networkState(overrides) {
    return {
        wiredConnected: false,
        wifiAdapterExists: true,
        wifiEnabled: true,
        wifiConnected: false,
        wifiStrength: 0,
        ...overrides,
    };
}

test("wired takes precedence over every Wi-Fi state", () => {
    assert.strictEqual(Status.networkIcon(networkState({ wiredConnected: true, wifiConnected: true })), "󰀂");
    assert.strictEqual(Status.networkIcon(networkState({ wiredConnected: true, wifiAdapterExists: false })), "󰀂");
});

test("Wi-Fi remains visible with distinct connected, disconnected, and disabled glyphs", () => {
    assert.strictEqual(Status.networkIcon(networkState({ wifiConnected: true, wifiStrength: 1 })), "󰤨");
    assert.strictEqual(Status.networkIcon(networkState()), "󰤮");
    assert.strictEqual(Status.networkIcon(networkState({ wifiEnabled: false })), "󰤭");
    assert.strictEqual(Status.networkIcon(networkState({ wifiAdapterExists: false })), "");
});

test("volume glyph follows mute and effective output level", () => {
    assert.strictEqual(Status.volumeIcon(false, false, 50), "");
    assert.strictEqual(Status.volumeIcon(true, true, 80), "");
    assert.strictEqual(Status.volumeIcon(true, false, 0), "");
    assert.strictEqual(Status.volumeIcon(true, false, 50), "");
    assert.strictEqual(Status.volumeIcon(true, false, 100), "");
});

test("battery glyph follows charging state and charge level", () => {
    assert.strictEqual(Status.batteryIcon(true, false, 9), "󰢜");
    assert.strictEqual(Status.batteryIcon(false, false, 9), "󰁺");
    assert.strictEqual(Status.batteryIcon(false, false, 54), "󰁿");
    assert.strictEqual(Status.batteryIcon(false, true, 100), "󰂅");
});

test("battery tone changes at the specified thresholds", () => {
    assert.strictEqual(Status.batteryTone(true, 1), "ok");
    assert.strictEqual(Status.batteryTone(false, 95), "ok");
    assert.strictEqual(Status.batteryTone(false, 94), "foreground");
    assert.strictEqual(Status.batteryTone(false, 31), "foreground");
    assert.strictEqual(Status.batteryTone(false, 30), "warn");
    assert.strictEqual(Status.batteryTone(false, 11), "warn");
    assert.strictEqual(Status.batteryTone(false, 10), "error");
});
