const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");

function sandbox(t, prefix) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const bin = path.join(directory, "bin");
    fs.mkdirSync(bin);
    // The real one would signal the live session's df-qs-launch.
    fs.writeFileSync(path.join(bin, "pkill"), `#!/bin/sh\necho "pkill $*" >> "${path.join(directory, "pkill-calls")}"\n`, { mode: 0o755 });
    return { directory, bin };
}

function fake(bin, name, body) {
    fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
}

// Like the real one, execs its command, so the supervisor's job is the shell itself.
function execingSystemdCat(bin) {
    fs.writeFileSync(path.join(bin, "systemd-cat"), '#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n', { mode: 0o755 });
}

function run(script, args, bin, env = {}) {
    const result = spawnSync(path.join(root, "bin", script), args, {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
        encoding: "utf8",
        timeout: 20000,
    });
    assert.ifError(result.error);
    return result;
}

// Instances live in a JSON file the fake `quickshell list`/`kill`/`ipc` share,
// and the fake `hyprctl dispatch` launches a new Shared Shell into it.
const registry = `
const fs = require("node:fs");
const file = process.env.QS_REGISTRY;
const log = process.env.QS_CALLS;
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
const write = instances => fs.writeFileSync(file, JSON.stringify(instances));
const args = process.argv.slice(2);
fs.appendFileSync(log, [require("node:path").basename(process.argv[1]), ...args].join(" ") + "\\n");
`;

test("qs maps legacy config names and leaves the Shared Shell launch to df-qs-launch", t => {
    const { bin } = sandbox(t, "qs-alias-");
    fake(bin, "quickshell", `console.log(JSON.stringify(process.argv.slice(2)));`);

    for (const [args, expected] of [
        [["-c", "lock", "ipc", "call", "lock", "lock"], ["-c", "dotfiles", "ipc", "call", "lock", "lock"]],
        [["--config=launcher", "log"], ["--config=dotfiles", "log"]],
        [["-c", "lock-probe"], ["-c", "lock-probe", "-n"]],
        [["-c", "test", "-n"], ["-c", "test", "-n"]],
    ]) {
        const result = run("qs", args, bin);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), expected);
    }

    for (const args of [["-c", "launcher"], ["--config=dotfiles", "-d"], ["-c", "lock", "-n"]]) {
        const result = run("qs", args, bin);
        assert.equal(result.status, 1, `${args.join(" ")} launched outside df-qs-launch`);
        assert.match(result.stderr, /df-qs-restart/);
    }
});

test("df-qs-instances reads Quickshell's registry, not command lines", t => {
    const { bin } = sandbox(t, "qs-instances-");
    fake(bin, "quickshell", `
if (process.env.QS_EMPTY) { console.log("No running instances."); process.exit(0); }
console.log(JSON.stringify([
    { id: "a", pid: 10, config_path: "/h/.config/quickshell/dotfiles/shell.qml" },
    { id: "b", pid: 11, config_path: "/h/.config/quickshell/lock/shell.qml" },
    { id: "c", pid: 12, config_path: "/h/.config/quickshell/lock-probe/shell.qml" },
]));`);

    assert.equal(run("df-qs-instances", ["dotfiles"], bin).stdout, "a 10\n");
    assert.equal(run("df-qs-instances", ["lock"], bin).stdout, "b 11\n",
        "a config name must not match a longer one sharing its prefix");
    assert.equal(run("df-qs-instances", ["launcher", "lock"], bin).stdout, "b 11\n");
    const empty = run("df-qs-instances", ["dotfiles"], bin, { QS_EMPTY: "1" });
    assert.equal(empty.status, 0);
    assert.equal(empty.stdout, "");
});

test("df-qs-launch relaunches after an abnormal exit and stops on a clean one", t => {
    const { directory, bin } = sandbox(t, "qs-launch-");
    const runs = path.join(directory, "runs");
    const logged = path.join(directory, "logged");
    fs.writeFileSync(runs, "");
    fs.writeFileSync(logged, "");
    execingSystemdCat(bin);
    fake(bin, "quickshell", `
const fs = require("node:fs");
fs.appendFileSync(process.env.RUNS, JSON.stringify({
    args: process.argv.slice(2),
    watcher: process.env.QS_DISABLE_FILE_WATCHER,
    popup: process.env.QS_NO_RELOAD_POPUP,
}) + "\\n");
const count = fs.readFileSync(process.env.RUNS, "utf8").trim().split("\\n").length;
process.exit(count === 1 ? 1 : 0);`);
    fake(bin, "hyprctl", "");
    fake(bin, "logger", `require("node:fs").appendFileSync(process.env.LOGGED, process.argv.slice(2).join(" ") + "\\n");`);

    const result = run("df-qs-launch", [], bin, { RUNS: runs, LOGGED: logged });
    assert.equal(result.status, 0, result.stderr);
    const launches = fs.readFileSync(runs, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(launches.length, 2, "one relaunch after the crash, none after the clean exit");
    for (const launch of launches) {
        assert.deepEqual(launch.args, ["-c", "dotfiles", "-n"]);
        assert.equal(launch.watcher, "1");
        assert.equal(launch.popup, "1");
    }
    assert.match(fs.readFileSync(logged, "utf8"), /-t df-qs Shared Shell exited with status 1; relaunching\./);
});

test("df-qs-restart stops every old instance, lock last, and waits for the new shell over IPC", t => {
    const { directory, bin } = sandbox(t, "qs-restart-");
    const home = path.join(directory, "home");
    fs.mkdirSync(path.join(home, ".config/quickshell/dotfiles"), { recursive: true });
    fs.writeFileSync(path.join(home, ".config/quickshell/dotfiles/shell.qml"), "");
    const file = path.join(directory, "registry.json");
    const calls = path.join(directory, "calls");
    fs.writeFileSync(calls, "");
    // A real process, so df-qs-restart can borrow its WAYLAND_DISPLAY from /proc.
    const holder = require("node:child_process").spawn("sleep", ["30"], { env: { ...process.env, WAYLAND_DISPLAY: "instance-display" } });
    t.after(() => holder.kill());
    const instance = (id, config) => ({ id, pid: holder.pid, config_path: `${home}/.config/quickshell/${config}/shell.qml` });
    fs.writeFileSync(file, JSON.stringify([instance("old-lock", "lock"), instance("old-bar", "dotfiles"), instance("old-launcher", "launcher")]));

    fake(bin, "quickshell", `${registry}
if (args[0] === "list") {
    const instances = read();
    console.log(instances.length ? JSON.stringify(instances) : "No running instances.");
} else if (args[0] === "kill") {
    // Quickshell rejects config-selection flags alongside -i, with status 108,
    // and -i only finds instances on the caller's display.
    if (args.includes("--any-display") || args.includes("-c")) process.exit(108);
    if (process.env.WAYLAND_DISPLAY !== "instance-display") process.exit(255);
    const id = args[args.indexOf("-i") + 1];
    write(read().filter(instance => instance.id !== id));
} else if (args[0] === "ipc") {
    if (read().some(instance => instance.config_path.includes("/dotfiles/"))) console.log("target lock");
}`);
    fake(bin, "hyprctl", `${registry}
if (process.env.HYPR_DOWN) process.exit(1);
if (args[0] === "dispatch") {
    write([...read(), { id: "new", pid: 2, config_path: process.env.HOME + "/.config/quickshell/dotfiles/shell.qml" }]);
    console.log("ok");
}`);

    const result = run("df-qs-restart", ["lock"], bin, {
        HOME: home, QS_REGISTRY: file, QS_CALLS: calls, HYPRLAND_INSTANCE_SIGNATURE: "test", WAYLAND_DISPLAY: "",
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);

    const log = fs.readFileSync(calls, "utf8").trim().split("\n");
    const kills = log.filter(line => line.startsWith("quickshell kill")).map(line => line.split(" ")[3]);
    assert.deepEqual(kills, ["old-launcher", "old-bar", "old-lock"]);
    const dispatch = log.findIndex(line => line.startsWith("hyprctl dispatch"));
    assert.ok(dispatch > log.findIndex(line => line === "quickshell kill -i old-lock"),
        "the new shell starts only after the old lock is gone");
    assert.match(log[dispatch], /uwsm-app -- \S+\/bin\/df-qs-launch/);
    assert.ok(log.slice(dispatch).some(line => line.startsWith("quickshell ipc -c dotfiles --any-display show")),
        "success waits for the new shell to answer over IPC");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).map(instance => instance.id), ["new"]);
    assert.equal(fs.readFileSync(path.join(directory, "pkill-calls"), "utf8"), "pkill -USR1 -x df-qs-launch\n",
        "the old supervisor is released before its shell is stopped");
});

test("df-qs-restart --if-running leaves a stopped shell stopped", t => {
    const { directory, bin } = sandbox(t, "qs-restart-idle-");
    const calls = path.join(directory, "calls");
    fs.writeFileSync(calls, "");
    fake(bin, "quickshell", `require("node:fs").appendFileSync(process.env.QS_CALLS, process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "list") console.log("No running instances.");`);
    fake(bin, "hyprctl", `require("node:fs").appendFileSync(process.env.QS_CALLS, "hyprctl\\n");`);

    const result = run("df-qs-restart", ["--if-running"], bin, { QS_CALLS: calls });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n"), ["list -a -j"]);
});

test("df-qs-restart leaves the running shell alone when Hyprland is unreachable", t => {
    const { directory, bin } = sandbox(t, "qs-restart-nohypr-");
    const home = path.join(directory, "home");
    fs.mkdirSync(path.join(home, ".config/quickshell/dotfiles"), { recursive: true });
    fs.writeFileSync(path.join(home, ".config/quickshell/dotfiles/shell.qml"), "");
    const calls = path.join(directory, "calls");
    fs.writeFileSync(calls, "");
    fake(bin, "quickshell", `require("node:fs").appendFileSync(process.env.QS_CALLS, process.argv.slice(2).join(" ") + "\\n");`);
    fake(bin, "hyprctl", "process.exit(1);");

    const result = run("df-qs-restart", [], bin, { HOME: home, QS_CALLS: calls, HYPRLAND_INSTANCE_SIGNATURE: "test" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Hyprland is unreachable/);
    assert.doesNotMatch(fs.readFileSync(calls, "utf8"), /^kill/m, "nothing may be stopped without a way to relaunch");
});

function supervised(t, prefix, shellBody) {
    const { directory, bin } = sandbox(t, prefix);
    const runs = path.join(directory, "runs");
    fs.writeFileSync(runs, "");
    execingSystemdCat(bin);
    fake(bin, "quickshell", `require("node:fs").appendFileSync(process.env.RUNS, process.pid + "\\n");\n${shellBody}`);
    fake(bin, "hyprctl", "");
    fake(bin, "logger", "");
    const child = require("node:child_process").spawn(path.join(root, "bin/df-qs-launch"), [], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNS: runs },
    });
    t.after(() => child.kill("SIGKILL"));
    const launches = () => fs.readFileSync(runs, "utf8").trim().split("\n").filter(Boolean);
    const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve({ code, signal })));
    return { child, launches, exited };
}

const until = async (condition, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!condition()) {
        if (Date.now() > deadline) throw new Error("timed out");
        await new Promise(resolve => setTimeout(resolve, 20));
    }
};

test("df-qs-launch stops its shell on TERM without relaunching it", async t => {
    const { child, launches, exited } = supervised(t, "qs-launch-term-", "setInterval(() => {}, 1000);");
    await until(() => launches().length === 1);
    const shell = Number(launches()[0]);
    child.kill("SIGTERM");
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.equal(launches().length, 1);
    assert.throws(() => process.kill(shell, 0), "the supervised shell outlived its supervisor");
});

test("df-qs-launch released by USR1 leaves its shell running and does not relaunch a crash", async t => {
    const { child, launches, exited } = supervised(t, "qs-launch-usr1-",
        "process.on('SIGTERM', () => process.exit(1)); setInterval(() => {}, 1000);");
    await until(() => launches().length === 1);
    const shell = Number(launches()[0]);
    child.kill("SIGUSR1");
    await new Promise(resolve => setTimeout(resolve, 200));
    process.kill(shell, 0);
    process.kill(shell, "SIGTERM");
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.equal(launches().length, 1, "a released supervisor relaunched the shell");
});
