const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-hypr-workspace-toggle");
const CONFIG = path.join(ROOT, "hypr/.config/hypr/lua/bindings/tiling.lua");

const LUA_CONFIG_STUB = `
callbacks = {}
hl = { dsp = setmetatable({}, { __index = function() return function() return "dispatcher" end end }),
    define_submap = function() end,
    on = function(event, callback) callbacks[event] = callback end }
hl.dsp.window = hl.dsp
hl.dsp.group = hl.dsp
hl.dsp.workspace = hl.dsp
o = { bind = function() end }
`;

function fixture(t, options = {}) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-toggle-"));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const stateFile = path.join(temp, "state.json");
    const logFile = path.join(temp, "dispatches.jsonl");
    const initial = {
        id: 0,
        focused: true,
        activeWorkspace: { id: options.base || 1 },
        specialWorkspace: { name: options.special || "" },
        previous: 2,
        clients: options.clients || [{ workspace: { name: "special:herdr" } }]
    };
    fs.writeFileSync(stateFile, JSON.stringify(initial));
    fs.writeFileSync(path.join(temp, "hyprctl"), `#!/usr/bin/node
const fs = require("node:fs");
const childProcess = require("node:child_process");
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.TEST_STATE, "utf8"));
if (args[0] === "monitors") {
    process.stdout.write(JSON.stringify([state]));
} else if (args[0] === "clients") {
    if (process.env.FAIL_CLIENTS === "1")
        process.exit(1);
    process.stdout.write(JSON.stringify(state.clients));
} else if (args[0] === "dispatch") {
    fs.appendFileSync(process.env.TEST_LOG, JSON.stringify(args.slice(1)) + "\\n");
    if (args[1].startsWith("hl.") && process.env.FAIL_LUA === "1")
        process.exit(1);
    if (process.env.FAIL_DISPATCH === "1")
        process.exit(1);
    const focus = args[1].match(/hl\\.dsp\\.focus\\(\\{ workspace = "([^"]+)" \\}\\)/);
    const special = args[1].match(/hl\\.dsp\\.workspace\\.toggle_special\\("([^"]*)"\\)/);
    let workspaceActivated = false;
    if (focus || args[1] === "workspace") {
        const target = focus ? focus[1] : args[2];
        const id = target === "previous_per_monitor" ? state.previous : Number(target);
        if (id !== state.activeWorkspace.id) {
            workspaceActivated = true;
            state.previous = state.activeWorkspace.id;
            state.activeWorkspace.id = id;
        }
        state.specialWorkspace.name = "";
    } else if (special || args[1] === "togglespecialworkspace") {
        const name = "special:" + (special ? special[1] : args[2]);
        state.specialWorkspace.name = state.specialWorkspace.name === name ? "" : name;
    } else {
        process.exit(2);
    }
    fs.writeFileSync(process.env.TEST_STATE, JSON.stringify(state));
    if (workspaceActivated) {
        childProcess.execFileSync("lua", ["-e", process.env.TEST_LUA_CONFIG_STUB +
            '\\ndofile(os.getenv("TEST_CONFIG"))\\ncallbacks["workspace.active"]({ id = ' + state.activeWorkspace.id + ' })'], { stdio: "inherit" });
    }
} else {
    process.exit(2);
}
`);
    fs.chmodSync(path.join(temp, "hyprctl"), 0o755);
    const env = {
        ...process.env,
        PATH: `${temp}:${process.env.PATH}`,
        XDG_RUNTIME_DIR: temp,
        TEST_STATE: stateFile,
        TEST_LOG: logFile,
        TEST_CONFIG: CONFIG,
        TEST_LUA_CONFIG_STUB: LUA_CONFIG_STUB,
        FAIL_LUA: options.failLua ? "1" : "0",
        FAIL_DISPATCH: options.failDispatch ? "1" : "0",
        HYPRLAND_INSTANCE_SIGNATURE: "workspace-test"
    };
    function run(target, overrides = {}) {
        return childProcess.spawnSync(SCRIPT, [String(target)], {
            encoding: "utf8",
            env: { ...env, ...overrides }
        });
    }
    function state() {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    }
    function update(changes) {
        fs.writeFileSync(stateFile, JSON.stringify({ ...state(), ...changes }));
    }
    function activate(target) {
        const current = state();
        update({ activeWorkspace: { id: target }, previous: current.activeWorkspace.id });
        return childProcess.spawnSync("lua", ["-e", LUA_CONFIG_STUB + `
dofile(os.getenv("TEST_CONFIG"))
if callbacks["workspace.active"] then
    callbacks["workspace.active"]({ id = tonumber(os.getenv("TEST_WORKSPACE")) })
end
`], { encoding: "utf8", env: { ...env, TEST_CONFIG: CONFIG, TEST_WORKSPACE: String(target) } });
    }
    return { run, state, update, activate, temp, logFile };
}

function succeeds(result) {
    assert.strictEqual(result.status, 0, result.stderr);
}

test("every numbered shortcut switches and returns on another press", t => {
    for (let target = 1; target <= 10; target++) {
        const base = target === 1 ? 2 : 1;
        const harness = fixture(t, { base });
        succeeds(harness.run(target));
        assert.strictEqual(harness.state().activeWorkspace.id, target);
        succeeds(harness.run(target));
        assert.strictEqual(harness.state().activeWorkspace.id, base);
    }
});

test("a numbered shortcut returns to the previous special workspace and its underlying numbered workspace", t => {
    for (const base of [1, 3]) {
        for (const failLua of [false, true]) {
            const harness = fixture(t, { base, special: "special:herdr", failLua });
            succeeds(harness.run(3));
            assert.strictEqual(harness.state().activeWorkspace.id, 3);
            assert.strictEqual(harness.state().specialWorkspace.name, "");
            succeeds(harness.run(3));
            assert.strictEqual(harness.state().activeWorkspace.id, base);
            assert.strictEqual(harness.state().specialWorkspace.name, "special:herdr");
            succeeds(harness.run(3));
            succeeds(harness.run(3));
            assert.strictEqual(harness.state().specialWorkspace.name, "special:herdr");
        }
    }
});

test("entering from a numbered workspace clears an earlier special return", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    succeeds(harness.run(4));
    succeeds(harness.run(3));
    succeeds(harness.run(3));
    assert.strictEqual(harness.state().activeWorkspace.id, 4);
    assert.strictEqual(harness.state().specialWorkspace.name, "");
});

test("Tab navigation clears a stale special return before reentering the numbered workspace", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    succeeds(harness.activate(4));
    succeeds(harness.activate(3));
    succeeds(harness.run(3));
    assert.strictEqual(harness.state().activeWorkspace.id, 4);
    assert.strictEqual(harness.state().specialWorkspace.name, "");
});

test("activating another workspace preserves a saved return until its destination is reentered", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    const returnFile = path.join(harness.temp, "df-normal-return-workspace-test-3.json");
    succeeds(harness.activate(4));
    assert.strictEqual(fs.existsSync(returnFile), true);
    succeeds(harness.activate(3));
    assert.strictEqual(fs.existsSync(returnFile), false);
});

test("a closed special workspace returns to its underlying numbered workspace", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    harness.update({ clients: [] });
    succeeds(harness.run(3));
    assert.strictEqual(harness.state().activeWorkspace.id, 1);
    assert.strictEqual(harness.state().specialWorkspace.name, "");
});

test("return history does not cross compositor sessions", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    succeeds(harness.run(3, { HYPRLAND_INSTANCE_SIGNATURE: "other-session" }));
    assert.strictEqual(harness.state().activeWorkspace.id, 1);
    assert.strictEqual(harness.state().specialWorkspace.name, "");
});

test("a failed client query keeps the numbered workspace and preserves its special return", t => {
    const harness = fixture(t, { special: "special:herdr" });
    succeeds(harness.run(3));
    assert.notStrictEqual(harness.run(3, { FAIL_CLIENTS: "1" }).status, 0);
    assert.strictEqual(harness.state().activeWorkspace.id, 3);
    assert.strictEqual(harness.state().specialWorkspace.name, "");
    succeeds(harness.run(3));
    assert.strictEqual(harness.state().specialWorkspace.name, "special:herdr");
});

test("invalid targets do not dispatch and failed switches do not save return history", t => {
    const harness = fixture(t, { special: "special:herdr", failDispatch: true });
    for (const target of [0, 11, "3;exit", "special:herdr"])
        assert.strictEqual(harness.run(target).status, 64);
    assert.strictEqual(fs.existsSync(harness.logFile), false);
    assert.notStrictEqual(harness.run(3).status, 0);
    assert.strictEqual(fs.readdirSync(harness.temp).some(name => name.startsWith("df-normal-return-")), false);
});

test("numbered and magic bindings use return tracking while move-window bindings keep their dispatcher", () => {
    const result = childProcess.spawnSync("lua", ["-e", LUA_CONFIG_STUB + `
o = { bind = function(keys, description, action)
    if keys:match("code:1[0-9]$") or keys:match("S$") then print(keys .. "|" .. action) end
end }
dofile(os.getenv("TEST_CONFIG"))
`], { encoding: "utf8", env: { ...process.env, TEST_CONFIG: CONFIG } });
    assert.strictEqual(result.status, 0, result.stderr);
    for (let workspace = 1; workspace <= 10; workspace++) {
        assert.ok(result.stdout.includes(`SUPER + code:${workspace + 9}|${process.env.HOME}/dotfiles/bin/df-hypr-workspace-toggle ${workspace}\n`));
        assert.ok(result.stdout.includes(`SUPER + SHIFT + code:${workspace + 9}|dispatcher\n`));
    }
    assert.ok(result.stdout.includes(`SUPER + S|${process.env.HOME}/dotfiles/bin/df-launch-special-workspace --toggle-only magic\n`));
    assert.ok(result.stdout.includes("SUPER + SHIFT + S|dispatcher\n"));
});
