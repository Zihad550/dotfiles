// Process-level tests for df-launch-role. They assert the launch argv at the
// uwsm/tui seam, not whether a compositor creates a window.

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const COMMAND = path.join(ROOT, "bin/df-launch-role");
const REGISTRY = path.join(ROOT, "dotfiles/.config/dotfiles/default-apps.json");

function fixture(t, role, key, desktopNames) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "role-launcher-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const bin = path.join(home, "bin");
    const desktop = path.join(home, "applications");
    const config = path.join(home, ".config/dotfiles");
    const state = path.join(home, ".local/state/dotfiles/default-apps");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(desktop, { recursive: true });
    fs.mkdirSync(config, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    fs.copyFileSync(REGISTRY, path.join(config, "default-apps.json"));
    const roleLauncher = path.join(bin, "df-launch-role");
    fs.symlinkSync(COMMAND, roleLauncher);
    for (const helper of ["df-default-app", "df-launch-tui", "df-launch-special-webapp"])
        fs.symlinkSync(path.join(ROOT, "bin", helper), path.join(bin, helper));
    const specialWorkspace = path.join(bin, "df-launch-special-workspace");
    const invocationPath = JSON.stringify(path.join(home, "invocation"));
    fs.writeFileSync(specialWorkspace,
        "#!/usr/bin/node\n" +
        "require('node:fs').writeFileSync(" + invocationPath +
        ", process.argv.slice(2).join('\\n'));\n");
    fs.chmodSync(specialWorkspace, 0o755);
    for (const name of desktopNames)
        fs.writeFileSync(path.join(desktop, name), "[Desktop Entry]\n");
    fs.writeFileSync(path.join(state, role), key + "\n");

    fs.writeFileSync(path.join(bin, "xdg-settings"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(bin, "xdg-mime"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(bin, "yazi"), "#!/usr/bin/env bash\nexit 0\n");
    for (const name of ["claude-desktop", "chatgpt"])
        fs.writeFileSync(path.join(bin, name), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(bin, "uwsm-app"), `#!/usr/bin/env bash
printf '%s\\n' "$@" > "${path.join(home, "invocation")}"
`);
    fs.writeFileSync(path.join(bin, "setsid"), "#!/usr/bin/env bash\nexec \"$@\"\n");
    fs.writeFileSync(path.join(bin, "ghostty"), "#!/usr/bin/env bash\nexit 0\n");
    for (const name of ["xdg-settings", "xdg-mime", "yazi", "claude-desktop", "chatgpt",
        "uwsm-app", "setsid", "ghostty"])
        fs.chmodSync(path.join(bin, name), 0o755);

    function run(...args) {
        const result = childProcess.spawnSync(roleLauncher, args, {
            env: {
                ...process.env,
                HOME: home,
                PATH: `${bin}:/usr/bin:/bin`,
                XDG_CONFIG_HOME: path.join(home, ".config"),
                XDG_STATE_HOME: path.join(home, ".local/state"),
                DF_DEFAULT_APP_DESKTOP_DIRS: desktop
            },
            encoding: "utf8"
        });
        result.invocation = fs.existsSync(path.join(home, "invocation"))
            ? fs.readFileSync(path.join(home, "invocation"), "utf8").trim().split("\n")
            : null;
        return result;
    }

    return { run, home };
}

test("a graphical role activates only its selected desktop entry", t => {
    const harness = fixture(t, "browser", "zen", ["app.zen_browser.zen.desktop"]);
    const result = harness.run("browser");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation, ["--", "app.zen_browser.zen.desktop"]);
});

test("the file-manager role passes home to a terminal candidate", t => {
    const harness = fixture(t, "file-manager", "yazi", []);
    const result = harness.run("file-manager");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation, ["--", "ghostty", "-e", "yazi", harness.home]);
});

test("an AI desktop candidate uses the special workspace launcher", t => {
    const harness = fixture(t, "ai", "claude-desktop", ["com.anthropic.Claude.desktop"]);
    const result = harness.run("ai");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation, [
        "com.anthropic.Claude", "ai", "claude-desktop"
    ]);
});

test("an AI web candidate uses the special web-app launcher", t => {
    const harness = fixture(t, "ai", "chatgpt-web", ["ChatGPT.desktop"]);
    const result = harness.run("ai");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation, [
        "chrome-chatgpt.com__-Profile_2",
        "ai",
        "helium-browser",
        "--profile-directory=Profile 2",
        "--new-window",
        "--ozone-platform=wayland",
        "--ozone-platform-hint=wayland",
        "--app=https://chatgpt.com/"
    ]);
});

test("Claude Web App uses the special web-app launcher", t => {
    const harness = fixture(t, "ai", "claude-web", ["Claude.desktop"]);
    const result = harness.run("ai");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation.slice(0, 3), [
        "chrome-claude.ai__chat-Profile_2",
        "ai",
        "helium-browser"
    ]);
});

test("ChatGPT Desktop uses the special workspace launcher", t => {
    const harness = fixture(t, "ai", "chatgpt-desktop", ["chatgpt.desktop"]);
    const result = harness.run("ai");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.invocation, ["chatgpt", "ai", "chatgpt"]);
});
