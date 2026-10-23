//     node --test tests/multiplexer/toggleNotifications.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-herdr-toggle-notifications");
const LIVE_CONFIG = path.join(ROOT, "herdr/.config/herdr/config.toml");

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-toggle-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const config = path.join(home, "config.toml");
    const calls = path.join(home, "calls");
    fs.copyFileSync(options.config ?? LIVE_CONFIG, config);
    if (!options.config) {
        const contents = fs.readFileSync(config, "utf8")
            .replace(/(\[ui\.toast\]\s*\ndelivery = )"[^"]*"/, '$1"system"')
            .replace(/(\[ui\.sound\]\s*\nenabled = )(true|false)/, "$1true");
        fs.writeFileSync(config, contents);
    }

    const bin = path.join(home, "bin");
    fs.mkdirSync(bin);
    const fake = (name, body) => {
        fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
        fs.chmodSync(path.join(bin, name), 0o755);
    };
    const sessions = options.sessions ?? ["/run/work.sock"];
    fake("herdr", `if [[ "$*" == "session list" ]]; then
    ${options.listFails ? "exit 1" : ""}
    echo "name status directory socket"
    echo "stale stopped /x /run/stale.sock"
${sessions.map((socket) => `    echo "s running /x ${socket}"`).join("\n")}
    exit 0
fi
printf '%s %s\\n' "$HERDR_SOCKET_PATH" "$*" >> "${calls}"
exit ${options.reloadStatus ?? 0}`);
    fake("pgrep", `printf '%s\\n' ${(options.clients ?? []).map((line) => JSON.stringify(line)).join(" ")} | grep . || true`);
    // Drains stdin like real ssh without -n, which would starve the caller's read loop.
    fake("ssh", `[[ " $* " == *" -n "* ]] || cat >/dev/null
printf 'ssh %s\\n' "$*" >> "${calls}"
exit ${options.sshStatus ?? 0}`);
    fake("notify-send", `printf 'notify %s\\n' "$*" >> "${calls}"`);

    function run() {
        return childProcess.spawnSync(SCRIPT, [], {
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                HOME: home,
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_CONFIG_PATH: config
            },
            encoding: "utf8"
        });
    }

    function setting(section, key) {
        const body = fs.readFileSync(config, "utf8").split(`\n[${section}]\n`)[1];
        return body.split(/\n\[/)[0].match(new RegExp(`^${key} = (.*)$`, "m"))[1];
    }

    function reloads() {
        return fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [];
    }

    return { config, run, setting, reloads };
}

test("the first toggle silences toasts and sounds, and reloads the server", (t) => {
    const harness = fixture(t);

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(harness.setting("ui.toast", "delivery"), '"off"');
    assert.strictEqual(harness.setting("ui.sound", "enabled"), "false");
    assert.deepStrictEqual(harness.reloads(), [
        "/run/work.sock server reload-config",
        "notify Herdr notifications off"
    ]);
});

test("toggling twice restores the config byte for byte", (t) => {
    const harness = fixture(t);
    const before = fs.readFileSync(harness.config, "utf8");

    harness.run();
    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.readFileSync(harness.config, "utf8"), before);
    assert.deepStrictEqual(harness.reloads().at(-1), "notify Herdr notifications on");
});

test("only the toast and sound switches move", (t) => {
    const harness = fixture(t);
    const before = fs.readFileSync(harness.config, "utf8").split("\n");

    harness.run();

    const after = fs.readFileSync(harness.config, "utf8").split("\n");
    const changed = before.filter((line, index) => line !== after[index]);
    assert.deepStrictEqual(changed, ['delivery = "system"', "enabled = true"]);
});

test("a rejected reload leaves the config as it was", (t) => {
    const harness = fixture(t, { reloadStatus: 1 });
    const before = fs.readFileSync(harness.config, "utf8");

    const result = harness.run();

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /notifications are still system/);
    assert.strictEqual(fs.readFileSync(harness.config, "utf8"), before);
});

test("every running local session is reloaded", (t) => {
    const harness = fixture(t, { sessions: ["/run/a.sock", "/run/b.sock"] });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(harness.reloads().slice(0, 2), [
        "/run/a.sock server reload-config",
        "/run/b.sock server reload-config"
    ]);
});

test("remote attachments are reloaded on their server so the client re-reads its config", (t) => {
    const harness = fixture(t, {
        sessions: [],
        clients: [
            "101 herdr --remote devbox --session work --remote-keybindings server",
            "102 herdr --remote=devbox",
            "103 herdr client"
        ]
    });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const ssh = harness.reloads().filter((call) => call.startsWith("ssh "));
    assert.deepStrictEqual(ssh, [
        'ssh -n -o BatchMode=yes -o ConnectTimeout=5 devbox PATH="$HOME/.local/bin:$PATH" herdr server reload-config',
        'ssh -n -o BatchMode=yes -o ConnectTimeout=5 devbox PATH="$HOME/.local/bin:$PATH" herdr --session work server reload-config'
    ]);
});

test("an unreachable remote keeps the new setting and says where to reload", (t) => {
    const harness = fixture(t, {
        clients: ["101 herdr --remote devbox --session work"],
        sshStatus: 255
    });

    const result = harness.run();

    assert.strictEqual(result.status, 1);
    assert.strictEqual(harness.setting("ui.toast", "delivery"), '"off"');
    assert.match(result.stderr, /devbox \(work\) didn't reload; press prefix\+alt\+r there/);
});

test("a session list that fails leaves the config as it was", (t) => {
    const harness = fixture(t, { listFails: true });
    const before = fs.readFileSync(harness.config, "utf8");

    const result = harness.run();

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /could not list Herdr sessions/);
    assert.strictEqual(fs.readFileSync(harness.config, "utf8"), before);
});

test("a config without the toast switch is left alone", (t) => {
    const bare = path.join(os.tmpdir(), `herdr-bare-${process.pid}.toml`);
    fs.writeFileSync(bare, "[keys]\nprefix = \"ctrl+space\"\n");
    t.after(() => fs.rmSync(bare, { force: true }));
    const harness = fixture(t, { config: bare });

    const result = harness.run();

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /no \[ui\.toast\] delivery setting/);
    assert.deepStrictEqual(harness.reloads().filter((call) => call.includes("reload-config")), []);
});

test("the shipped config binds the toggle to a key Herdr can reach", () => {
    const config = fs.readFileSync(LIVE_CONFIG, "utf8");
    const binding = config
        .split(/\n(?=\[\[keys\.command\]\])/)
        .find((block) => block.includes("df-herdr-toggle-notifications"));

    assert.ok(binding, "the toggle helper is not bound to any key");
    assert.match(binding, /^key = "prefix\+comma"$/m);
    assert.match(binding, /^type = "shell"$/m);
});
