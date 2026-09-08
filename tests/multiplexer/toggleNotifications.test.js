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

    const herdr = path.join(home, "herdr");
    fs.writeFileSync(herdr, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${calls}"
exit ${options.reloadStatus ?? 0}
`);
    fs.chmodSync(herdr, 0o755);

    function run() {
        return childProcess.spawnSync(SCRIPT, [], {
            env: {
                PATH: "/usr/bin:/bin",
                HOME: home,
                HERDR_BIN_PATH: herdr,
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
    assert.deepStrictEqual(harness.reloads(), ["server reload-config"]);
});

test("toggling twice restores the config byte for byte", (t) => {
    const harness = fixture(t);
    const before = fs.readFileSync(harness.config, "utf8");

    harness.run();
    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.readFileSync(harness.config, "utf8"), before);
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

test("a config without the toast switch is left alone", (t) => {
    const bare = path.join(os.tmpdir(), `herdr-bare-${process.pid}.toml`);
    fs.writeFileSync(bare, "[keys]\nprefix = \"ctrl+space\"\n");
    t.after(() => fs.rmSync(bare, { force: true }));
    const harness = fixture(t, { config: bare });

    const result = harness.run();

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /no \[ui\.toast\] delivery setting/);
    assert.deepStrictEqual(harness.reloads(), []);
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
