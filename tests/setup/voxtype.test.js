const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SEED = path.join(ROOT, "setup/common/voxtype/seed-config");
const SETUP = path.join(ROOT, "setup/common/setup-voxtype");

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voxtype-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const configHome = path.join(dir, "config");
    const bin = path.join(dir, "bin");
    fs.mkdirSync(configHome);
    fs.mkdirSync(bin);
    const runtime = path.join(dir, "runtime");
    fs.mkdirSync(path.join(runtime, "voxtype"), { recursive: true });
    return {
        dir, bin, configHome,
        config: path.join(configHome, "voxtype/config.toml"),
        env: {
            ...process.env,
            DOTFILES_DIR: ROOT,
            XDG_CONFIG_HOME: configHome,
            XDG_RUNTIME_DIR: runtime,
            PATH: `${bin}:/usr/bin:/bin`,
            CALLS: path.join(dir, "calls"),
            BACKEND: path.join(dir, "backend"),
            MODEL: path.join(dir, "model"),
            STATE_FILE: path.join(runtime, "voxtype/state"),
            STATUS_PROBES: path.join(dir, "status-probes"),
        },
    };
}

function executable(file, content) {
    fs.writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${content}\n`, { mode: 0o755 });
}

function run(script, env) {
    return spawnSync("bash", [script], { env, encoding: "utf8" });
}

test("fresh defaults are copied and subsequent local edits survive", t => {
    const f = fixture(t);
    assert.equal(run(SEED, f.env).status, 0);
    assert.equal(fs.lstatSync(f.config).isSymbolicLink(), false);
    const defaults = fs.readFileSync(f.config, "utf8");
    assert.match(defaults, /^engine = "parakeet"$/m);
    assert.match(defaults, /\[parakeet\]\nmodel = "parakeet-tdt-0\.6b-v2"/);
    assert.match(defaults, /model = "small.en"/);
    assert.match(defaults, /pause_media = true/);
    assert.doesNotMatch(defaults, /audio.feedback/);
    fs.writeFileSync(f.config, 'custom = "local"\n');
    assert.equal(run(SEED, f.env).status, 0);
    assert.equal(fs.readFileSync(f.config, "utf8"), 'custom = "local"\n');
});

for (const wholeDirectory of [true, false]) {
    test(`migration detaches a ${wholeDirectory ? "directory" : "file"} symlink without losing settings`, t => {
        const f = fixture(t);
        const source = path.join(f.dir, "source");
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, "config.toml"), 'model = "custom"\n');
        if (wholeDirectory) {
            fs.writeFileSync(path.join(source, "extra"), "retained");
            fs.symlinkSync(source, path.dirname(f.config));
        } else {
            fs.mkdirSync(path.dirname(f.config));
            fs.symlinkSync(path.join(source, "config.toml"), f.config);
        }
        const result = run(SEED, f.env);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.lstatSync(path.dirname(f.config)).isSymbolicLink(), false);
        assert.equal(fs.lstatSync(f.config).isSymbolicLink(), false);
        assert.equal(fs.readFileSync(f.config, "utf8"), 'model = "custom"\n');
        if (wholeDirectory) assert.equal(fs.readFileSync(path.join(path.dirname(f.config), "extra"), "utf8"), "retained");
        fs.writeFileSync(f.config, "changed locally");
        assert.equal(fs.readFileSync(path.join(source, "config.toml"), "utf8"), 'model = "custom"\n');
    });
}

function installMocks(f, { existing = false } = {}) {
    const voxtype = path.join(f.dir, "mock-voxtype");
    executable(voxtype, `
printf 'voxtype %s\\n' "$*" >> "$CALLS"
case "$*" in
    'setup --download --no-post-install')
        [[ \${DOWNLOAD_FAIL:-0} != 1 ]] || exit 1
        [[ -e "$MODEL" ]] || printf downloaded > "$MODEL"
        ;;
    'setup gpu --enable')
        printf gpu > "$BACKEND"
        [[ \${GPU_ENABLE_FAIL:-0} != 1 ]] || exit 1
        ;;
    'setup gpu --disable') printf cpu > "$BACKEND" ;;
    status)
        probes=$(cat "$STATUS_PROBES" 2>/dev/null || echo 0)
        probes=$((probes + 1))
        printf '%s' "$probes" > "$STATUS_PROBES"
        if [[ -f "$STATE_FILE" ]]; then
            cat "$STATE_FILE"
        elif [[ \${NEVER_READY:-0} == 1 || \${LATE_START_FAIL:-0} == 1 ]] ||
             [[ \${GPU_LATE_FAIL:-0} == 1 && -f "$BACKEND" && $(cat "$BACKEND") == gpu ]] ||
             (( probes <= \${READY_AFTER:-0} )); then
            echo stopped
        else
            echo idle > "$STATE_FILE"
            echo idle
        fi
        ;;
esac`);
    executable(path.join(f.bin, "sudo"), `
printf 'sudo %s\\n' "$*" >> "$CALLS"
if [[ $1 == pacman ]]; then
    [[ \${PACKAGE_FAIL:-0} != 1 ]] || exit 1
    cp "$MOCK_VOXTYPE" "$MOCK_BIN/voxtype"
else
    "$@"
fi`);
    executable(path.join(f.bin, "systemctl"), `
printf 'systemctl %s\\n' "$*" >> "$CALLS"
[[ \${SERVICE_FAIL:-0} != 1 ]] || exit 1
if [[ \${GPU_START_FAIL:-0} == 1 && -f "$BACKEND" && $(cat "$BACKEND") == gpu && $2 == restart ]]; then
    exit 1
fi
if [[ $2 == restart ]]; then
    printf 0 > "$STATUS_PROBES"
elif [[ $2 == is-active && -f "$STATUS_PROBES" && $(cat "$STATUS_PROBES") != 0 ]]; then
    [[ \${LATE_START_FAIL:-0} != 1 ]] || exit 1
    if [[ \${GPU_LATE_FAIL:-0} == 1 && -f "$BACKEND" && $(cat "$BACKEND") == gpu ]]; then
        exit 1
    fi
fi`);
    executable(path.join(f.bin, "sleep"), "exit 0");
    const bashEnv = path.join(f.dir, "bash-env");
    fs.writeFileSync(bashEnv, 'compgen() { [[ \${VULKAN_AVAILABLE:-0} == 1 ]]; }\n');
    Object.assign(f.env, { MOCK_VOXTYPE: voxtype, MOCK_BIN: f.bin, BASH_ENV: bashEnv });
    if (existing) fs.copyFileSync(voxtype, path.join(f.bin, "voxtype"));
}

test("rerunning setup preserves the model, config, and selected backend", t => {
    const f = fixture(t);
    installMocks(f, { existing: true });
    f.env.VULKAN_AVAILABLE = "1";
    fs.writeFileSync(f.env.MODEL, "already downloaded");
    assert.equal(run(SEED, f.env).status, 0);
    fs.writeFileSync(f.config, 'model = "custom"\n');
    for (let i = 0; i < 2; i++) {
        const result = run(SETUP, f.env);
        assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(f.env.MODEL, "utf8"), "already downloaded");
    assert.equal(fs.readFileSync(f.config, "utf8"), 'model = "custom"\n');
    const calls = fs.readFileSync(f.env.CALLS, "utf8");
    assert.doesNotMatch(calls, /setup gpu/);
    assert.match(calls, /systemctl --user restart voxtype.service/);
    assert.match(calls, /systemctl --user is-active --quiet voxtype.service/);
});

for (const failure of ["PACKAGE_FAIL", "DOWNLOAD_FAIL", "SERVICE_FAIL"]) {
    test(`setup reports ${failure} instead of announcing success`, t => {
        const f = fixture(t);
        installMocks(f);
        f.env[failure] = "1";
        const result = run(SETUP, f.env);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /Voxtype is ready/);
    });
}

for (const failure of ["GPU_ENABLE_FAIL", "GPU_START_FAIL", "GPU_LATE_FAIL"]) {
    test(`a new installation restores CPU after ${failure}`, t => {
        const f = fixture(t);
        installMocks(f);
        f.env.VULKAN_AVAILABLE = "1";
        f.env[failure] = "1";
        const result = run(SETUP, f.env);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(f.env.BACKEND, "utf8"), "cpu");
        assert.match(fs.readFileSync(f.env.CALLS, "utf8"), /setup gpu --disable/);
    });
}

test("setup waits for initialization after systemd reports active", t => {
    const f = fixture(t);
    installMocks(f);
    f.env.READY_AFTER = "2";
    const result = run(SETUP, f.env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(f.env.STATUS_PROBES, "utf8"), "3");
    assert.match(result.stdout, /Voxtype is ready/);
});

for (const customState of [false, true]) {
    test(`a stale ${customState ? "custom" : "auto"} idle state cannot hide a startup failure`, t => {
        const f = fixture(t);
        installMocks(f);
        if (customState) {
            assert.equal(run(SEED, f.env).status, 0);
            f.env.STATE_FILE = path.join(f.dir, "custom state");
            fs.writeFileSync(f.config, `state_file = ${JSON.stringify(f.env.STATE_FILE)}\n`);
        }
        fs.writeFileSync(f.env.STATE_FILE, "idle\n");
        f.env.LATE_START_FAIL = "1";
        const result = run(SETUP, f.env);
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.stdout, /Voxtype is ready/);
        assert.equal(fs.existsSync(f.env.STATE_FILE), false);
    });
}

test("an active daemon that never becomes ready fails within the polling bound", t => {
    const f = fixture(t);
    installMocks(f);
    f.env.NEVER_READY = "1";
    const result = run(SETUP, f.env);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Voxtype is ready/);
    assert.equal(fs.readFileSync(f.env.STATUS_PROBES, "utf8"), "120");
});

test("Hyprland registers press, release, and toggle without claiming the clipboard shortcut", t => {
    const f = fixture(t);
    const script = `
local bindings = {}
local getenv = os.getenv
os.getenv = function(name)
    if name == "PATH" then return arg[3] end
    return getenv(name)
end
dofile(arg[2])
o.bind = function(keys, description, command, options)
    table.insert(bindings, { keys = keys, command = command, options = options or {} })
end
hl = { dsp = { global = function(name) return name end } }
os.execute = function() error("Hyprland cannot reliably retrieve subprocess exit status") end
dofile(arg[1])
local recording = {}
for _, binding in ipairs(bindings) do
    assert(binding.keys ~= "SUPER + CTRL + V")
    if type(binding.command) == "string" and binding.command:match("^voxtype ") then
        table.insert(recording, binding)
    end
end
assert(#recording == 3)
assert(recording[1].keys == "SUPER + CTRL + X" and recording[1].command == "voxtype record toggle")
assert(recording[2].keys == "F9" and recording[2].command == "voxtype record start" and not recording[2].options.release)
assert(recording[3].keys == "F9" and recording[3].command == "voxtype record stop" and recording[3].options.release)
bindings = {}
os.remove(arg[3] .. "/voxtype")
dofile(arg[1])
for _, binding in ipairs(bindings) do
    assert(not binding.command:match("^voxtype "))
end
`;
    const harness = path.join(f.dir, "bindings.lua");
    fs.writeFileSync(harness, script);
    executable(path.join(f.bin, "voxtype"), "exit 0");
    const result = spawnSync("lua", [harness,
        path.join(ROOT, "hypr/.config/hypr/lua/bindings/utilities.lua"),
        path.join(ROOT, "hypr/.config/hypr/lua/helpers.lua"), f.bin], {
        encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
});
