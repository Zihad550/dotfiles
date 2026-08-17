const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const LAUNCHER = path.join(ROOT, "bin/df-launch-special-workspace");
const INITIAL_CLASS = "io.github.zihad550.dotfiles.herdr";
const NATIVE_APPLICATIONS = [
    {
        keys: "SUPER + O",
        initialClass: "obsidian",
        workspace: "note",
        launch: "obsidian -disable-gpu --enable-wayland-ime"
    },
    {
        keys: "SUPER + SHIFT + W",
        initialClass: "helium",
        workspace: "work",
        launch: "helium-browser --profile-directory='Profile 2'"
    },
    {
        keys: "SUPER + M",
        initialClass: "thunderbird",
        workspace: "thunderbird",
        launch: "thunderbird"
    }
];

function client(address, initialClass, workspace, extra = {}) {
    return {
        address,
        initialClass,
        class: extra.class || initialClass,
        initialTitle: extra.initialTitle || "",
        title: extra.title || "",
        workspace: { name: workspace }
    };
}

function writeExecutable(file, contents) {
    fs.writeFileSync(file, contents);
    fs.chmodSync(file, 0o755);
}

function fixture(t, options = {}) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "special-workspace-"));
    const bin = path.join(temp, "bin");
    const state = path.join(temp, "state");
    fs.mkdirSync(bin);
    fs.mkdirSync(state);
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

    fs.writeFileSync(path.join(state, "clients.json"), JSON.stringify(options.clients || [[]]));
    fs.writeFileSync(path.join(state, "active-workspace"), options.activeWorkspace || "1");
    fs.writeFileSync(path.join(state, "client-call"), "0");

    writeExecutable(path.join(bin, "hyprctl"), `#!/usr/bin/node
const fs = require("node:fs");
const path = require("node:path");
const state = process.env.TEST_STATE;
const args = process.argv.slice(2);
if (args[0] === "clients" && args[1] === "-j") {
    const counter = path.join(state, "client-call");
    const call = Number(fs.readFileSync(counter, "utf8"));
    const responses = JSON.parse(fs.readFileSync(path.join(state, "clients.json"), "utf8"));
    fs.writeFileSync(counter, String(call + 1));
    process.stdout.write(JSON.stringify(responses[Math.min(call, responses.length - 1)]));
} else if (args[0] === "activeworkspace" && args[1] === "-j") {
    const name = fs.readFileSync(path.join(state, "active-workspace"), "utf8");
    process.stdout.write(JSON.stringify({ name }));
} else if (args[0] === "dispatch") {
    fs.appendFileSync(path.join(state, "dispatches"), JSON.stringify(args.slice(1)) + "\\n");
    if (process.env.FAIL_LUA === "1" && args[1].startsWith("hl."))
        process.exit(1);
} else {
    process.exit(2);
}
`);

    writeExecutable(path.join(bin, "notify-send"), `#!/usr/bin/node
const fs = require("node:fs");
const path = require("node:path");
fs.appendFileSync(path.join(process.env.TEST_STATE, "notifications"),
    JSON.stringify(process.argv.slice(2)) + "\\n");
`);

    const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_STATE: state,
        XDG_RUNTIME_DIR: temp,
        DF_SPECIAL_WORKSPACE_POLL_ATTEMPTS: options.pollAttempts || "3",
        DF_SPECIAL_WORKSPACE_POLL_INTERVAL: options.pollInterval || "0.01",
        FAIL_LUA: options.failLua ? "1" : "0"
    };

    function run(workspace = "herdr", launch = ["ghostty", `--class=${INITIAL_CLASS}`],
        initialClass = INITIAL_CLASS) {
        return childProcess.spawnSync(LAUNCHER, [initialClass, workspace, ...launch], {
            env,
            encoding: "utf8"
        });
    }

    function records(name) {
        const file = path.join(state, name);
        if (!fs.existsSync(file))
            return [];
        return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    }

    return {
        env,
        run,
        dispatches: () => records("dispatches"),
        notifications: () => records("notifications")
    };
}

function dispatchesNamed(records, legacyName, luaFragment) {
    return records.filter(args => args[0] === legacyName || args[0].includes(luaFragment));
}

test("one exact initialClass match focuses its address and ignores every mutable identity field", t => {
    const exact = client("0xexact", INITIAL_CLASS, "4", {
        class: "wrong-current-class",
        initialTitle: "wrong initial title",
        title: "wrong current title"
    });
    const titleOnly = client("0xtitle", "com.mitchellh.ghostty", "special:herdr", {
        class: INITIAL_CLASS,
        initialTitle: INITIAL_CLASS,
        title: INITIAL_CLASS
    });
    const harness = fixture(t, { clients: [[titleOnly, exact]] });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const focus = dispatchesNamed(harness.dispatches(), "focuswindow", "hl.dsp.focus");
    assert.strictEqual(focus.length, 1);
    assert.match(focus[0].join(" "), /address:0xexact/);
    assert.strictEqual(dispatchesNamed(harness.dispatches(), "exec", "hl.dsp.exec_cmd").length, 0);
});

test("an active configured Special Workspace hides before client selection", t => {
    const harness = fixture(t, {
        activeWorkspace: "special:herdr",
        clients: [[
            client("0xone", INITIAL_CLASS, "1"),
            client("0xtwo", INITIAL_CLASS, "2")
        ]]
    });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const dispatches = harness.dispatches();
    assert.strictEqual(dispatchesNamed(dispatches, "togglespecialworkspace", "toggle_special").length, 1);
    assert.strictEqual(dispatchesNamed(dispatches, "focuswindow", "hl.dsp.focus").length, 0);
    assert.strictEqual(dispatchesNamed(dispatches, "exec", "hl.dsp.exec_cmd").length, 0);
});

test("a sole exact client is focused wherever the user moved it", t => {
    const harness = fixture(t, { clients: [[client("0xmoved", INITIAL_CLASS, "9")]] });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(harness.dispatches()[0].join(" "), /address:0xmoved/);
    assert.strictEqual(dispatchesNamed(harness.dispatches(), "movetoworkspacesilent", "hl.dsp.window.move").length, 0);
});

test("duplicate exact clients prefer the sole client in the configured Special Workspace", t => {
    const harness = fixture(t, { clients: [[
        client("0xother", INITIAL_CLASS, "7"),
        client("0xconfigured", INITIAL_CLASS, "special:herdr")
    ]] });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const focus = dispatchesNamed(harness.dispatches(), "focuswindow", "hl.dsp.focus");
    assert.strictEqual(focus.length, 1);
    assert.match(focus[0].join(" "), /address:0xconfigured/);
});

test("unresolved duplicate identity fails visibly without focusing or launching", t => {
    const harness = fixture(t, { clients: [[
        client("0xone", INITIAL_CLASS, "7"),
        client("0xtwo", INITIAL_CLASS, "8")
    ]] });

    const result = harness.run();

    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(harness.dispatches().length, 0);
    assert.match(harness.notifications().flat().join(" "), /ambiguous/i);
    assert.match(harness.notifications().flat().join(" "), new RegExp(INITIAL_CLASS.replaceAll(".", "\\.")));
});

test("a missing client launches once and verifies a new exact client in the configured workspace", t => {
    const appeared = client("0xnew", INITIAL_CLASS, "special:herdr");
    const harness = fixture(t, { clients: [[], [], [appeared]] });

    const result = harness.run("herdr", ["ghostty", `--class=${INITIAL_CLASS}`, "--title=herdr"]);

    assert.strictEqual(result.status, 0, result.stderr);
    const dispatches = harness.dispatches();
    assert.strictEqual(dispatchesNamed(dispatches, "togglespecialworkspace", "toggle_special").length, 1);
    const launches = dispatchesNamed(dispatches, "exec", "hl.dsp.exec_cmd");
    assert.strictEqual(launches.length, 1);
    assert.match(launches[0].join(" "), /uwsm-app -- ghostty/);
    assert.match(launches[0].join(" "), /--title=herdr/);
});

test("a newly launched client outside the configured workspace moves by address and is verified live", t => {
    const outside = client("0xnew", INITIAL_CLASS, "3");
    const inside = client("0xnew", INITIAL_CLASS, "special:herdr");
    const harness = fixture(t, { clients: [[], [], [outside], [inside]] });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const moves = dispatchesNamed(harness.dispatches(), "movetoworkspacesilent", "hl.dsp.window.move");
    assert.strictEqual(moves.length, 1);
    assert.match(moves[0].join(" "), /special:herdr/);
    assert.match(moves[0].join(" "), /address:0xnew/);
});

test("failed launch verification notifies and never closes the unexpected client", t => {
    const unexpected = client("0xwrong", "com.mitchellh.ghostty", "special:herdr");
    const harness = fixture(t, { clients: [[], [], [unexpected]], pollAttempts: "2" });

    const result = harness.run();

    assert.notStrictEqual(result.status, 0);
    assert.match(harness.notifications().flat().join(" "), /verification failed/i);
    assert.strictEqual(harness.dispatches().some(args => /close|kill/.test(args.join(" "))), false);
});

test("multiple newly launched exact clients fail verification without arbitrary selection", t => {
    const appeared = [
        client("0xnew-one", INITIAL_CLASS, "special:herdr"),
        client("0xnew-two", INITIAL_CLASS, "special:herdr")
    ];
    const harness = fixture(t, { clients: [[], [], appeared], pollAttempts: "2" });

    const result = harness.run();

    assert.notStrictEqual(result.status, 0);
    assert.match(harness.notifications().flat().join(" "), /2 new exact clients/i);
    assert.strictEqual(dispatchesNamed(harness.dispatches(), "focuswindow", "hl.dsp.focus").length, 0);
    assert.strictEqual(dispatchesNamed(harness.dispatches(), "movetoworkspacesilent", "hl.dsp.window.move").length, 0);
});

test("a second launch for one workspace reports the held lock while another workspace remains lockable", async t => {
    const harness = fixture(t, { clients: [[]], pollAttempts: "20", pollInterval: "0.02" });
    const first = childProcess.spawn(LAUNCHER,
        [INITIAL_CLASS, "herdr", "ghostty", `--class=${INITIAL_CLASS}`],
        { env: harness.env, stdio: "ignore" });
    t.after(() => first.kill());

    const deadline = Date.now() + 1000;
    while (dispatchesNamed(harness.dispatches(), "exec", "hl.dsp.exec_cmd").length === 0) {
        assert.ok(Date.now() < deadline, "first invocation did not reach launch dispatch");
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    const same = harness.run("herdr");
    const different = harness.run("other");
    if (first.exitCode === null)
        await new Promise(resolve => first.once("exit", resolve));

    assert.notStrictEqual(same.status, 0);
    assert.match(harness.notifications().flat().join(" "), /launch.*progress/i);
    assert.strictEqual(dispatchesNamed(harness.dispatches(), "exec", "hl.dsp.exec_cmd").length, 2,
        "the original and other workspace launch; the repeated herdr invocation does not");
    assert.notStrictEqual(different.status, null);
});

test("Lua dispatch is primary and every operation retains its legacy fallback", t => {
    const outside = client("0xnew", INITIAL_CLASS, "3");
    const inside = client("0xnew", INITIAL_CLASS, "special:herdr");
    const harness = fixture(t, { clients: [[], [], [outside], [inside]], failLua: true });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const dispatches = harness.dispatches();
    for (const legacy of ["togglespecialworkspace", "exec", "movetoworkspacesilent"]) {
        const index = dispatches.findIndex(args => args[0] === legacy);
        assert.ok(index > 0, `${legacy} fallback was not called`);
        assert.ok(dispatches[index - 1][0].startsWith("hl."), `${legacy} did not try Lua first`);
    }
});

test("focus dispatch tries Lua before the legacy fallback", t => {
    const harness = fixture(t, {
        clients: [[client("0xexisting", INITIAL_CLASS, "special:herdr")]],
        failLua: true
    });

    const result = harness.run();

    assert.strictEqual(result.status, 0, result.stderr);
    const dispatches = harness.dispatches();
    assert.match(dispatches[0][0], /hl\.dsp\.focus/);
    assert.deepStrictEqual(dispatches[1], ["focuswindow", "address:0xexisting"]);
});

test("the fixed Herdr binding declares its dotted identity while Launcher-created Herdr stays generic", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    const directories = fs.readFileSync(path.join(ROOT,
        "quickshell/.config/quickshell/launcher/lib/directories.js"), "utf8");

    const herdrBinding = apps.match(/o\.bind\("SUPER \+ U"[\s\S]*?\n\s*dotfiles_bin[^\n]+\)/)[0];
    assert.match(herdrBinding, /df-launch-special-workspace/);
    assert.match(herdrBinding, new RegExp(INITIAL_CLASS.replaceAll(".", "\\.")));
    assert.match(herdrBinding, new RegExp(`--class=${INITIAL_CLASS.replaceAll(".", "\\.")}`));

    const launcherHerdr = directories.match(/function herdrLaunchArgv[\s\S]*?\n}/)[0];
    assert.doesNotMatch(launcherHerdr, /--class/);
    assert.doesNotMatch(launcherHerdr, new RegExp(INITIAL_CLASS.replaceAll(".", "\\.")));
});

test("native application bindings declare their exact initial classes", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");

    for (const { keys, initialClass, workspace, launch } of NATIVE_APPLICATIONS) {
        const binding = apps.match(new RegExp(
            `o\\.bind\\("${keys.replaceAll("+", "\\+")}\\"[\\s\\S]*?\\n\\s*dotfiles_bin[^\\n]+\\)`
        ))[0];
        assert.match(binding, /df-launch-special-workspace/);
        assert.match(binding, new RegExp(`"${initialClass}" "${workspace}"`));
        assert.match(binding, new RegExp(launch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.doesNotMatch(binding, /df-launch-special-app/);
    }
});

test("each native identity ignores titles and focuses its sole exact client wherever it lives", t => {
    for (const { initialClass, workspace } of NATIVE_APPLICATIONS) {
        const titleOnly = client(`0xtitle-${initialClass}`, "wrong-class", `special:${workspace}`, {
            title: initialClass,
            initialTitle: initialClass
        });
        const exact = client(`0xexact-${initialClass}`, initialClass, "8", {
            title: "renamed window",
            initialTitle: "unrelated title"
        });
        const harness = fixture(t, { clients: [[titleOnly, exact]] });

        const result = harness.run(workspace, [initialClass], initialClass);

        assert.strictEqual(result.status, 0, result.stderr);
        const focuses = dispatchesNamed(harness.dispatches(), "focuswindow", "hl.dsp.focus");
        assert.strictEqual(focuses.length, 1);
        assert.match(focuses[0].join(" "), new RegExp(`address:0xexact-${initialClass}`));
        assert.strictEqual(dispatchesNamed(harness.dispatches(), "exec", "hl.dsp.exec_cmd").length, 0);
    }
});

test("enabled Special Workspace bindings use only the shared exact-class lifecycle", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    const otherMenu = fs.readFileSync(path.join(ROOT,
        "quickshell/.config/quickshell/launcher/modules/OtherMenu.qml"), "utf8");
    const zellij = fs.readFileSync(path.join(ROOT,
        "quickshell/.config/quickshell/launcher/lib/zellij.js"), "utf8");
    const enabledConfig = apps.split("\n").filter(line => !/^\s*--/.test(line)).join("\n");

    assert.strictEqual(fs.existsSync(path.join(ROOT, "bin/df-launch-special-app")), false);
    assert.doesNotMatch(`${enabledConfig}\n${otherMenu}\n${zellij}`, /df-launch-special-app/);
});
