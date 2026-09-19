const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-video-seek");

function source(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "video-seek-"));
    const bin = path.join(directory, "bin");
    const calls = path.join(directory, "wtype-calls");
    fs.mkdirSync(bin);
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    fs.writeFileSync(path.join(bin, "wtype"), `#!/usr/bin/env bash
printf '%s\n' "$@" > "${calls}"
`, { mode: 0o755 });

    function run(action) {
        return childProcess.spawnSync(SCRIPT, action === undefined ? [] : [action], {
            encoding: "utf8",
            env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
        });
    }

    return { calls, run };
}

test("video seek translates durations into arrow key presses", t => {
    const harness = fixture(t);
    const cases = [
        ["forward-5", "Right", 1],
        ["forward-15", "Right", 3],
        ["forward-30", "Right", 6],
        ["back-5", "Left", 1],
        ["back-15", "Left", 3],
        ["back-30", "Left", 6],
    ];

    for (const [action, key, count] of cases) {
        const result = harness.run(action);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.deepStrictEqual(
            fs.readFileSync(harness.calls, "utf8").trim().split("\n"),
            Array.from({ length: count }, () => ["-k", key]).flat(),
        );
    }
});

test("video seek rejects an unknown action", t => {
    const harness = fixture(t);
    const result = harness.run("forward");

    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /Usage:/);
    assert.strictEqual(fs.existsSync(harness.calls), false);
});

test("workstation setup installs wtype and exposes four-finger seek gestures", () => {
    const packages = source("setup/arch-workstation/packages/pacman-apps");
    const input = source("hypr/.config/hypr/lua/input.lua");

    assert.match(packages, /^\s*wtype \\$/m);
    assert.match(input, /DOTFILES_PROFILE"\) == "arch-workstation"/);
    assert.match(input, /direction = "left",[\s\S]*video_seek \.\. " back-5"/);
    assert.match(input, /direction = "right",[\s\S]*video_seek \.\. " forward-5"/);
});
