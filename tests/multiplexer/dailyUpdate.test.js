const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-update-daily");

function fixture(t) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "daily-update-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const bin = path.join(home, "bin");
    const calls = path.join(home, "calls");
    const clock = path.join(home, "clock");
    const failure = path.join(home, "failure");
    const readyLater = path.join(home, "ready-later");
    fs.mkdirSync(bin);
    fs.writeFileSync(clock, "2026-10-16 09");
    fs.writeFileSync(path.join(bin, "date"), `#!/usr/bin/env bash
read -r day hour < '${clock}'
case "$1" in +%H) echo "$hour" ;; +%F) echo "$day" ;; esac
`);
    fs.writeFileSync(path.join(bin, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> '${calls}'
if [[ $1 == --session ]]; then shift 2; fi
case "$1 $2" in
    'workspace list')
        if [[ -e '${readyLater}' ]]; then rm '${readyLater}'; exit 1; fi
        [[ ! -e '${failure}' || $(<'${failure}') == tabs ]] || exit 1
        echo '{"result":{"workspaces":[{"workspace_id":"personal-workspace"}]}}' ;;
    'tab create')
        [[ ! -e '${failure}' ]] || exit 1
        echo '{"result":{"root_pane":{"pane_id":"update-pane"}}}' ;;
esac
`);
    for (const file of ["herdr", "date", "sleep"]) fs.chmodSync(path.join(bin, file), 0o755);
    const env = {
        ...process.env, HOME: home, XDG_STATE_HOME: path.join(home, "state"),
        PATH: `${bin}:/usr/bin:/bin`, HERDR_BIN_PATH: path.join(bin, "herdr"),
        DOTFILES_DIR: ROOT, HERDR_ENV: "", HERDR_WORKSPACE_ID: "wrong-workspace",
        HERDR_SOCKET_PATH: "wrong-socket"
    };
    return {
        home, env, failure, readyLater,
        run: (args = ["--once-per-day", "personal"], overrides = {}) =>
            childProcess.spawnSync(SCRIPT, args, { env: { ...env, ...overrides }, encoding: "utf8" }),
        setClock: (value) => fs.writeFileSync(clock, value),
        calls: () => fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [],
        stamp: path.join(env.XDG_STATE_HOME, "dotfiles/update-daily.last-triggered")
    };
}

test("daily dispatch targets personal once per date and survives launcher restarts", t => {
    const h = fixture(t);
    for (let i = 0; i < 2; i++) {
        const result = h.run();
        assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
    assert.equal(h.calls().filter(call => call.includes("pane run")).length, 3);
    assert.ok(h.calls().every(call => call.startsWith("--session personal ")));
    assert.ok(h.calls().filter(call => call.includes("tab create")).every(call =>
        call.includes("--workspace personal-workspace") && call.includes("--no-focus")));
    assert.equal(fs.readFileSync(h.stamp, "utf8"), "2026-10-16\n");
    h.setClock("2026-10-17 08");
    assert.equal(h.run().status, 0);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 6);
});

for (const hour of ["00", "09", "12", "18", "23"]) {
    test(`first launch at ${hour}:00 runs once for that date`, t => {
        const h = fixture(t);
        h.setClock(`2026-10-16 ${hour}`);
        assert.equal(h.run().status, 0);
        assert.equal(h.run().status, 0);
        assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
        assert.equal(fs.readFileSync(h.stamp, "utf8"), "2026-10-16\n");
    });
}

test("unavailable session does not consume the daily trigger", t => {
    const h = fixture(t);
    fs.writeFileSync(h.failure, "");
    assert.notEqual(h.run().status, 0);
    assert.equal(fs.existsSync(h.stamp), false);
    fs.unlinkSync(h.failure);
    assert.equal(h.run().status, 0);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
});

test("fresh launch waits for the workspace API to become ready", t => {
    const h = fixture(t);
    fs.writeFileSync(h.readyLater, "");
    assert.equal(h.run().status, 0);
    assert.equal(h.calls().filter(call => call.includes("workspace list")).length, 2);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
});

test("remote daily updates find mise-installed Herdr without shell activation", t => {
    const h = fixture(t);
    const installed = path.join(h.home, ".local/share/mise/installs/github-herdrdev-herdr/latest/herdr");
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.renameSync(path.join(h.home, "bin/herdr"), installed);
    for (const command of ["bash", "mkdir", "flock", "jq"]) {
        fs.symlinkSync(`/usr/bin/${command}`, path.join(h.home, "bin", command));
    }
    const result = h.run(undefined, { HERDR_BIN_PATH: "herdr", PATH: path.join(h.home, "bin") });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
});

test("a failed dispatch is not automatically triggered again that day", t => {
    const h = fixture(t);
    fs.writeFileSync(h.failure, "tabs");
    assert.notEqual(h.run().status, 0);
    assert.equal(fs.readFileSync(h.stamp, "utf8"), "2026-10-16\n");
    fs.unlinkSync(h.failure);
    assert.equal(h.run().status, 0);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 1);
});

test("concurrent launches dispatch only one set of update tabs", async t => {
    const h = fixture(t);
    await Promise.all(Array.from({ length: 5 }, () => new Promise((resolve, reject) => {
        const child = childProcess.spawn(SCRIPT, ["--once-per-day", "personal"], { env: h.env });
        child.on("error", reject);
        child.on("close", code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
    })));
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 3);
});

test("manual invocation still requires Herdr and bypasses the automatic guard", t => {
    const h = fixture(t);
    assert.notEqual(h.run([]).status, 0);
    assert.equal(h.run().status, 0);
    h.setClock("2026-10-16 18");
    const result = h.run([], { HERDR_ENV: "1", HERDR_WORKSPACE_ID: "manual-workspace" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(h.calls().filter(call => call.includes("tab create")).length, 6);
    assert.equal(h.calls().filter(call => call.includes("--workspace manual-workspace")).length, 3);
});

test("Super+I wires the daily check after a successful special workspace launch", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    assert.match(apps, /if name == "personal" then[\s\S]*?&&[\s\S]*?df-herdr-session[\s\S]*?--daily-update/);
});
