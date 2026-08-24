const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const LAUNCHER = path.join(ROOT, "bin/df-launch-claude");

function runLauncher(t, desktopInstalled) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-launcher-"));
    const recorded = path.join(temp, "argv.json");
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

    fs.symlinkSync(LAUNCHER, path.join(temp, "df-launch-claude"));
    for (const command of ["df-launch-special-workspace", "df-launch-special-webapp"]) {
        const delegate = path.join(temp, command);
        fs.writeFileSync(delegate, `#!/usr/bin/node
require("node:fs").writeFileSync(process.env.RECORDED_ARGV,
    JSON.stringify({ command: process.argv[1].split("/").pop(), args: process.argv.slice(2) }));
`);
        fs.chmodSync(delegate, 0o755);
    }

    if (desktopInstalled) {
        const desktop = path.join(temp, "claude-desktop");
        fs.writeFileSync(desktop, "#!/bin/sh\nexit 0\n");
        fs.chmodSync(desktop, 0o755);
    }

    const result = childProcess.spawnSync("/bin/bash", [path.join(temp, "df-launch-claude")], {
        env: { ...process.env, PATH: temp, RECORDED_ARGV: recorded },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    return JSON.parse(fs.readFileSync(recorded, "utf8"));
}

test("Claude Desktop opens on the ai Special Workspace when installed", t => {
    assert.deepStrictEqual(runLauncher(t, true), {
        command: "df-launch-special-workspace",
        args: ["com.anthropic.Claude", "ai", "claude-desktop"]
    });
});

test("the Claude web app opens on the ai Special Workspace when the desktop app is absent", t => {
    assert.deepStrictEqual(runLauncher(t, false), {
        command: "df-launch-special-webapp",
        args: ["chrome-claude.ai__chat-Profile_2", "https://claude.ai/chat", "ai"]
    });
});

test("SUPER+A uses the Claude launcher", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    const binding = apps.match(/o\.bind\("SUPER \+ A", "Claude",[\s\S]*?\n\s*dotfiles_bin[^\n]+\)/)[0];

    assert.match(binding, /df-launch-claude/);
});
