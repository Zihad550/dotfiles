const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const shellDir = path.join(repo, "quickshell/.config/quickshell/dotfiles");
const hasQuickshell = spawnSync("quickshell", ["--version"]).status === 0;

// A Kanata TCP server fixture speaking the newline-delimited JSON protocol.
function kanataServer() {
    const server = net.createServer();
    const fixture = { current: "base", beforeSnapshot: [], sockets: [], requests: 0 };
    server.on("connection", socket => {
        fixture.sockets.push(socket);
        let buffered = "";
        socket.on("data", data => {
            buffered += data;
            let newline;
            while ((newline = buffered.indexOf("\n")) >= 0) {
                const line = buffered.slice(0, newline);
                buffered = buffered.slice(newline + 1);
                if (JSON.parse(line).RequestCurrentLayerName) {
                    fixture.requests++;
                    for (const message of fixture.beforeSnapshot.splice(0))
                        socket.write(message + "\n");
                    socket.write(JSON.stringify({ CurrentLayerName: { name: fixture.current } }) + "\n");
                }
            }
        });
        socket.on("error", () => {});
    });
    fixture.send = (...messages) => fixture.sockets.at(-1).write(messages.map(item => (typeof item === "string" ? item : JSON.stringify(item)) + "\n").join(""));
    fixture.drop = () => fixture.sockets.splice(0).forEach(socket => socket.destroy());
    fixture.listen = port => new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server.address().port)));
    fixture.close = () => new Promise(resolve => { fixture.drop(); server.close(() => resolve()); });
    return fixture;
}

test("Layer indicator follows Kanata while the guide opens only on request", { skip: !hasQuickshell, timeout: 30000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanata-layers-"));
    const server = kanataServer();
    t.after(async () => {
        child?.kill();
        await server.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    fs.cpSync(shellDir, directory, { recursive: true });
    for (const sub of ["bin", "dotfiles/bin"])
        fs.mkdirSync(path.join(directory, sub), { recursive: true });
    fs.mkdirSync(path.join(directory, "runtime"), { mode: 0o700 });
    fs.copyFileSync(path.join(repo, "bin/df-kanata-layers"), path.join(directory, "dotfiles/bin/df-kanata-layers"));
    fs.writeFileSync(path.join(directory, "state"), "active");
    fs.writeFileSync(path.join(directory, "bin/systemctl"), `#!/bin/sh
state=$(cat "$HOME/state")
case "$1" in
    show) printf 'LoadState=loaded\\nActiveState=%s\\n' "$state" ;;
    is-active) echo "$state"; test "$state" = active ;;
    *) exit 2 ;;
esac
`, { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "dotfiles/bin/df-kanata-profile"), "#!/bin/sh\necho default\n", { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "bin/notify-send"), "#!/bin/sh\n", { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "shell.qml"), `import QtQuick
import Quickshell
import Quickshell.Io
import qs
import qs.modules
import "modules/lib/kanataLayers.js" as Layers

ShellRoot {
    id: root
    property string last: ""
    function report(): void {
        const rows = Layers.guideRows(guide.selectedLayer);
        const state = JSON.stringify({
            id: KanataService.layerStatus.id,
            short: KanataService.layerStatus.short,
            indicator: indicator.text,
            title: panel.rowCount ? panel.title : "",
            rendered: panel.rowCount,
            guide: guide.shown ? guide.selectedLayer : "",
            h: rows.length ? rows[1][6].output : "",
            shown: guide.shown
        });
        if (state !== root.last) {
            root.last = state;
            console.log("KANATA_STATE " + state);
        }
    }
    Connections {
        target: KanataService
        function onLayerStatusChanged() { root.report(); }
    }
    Component.onCompleted: root.report()
    FloatingWindow {
        implicitWidth: 700
        implicitHeight: 300
        Column {
            KanataLayer { id: indicator; onTextChanged: root.report() }
            KanataGuidePanel { id: panel; selectedLayer: guide.selectedLayer; onRowCountChanged: root.report() }
        }
    }
    KanataGuide {
        id: guide
        target: indicator
        onShownChanged: root.report()
        onSelectedLayerChanged: Qt.callLater(root.report)
    }
    IpcHandler {
        target: "test"
        function toggleGuide(): void { guide.toggle(); }
        function selectLayer(layer: string): void { guide.selectedLayer = layer; }
    }
}
`);
    // Connect while Navigation is already held; a pre-snapshot event is not confirmed state.
    server.current = "navigation";
    server.beforeSnapshot.push(JSON.stringify({ LayerChange: { new: "base" } }));
    const port = await server.listen(0);
    const env = {
        ...process.env,
        QT_QPA_PLATFORM: "offscreen",
        HOME: directory,
        XDG_RUNTIME_DIR: path.join(directory, "runtime"),
        PATH: `${path.join(directory, "bin")}:/usr/bin:/bin`,
        KANATA_PORT: String(port),
    };
    const states = [];
    const waiters = [];
    let output = "";
    var child = spawn("quickshell", ["-p", directory, "--no-color"], { env });
    const consume = data => {
        output += data;
        for (const match of String(data).matchAll(/KANATA_STATE (\{.*\})/g)) {
            states.push(JSON.parse(match[1]));
            for (const waiter of waiters.splice(0))
                waiter();
        }
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    const until = (predicate, description) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`timed out waiting for ${description}\n${output}`)), 6000);
        const check = () => {
            const state = states.at(-1);
            if (state && predicate(state)) {
                clearTimeout(timeout);
                resolve(state);
            } else {
                waiters.push(check);
            }
        };
        check();
    });
    const settle = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

    await until(state => state.id === "navigation" && state.guide === "", "confirmed Navigation without opening guide");
    assert.equal(states.at(-1).h, "h");
    assert.ok(!states.some(state => state.id === "base"), "pre-snapshot LayerChange is not shown as confirmed");
    assert.equal(states.at(-1).short, "Nav");
    await until(state => state.indicator === "󰌌 Nav" && state.rendered === 4 && state.title === "Base · Default layer", "indicator renders Navigation while guide stays on Base");

    server.send({ LayerChange: { new: "base" } });
    await until(state => state.id === "base" && state.guide === "" && state.indicator === "󰌌 Base", "release to Base");

    const mark = states.length;
    server.send({ LayerChange: { new: "navigation" } }, { LayerChange: { new: "base" } });
    await settle(500);
    assert.ok(!states.slice(mark).some(state => state.guide !== ""), "a quick press never shows the guide");
    assert.equal(states.at(-1).id, "base");

    server.send("not json{", { LayerChange: { new: 7 } }, { Unrelated: {} }, { LayerChange: { new: "base" } });
    server.send({ LayerChange: { new: "mystery" } });
    await until(state => state.id === "unknown" && state.guide === "", "unknown layer without guide");

    server.send({ LayerChange: { new: "navigation" } });
    await until(state => state.id === "navigation" && state.guide === "", "held layer leaves guide closed");
    server.current = "base";
    server.drop();
    await until(state => state.id === "unavailable" && state.guide === "", "lost connection hides guide");
    await until(state => state.id === "base", "reconnect confirms current layer");

    server.current = "navigation";
    const requests = server.requests;
    server.send({ ConfigFileReload: { new: "/tmp/laptop.kbd" } });
    await until(state => state.id === "navigation", "reload re-reads current layer");
    assert.equal(server.requests, requests + 1);

    const ipc = (...args) => {
        const result = spawnSync("quickshell", ["-p", directory, "ipc", "call", "test", ...args], { env, encoding: "utf8" });
        assert.equal(result.status, 0, result.stdout + result.stderr);
    };
    ipc("toggleGuide");
    await until(state => state.guide === "base", "click opens Base guide");
    ipc("selectLayer", "symbols");
    await until(state => state.guide === "symbols" && state.title === "Symbols · Hold Enter" && state.h === "—", "browse Symbols");
    server.send({ LayerChange: { new: "base" } });
    await until(state => state.id === "base" && state.guide === "symbols", "layer release preserves selected guide");
    ipc("selectLayer", "navigation");
    await until(state => state.guide === "navigation" && state.h === "←", "browse Navigation");
    ipc("selectLayer", "media");
    await until(state => state.guide === "media" && state.title === "Media · Hold Escape", "browse Media");
    ipc("selectLayer", "mouse");
    await until(state => state.guide === "mouse" && state.title === "Mouse · Hold Tab", "browse Mouse");
    ipc("toggleGuide");
    await until(state => state.guide === "", "second click closes guide");
    server.send({ LayerChange: { new: "media" } });
    await until(state => state.id === "media" && state.indicator === "󰌌 Media" && state.guide === "", "held Media updates indicator without opening guide");

    fs.writeFileSync(path.join(directory, "state"), "inactive");
    await server.close();
    await until(state => state.id === "stopped" && state.indicator === "󰌌 Off" && state.guide === "", "stopped Kanata");

    // A systemd query failure is not a confirmed stop.
    fs.writeFileSync(path.join(directory, "bin/systemctl"), "#!/bin/sh\necho 'Failed to connect to bus' >&2\nexit 1\n", { mode: 0o755 });
    await until(state => state.id === "unavailable", "query failure reads as unavailable");

    fs.writeFileSync(path.join(directory, "bin/systemctl"), "#!/bin/sh\necho active\n", { mode: 0o755 });
    server.current = "base";
    await server.listen(port);
    await until(state => state.id === "base", "Kanata start is picked up again");
    // Quitting the shell must not leave a relay holding the connection.
    const closed = new Promise(resolve => server.sockets.at(-1).on("close", resolve));
    child.kill();
    await Promise.race([closed, settle(3000).then(() => assert.fail("relay connection outlived the shell"))]);
    assert.doesNotMatch(output, /TypeError|ReferenceError/, output);
});
