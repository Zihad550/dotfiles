const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SESSION = path.join(ROOT, "bin/df-herdr-session");

// HOME is pinned as well as PATH -- see
// docs/adr/0007-super-u-follows-devcontainer-routing.md.
function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-session-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    const toggles = path.join(home, ".local/state/dotfiles/toggles");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(toggles, { recursive: true });
    fs.mkdirSync(path.join(home, "dotfiles"), { recursive: true });

    const invocation = path.join(home, "invocation");
    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
{
    printf '%s\\n' "$PWD"
    printf '%s\\n' "$@"
} > "${invocation}"
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);

    if (options.routing)
        fs.writeFileSync(path.join(toggles, "devcontainer-routing"), "");
    if (options.host !== undefined)
        fs.writeFileSync(path.join(home, ".local/state/dotfiles/devcontainer-host"), options.host);

    function run(...args) {
        const result = childProcess.spawnSync(SESSION, args, {
            env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` },
            encoding: "utf8"
        });
        result.invocation = fs.existsSync(invocation)
            ? fs.readFileSync(invocation, "utf8").trim().split("\n")
            : null;
        return result;
    }

    return { home, run };
}

test("routing off opens the local session in the requested directory", t => {
    const harness = fixture(t);

    const result = harness.run("herdr", path.join(harness.home, "dotfiles"));

    assert.strictEqual(result.status, 0, result.stderr);
    const [cwd, ...argv] = result.invocation;
    assert.strictEqual(cwd, fs.realpathSync(path.join(harness.home, "dotfiles")));
    assert.deepStrictEqual(argv, ["--session", "herdr"]);
});

test("routing on for a mirrored directory opens a remote session on the default host", t => {
    const harness = fixture(t, { routing: true });

    const result = harness.run("herdr", path.join(harness.home, "dotfiles"));

    assert.strictEqual(result.status, 0, result.stderr);
    const [, ...argv] = result.invocation;
    assert.deepStrictEqual(argv, ["--remote", "devcontainer.devpod", "--session", "herdr"]);
});

test("routing on for an unmirrored directory stays local", t => {
    const harness = fixture(t, { routing: true });
    const outside = path.join(harness.home, "scratch");
    fs.mkdirSync(outside);

    const result = harness.run("scratch", outside);

    assert.strictEqual(result.status, 0, result.stderr);
    const [cwd, ...argv] = result.invocation;
    assert.strictEqual(cwd, fs.realpathSync(outside));
    assert.deepStrictEqual(argv, ["--session", "scratch"]);
});

test("a configured host replaces the default, and a blank one falls back to it", t => {
    const custom = fixture(t, { routing: true, host: "  devbox.local  \n" });
    const blank = fixture(t, { routing: true, host: "\n" });

    const customResult = custom.run("herdr", path.join(custom.home, "dotfiles"));
    const blankResult = blank.run("herdr", path.join(blank.home, "dotfiles"));

    assert.strictEqual(customResult.status, 0, customResult.stderr);
    assert.deepStrictEqual(customResult.invocation.slice(1),
        ["--remote", "devbox.local", "--session", "herdr"]);
    assert.strictEqual(blankResult.status, 0, blankResult.stderr);
    assert.deepStrictEqual(blankResult.invocation.slice(1),
        ["--remote", "devcontainer.devpod", "--session", "herdr"]);
});

test("SUPER+U routes like every other call site, passing no local override", () => {
    const apps = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/apps.lua"), "utf8");
    const script = fs.readFileSync(SESSION, "utf8");

    const binding = apps.match(/o\.bind\("SUPER \+ U"[\s\S]*?\n\s*dotfiles_bin[^\n]+\)/);
    assert.ok(binding, "the SUPER+U binding is no longer recognisable in apps.lua");
    assert.match(binding[0], /df-herdr-session/);
    assert.doesNotMatch(binding[0], /--local/);
    assert.doesNotMatch(script, /--local/);
});
