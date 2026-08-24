const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const LAUNCHER = path.join(ROOT, "bin/df-launch-special-webapp");
const SHARED_LAUNCHER = path.join(ROOT, "bin/df-launch-special-workspace");
const WEB_APPS = [
    ["Calendar", "chrome-calendar.google.com__calendar-Profile_2", "https://calendar.google.com/calendar", "calendar"],
    ["Meet", "chrome-meet.google.com__-Profile_2", "https://meet.google.com", "meet"],
    ["Zulip", "chrome-mamacrm.zulipchat.com__-Profile_2", "https://mamacrm.zulipchat.com", "zulip"],
    ["YouTube", "chrome-www.youtube.com__-Profile_2", "https://www.youtube.com", "yt"],
    ["Tasks", "chrome-tasks.google.com__u_1_tasks_-Profile_2", "https://tasks.google.com/u/1/tasks/", "tasks"],
    ["Figma", "chrome-www.figma.com__-Profile_2", "https://www.figma.com", "figma"],
    ["Quran", "chrome-quran.com__-Profile_2", "https://quran.com", "holy-quran"]
];

test("the web-app adapter preserves identity, workspace, URL, profile, and extra launch arguments", t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "special-webapp-"));
    const adapter = path.join(temp, "df-launch-special-webapp");
    const delegate = path.join(temp, "df-launch-special-workspace");
    const recorded = path.join(temp, "argv.json");
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.symlinkSync(LAUNCHER, adapter);

    fs.writeFileSync(delegate, `#!/usr/bin/node
require("node:fs").writeFileSync(process.env.RECORDED_ARGV, JSON.stringify(process.argv.slice(2)));
`);
    fs.chmodSync(delegate, 0o755);

    const result = childProcess.spawnSync(adapter, [
        "chrome-example.test__path-Profile_2",
        "https://example.test/path?q=two words&next=$(hostile)",
        "research",
        "--hostile=$(touch never)",
        "--label=two words"
    ], {
        env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, RECORDED_ARGV: recorded },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(recorded, "utf8")), [
        "chrome-example.test__path-Profile_2",
        "research",
        "helium-browser",
        "--profile-directory=Profile 2",
        "--new-window",
        "--ozone-platform=wayland",
        "--ozone-platform-hint=wayland",
        "--app=https://example.test/path?q=two words&next=$(hostile)",
        "--hostile=$(touch never)",
        "--label=two words"
    ]);
});

test("an absolute adapter launch resolves the shared launcher beside it without relying on PATH", t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "special-webapp-path-"));
    const adapter = path.join(temp, "df-launch-special-webapp");
    const delegate = path.join(temp, "df-launch-special-workspace");
    const recorded = path.join(temp, "argv.json");
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.symlinkSync(LAUNCHER, adapter);
    fs.writeFileSync(delegate, `#!/usr/bin/node
require("node:fs").writeFileSync(process.env.RECORDED_ARGV, JSON.stringify(process.argv.slice(2)));
`);
    fs.chmodSync(delegate, 0o755);

    const result = childProcess.spawnSync(adapter, [
        "chrome-claude.ai__chat-Profile_2", "https://claude.ai/chat", "ai"
    ], {
        env: { ...process.env, PATH: "/usr/bin", RECORDED_ARGV: recorded },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(fs.readFileSync(recorded, "utf8"))[0],
        "chrome-claude.ai__chat-Profile_2");
});

test("all web-app bindings declare their URL-derived identity", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    for (const [name, identity] of WEB_APPS) {
        const binding = apps.match(new RegExp(`o\\.bind\\([^\\n]+, "${name}",[\\s\\S]*?\\n\\s*dotfiles_bin[^\\n]+\\)`))[0];
        assert.match(binding, /df-launch-special-webapp/);
        assert.match(binding, new RegExp(identity.replaceAll(".", "\\.")));
    }
});

test("all seven web apps cross the adapter boundary with their declared configuration", t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "special-webapps-"));
    const adapter = path.join(temp, "df-launch-special-webapp");
    const delegate = path.join(temp, "df-launch-special-workspace");
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.symlinkSync(LAUNCHER, adapter);
    fs.writeFileSync(delegate, `#!/usr/bin/node
require("node:fs").appendFileSync(process.env.RECORDED_ARGV,
    JSON.stringify(process.argv.slice(2)) + "\\n");
`);
    fs.chmodSync(delegate, 0o755);
    const recorded = path.join(temp, "argv.jsonl");
    const env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, RECORDED_ARGV: recorded };

    for (const [, identity, url, workspace] of WEB_APPS) {
        const result = childProcess.spawnSync(adapter, [identity, url, workspace], { env, encoding: "utf8" });
        assert.strictEqual(result.status, 0, result.stderr);
    }

    const calls = fs.readFileSync(recorded, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepStrictEqual(calls.map(call => [call[0], call[1], call[7]]),
        WEB_APPS.map(([, identity, url, workspace]) => [identity, workspace, `--app=${url}`]));
});

test("a Chromium client launched elsewhere is moved by address and verified through the adapter", t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "special-webapp-move-"));
    const state = path.join(temp, "state");
    fs.mkdirSync(state);
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    fs.symlinkSync(SHARED_LAUNCHER, path.join(temp, "df-launch-special-workspace"));
    fs.writeFileSync(path.join(state, "client-call"), "0");
    fs.writeFileSync(path.join(temp, "hyprctl"), `#!/usr/bin/node
const fs = require("node:fs");
const path = require("node:path");
const state = process.env.TEST_STATE;
const args = process.argv.slice(2);
if (args[0] === "activewindow") process.stdout.write('{"workspace":{"name":"1"}}');
else if (args[0] === "clients") {
    const file = path.join(state, "client-call");
    const call = Number(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, String(call + 1));
    const client = { address: "0xnew", initialClass: process.env.INITIAL_CLASS,
        workspace: { name: call < 3 ? "3" : "special:" + process.env.WORKSPACE } };
    process.stdout.write(JSON.stringify(call < 2 ? [] : [client]));
} else if (args[0] === "dispatch") {
    fs.appendFileSync(path.join(state, "dispatches"), JSON.stringify(args.slice(1)) + "\\n");
} else process.exit(2);
`);
    fs.chmodSync(path.join(temp, "hyprctl"), 0o755);
    fs.writeFileSync(path.join(temp, "notify-send"), "#!/usr/bin/env true\n");
    fs.chmodSync(path.join(temp, "notify-send"), 0o755);
    const [identity, url, workspace] = WEB_APPS[0].slice(1);
    const result = childProcess.spawnSync(LAUNCHER, [identity, url, workspace], {
        env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, TEST_STATE: state,
            INITIAL_CLASS: identity, WORKSPACE: workspace, XDG_RUNTIME_DIR: temp,
            DF_SPECIAL_WORKSPACE_POLL_INTERVAL: "0.01" },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    const dispatches = fs.readFileSync(path.join(state, "dispatches"), "utf8");
    assert.match(dispatches, /address:0xnew/);
    assert.match(dispatches, new RegExp(`special:${workspace}`));
});
