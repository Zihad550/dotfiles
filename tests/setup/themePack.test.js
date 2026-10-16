// The theme pack: lookup order, the sparse clone's list/fetch/remove cycle,
// Omarchy-format themes, and the setup wiring. A local git repo stands in for
// GitHub. See docs/adr/0039-themes-download-from-a-separate-pack.md.
//
//     node --test tests/setup/themePack.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const bin = name => path.join(repoRoot, "bin", name);

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function git(cwd, ...args) {
    childProcess.execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args],
        { cwd, stdio: "pipe" });
}

function writeTheme(dir, files) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files))
        fs.writeFileSync(path.join(dir, name), content);
}

const ansiColors = Array.from({ length: 16 }, (_, i) => `color${i} = "#0000${String(i).padStart(2, "0")}"`)
    .concat(['accent = "#112233"', 'cursor = "#445566"', 'foreground = "#eeeeee"',
        'background = "#101010"', 'selection_foreground = "#eeeeee"', 'selection_background = "#333333"'])
    .join("\n") + "\n";

// A sandbox HOME, an empty user root, and a pack remote holding `themes`.
function sandbox(t, themes = ["nord", "rose-pine"], extraFiles = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-theme-pack-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const remote = path.join(root, "remote");
    for (const name of themes)
        writeTheme(path.join(remote, name), { "colors.toml": ansiColors });
    fs.writeFileSync(path.join(remote, ".gitignore"), "*/ghostty.conf\n");
    for (const [file, content] of Object.entries(extraFiles)) {
        fs.mkdirSync(path.dirname(path.join(remote, file)), { recursive: true });
        fs.writeFileSync(path.join(remote, file), content);
    }
    git(remote, "init", "-q", "-b", "main");
    git(remote, "config", "uploadpack.allowFilter", "true");
    git(remote, "add", "-A");
    git(remote, "commit", "-qm", "themes");

    const home = path.join(root, "home");
    fs.mkdirSync(path.join(home, ".config"), { recursive: true });
    const env = {
        ...process.env,
        HOME: home,
        DF_THEME_PACK_DIR: path.join(home, "dotfiles-themes"),
        DF_THEME_PACK_URL: `file://${remote}`,
        DF_THEME_USER_DIR: path.join(home, ".local/share/dotfiles/themes"),
    };
    const run = (name, ...args) => childProcess.spawnSync(bin(name), args, { encoding: "utf8", env });
    return { root, remote, home, env, run };
}

function listed(run) {
    const result = run("df-theme-list");
    assert.strictEqual(result.status, 0, result.stderr);
    return result.stdout.trim().split("\n").map(line => line.split("\t").slice(0, 2).join(" "));
}

test("before the pack is cloned, only the built-in theme is listed", t => {
    const { run } = sandbox(t);
    assert.deepStrictEqual(listed(run), ["installed kanagawa"]);
});

test("the index lists pack themes as available without downloading them", t => {
    const { run, env } = sandbox(t);

    const init = run("df-theme-fetch", "--sync");
    assert.strictEqual(init.status, 0, init.stderr);
    assert.deepStrictEqual(listed(run), ["installed kanagawa", "available nord", "available rose-pine"]);
    assert.strictEqual(fs.existsSync(path.join(env.DF_THEME_PACK_DIR, "nord")), false,
        "the sparse clone must not check out any theme up front");
});

test("fetching checks out one theme, which then resolves ahead of the built-in root", t => {
    const { run, env } = sandbox(t);

    const fetched = run("df-theme-fetch", "nord");
    assert.strictEqual(fetched.status, 0, fetched.stderr);
    assert.deepStrictEqual(listed(run), ["installed nord", "installed kanagawa", "available rose-pine"]);
    assert.strictEqual(run("df-theme-dir", "nord").stdout.trim(), path.join(env.DF_THEME_PACK_DIR, "nord"));
    assert.strictEqual(fs.existsSync(path.join(env.DF_THEME_PACK_DIR, "rose-pine")), false);

    const missing = run("df-theme-fetch", "nope");
    assert.notStrictEqual(missing.status, 0);
    assert.match(missing.stderr, /not in/);
});

test("a theme added upstream is fetchable after the index catches up", t => {
    const { run, remote } = sandbox(t);
    assert.strictEqual(run("df-theme-fetch", "--sync").status, 0);

    writeTheme(path.join(remote, "gruvbox"), { "colors.toml": ansiColors });
    git(remote, "add", "-A");
    git(remote, "commit", "-qm", "gruvbox");

    const fetched = run("df-theme-fetch", "gruvbox");
    assert.strictEqual(fetched.status, 0, fetched.stderr);
});

test("removing a pack theme drops its checkout, generated files included, but keeps it available", t => {
    const { run, env } = sandbox(t);
    assert.strictEqual(run("df-theme-fetch", "nord").status, 0);
    assert.strictEqual(run("df-theme-generate", "nord").status, 0);

    const removed = run("df-theme-remove", "nord", "--force");
    assert.strictEqual(removed.status, 0, removed.stderr);
    assert.strictEqual(fs.existsSync(path.join(env.DF_THEME_PACK_DIR, "nord")), false);
    assert.deepStrictEqual(listed(run), ["installed kanagawa", "available nord", "available rose-pine"]);
});

test("the built-in theme cannot be removed", t => {
    const { run } = sandbox(t);
    const result = run("df-theme-remove", "kanagawa", "--force");
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /built-in/);
});

test("an Omarchy theme installs without its code-running files and renders every colour", t => {
    const { run, root, env } = sandbox(t);
    const repo = path.join(root, "omarchy-aurora-theme");
    writeTheme(repo, {
        "colors.toml": ['mode = "light"', 'accent = "#123456"', 'background = "#fafafa"',
            'foreground = "#222222"', 'muted = "#888888"', 'selection = "#cccccc"',
            'red = "#aa0000"', 'green = "#00aa00"', 'yellow = "#aaaa00"', 'blue = "#0000aa"',
            'magenta = "#aa00aa"', 'cyan = "#00aaaa"'].join("\n") + "\n",
        "neovim.lua": "os.execute('true')\n",
        "vscode.json": "{}\n",
    });
    fs.symlinkSync("/etc/passwd", path.join(repo, "preview.png"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "theme");

    const result = run("df-theme-install", `file://${repo}`);
    assert.strictEqual(result.status, 0, result.stderr);

    const dir = path.join(env.DF_THEME_USER_DIR, "aurora");
    for (const dropped of ["neovim.lua", "vscode.json", "preview.png"])
        assert.strictEqual(fs.existsSync(path.join(dir, dropped)), false, `${dropped} should be dropped`);
    assert.strictEqual(fs.existsSync(path.join(env.HOME, ".config/theme-previews/aurora.png")), false);
    assert.ok(fs.existsSync(path.join(dir, "light.mode")), "mode = light becomes the light.mode marker");

    const ghostty = fs.readFileSync(path.join(dir, "ghostty.conf"), "utf8");
    assert.doesNotMatch(ghostty, /\{\{/);
    assert.match(ghostty, /palette = 1=#aa0000/);
    assert.match(ghostty, /palette = 9=#aa0000/, "bright colours fall back to their base colour");
    assert.match(ghostty, /palette = 8=#888888/, "color8 comes from muted");
});

test("a third-party theme may not shadow a pack or built-in theme", t => {
    const { run, root } = sandbox(t);
    assert.strictEqual(run("df-theme-fetch", "--sync").status, 0);

    for (const name of ["kanagawa", "omarchy-nord-theme"]) {
        const repo = path.join(root, name);
        writeTheme(repo, { "colors.toml": ansiColors });
        git(repo, "init", "-q", "-b", "main");
        git(repo, "add", "-A");
        git(repo, "commit", "-qm", "theme");

        const result = run("df-theme-install", `file://${repo}`);
        assert.notStrictEqual(result.status, 0, `${name} should be refused`);
        assert.match(result.stderr, /collides/);
    }
});

test("setup clones the pack index before applying the default, and nothing stows themes", () => {
    const step = source("setup/arch-workstation/theme");
    assert.match(step, /df-theme-fetch --sync \|\|[\s\S]*df-theme-set default/,
        "a failed clone must not stop the built-in default from applying");
    assert.match(source("bin/df-theme-set"), /^df-theme-migrate$/m,
        "every theme switch must migrate machines set up before the pack");

    for (const script of ["setup/arch-workstation/stow", "scripts/stow/stow-base"])
        assert.doesNotMatch(source(script), /^\s*stow themes\b/m, `${script} still stows themes`);
    assert.ok(fs.existsSync(path.join(repoRoot, "themes/builtin/kanagawa/colors.toml")));
});

test("only top-level folders with a valid name and a colors.toml are listed as available", t => {
    const { run } = sandbox(t, ["nord"], {
        ".github/workflows/ci.yml": "on: push\n",
        "scripts/build.sh": "true\n",
        "Bad Name/colors.toml": ansiColors,
    });
    assert.strictEqual(run("df-theme-fetch", "--sync").status, 0);
    assert.deepStrictEqual(listed(run), ["installed kanagawa", "available nord"]);
    assert.notStrictEqual(run("df-theme-fetch", "scripts").status, 0,
        "a folder without colors.toml at its top is not a theme");
});

test("theme names cannot escape the theme roots", t => {
    const { run, root } = sandbox(t);
    writeTheme(path.join(root, "outside"), { "colors.toml": ansiColors });
    for (const name of ["../../outside", "/etc", ".hidden", "a/b"])
        assert.notStrictEqual(run("df-theme-dir", name).status, 0, `${name} should not resolve`);
});

test("concurrent syncs and fetches on one clone both succeed", async t => {
    const { env } = sandbox(t);
    const spawn = (...args) => new Promise(resolve => {
        const child = childProcess.spawn(bin("df-theme-fetch"), args, { env });
        let stderr = "";
        child.stderr.on("data", chunk => stderr += chunk);
        child.on("close", status => resolve({ status, stderr }));
    });

    const results = await Promise.all([spawn("--sync"), spawn("nord"), spawn("--sync"), spawn("rose-pine")]);
    for (const result of results)
        assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(env.DF_THEME_PACK_DIR, "nord/colors.toml")));
    assert.ok(fs.existsSync(path.join(env.DF_THEME_PACK_DIR, "rose-pine/colors.toml")));
});

test("a third-party install is refused when the pack index cannot be checked", t => {
    const { run, root, env } = sandbox(t);
    const repo = path.join(root, "omarchy-nord-theme");
    writeTheme(repo, { "colors.toml": ansiColors });
    git(repo, "init", "-q", "-b", "main");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "theme");

    const offline = childProcess.spawnSync(bin("df-theme-install"), [`file://${repo}`], {
        encoding: "utf8",
        env: { ...env, DF_THEME_PACK_URL: `file://${root}/missing` },
    });
    assert.notStrictEqual(offline.status, 0);
    assert.match(offline.stderr, /could not sync/);
    assert.strictEqual(fs.existsSync(path.join(env.DF_THEME_USER_DIR, "nord")), false);
});

test("migration moves third-party themes out of the old repo tree and drops the old link", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-theme-migrate-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const dotfiles = path.join(root, "dotfiles");
    const old = path.join(dotfiles, "themes/.config/themes");
    fs.mkdirSync(dotfiles);
    fs.symlinkSync(path.join(repoRoot, "bin"), path.join(dotfiles, "bin"));
    writeTheme(path.join(old, "tracked"), { "colors.toml": ansiColors });
    git(dotfiles, "init", "-q", "-b", "main");
    git(dotfiles, "add", "themes");
    git(dotfiles, "commit", "-qm", "old layout");
    writeTheme(path.join(old, "aurora"), { "colors.toml": ansiColors });

    const home = path.join(root, "home");
    fs.mkdirSync(path.join(home, ".config"), { recursive: true });
    fs.symlinkSync(old, path.join(home, ".config/themes"));
    const pack = path.join(root, "pack-remote");
    writeTheme(path.join(pack, "nord"), { "colors.toml": ansiColors });
    git(pack, "init", "-q", "-b", "main");
    git(pack, "add", "-A");
    git(pack, "commit", "-qm", "themes");
    const env = { ...process.env, HOME: home, DOTFILES_DIR: dotfiles,
        DF_THEME_USER_DIR: path.join(home, "user"),
        DF_THEME_PACK_DIR: path.join(home, "dotfiles-themes"),
        DF_THEME_PACK_URL: `file://${pack}` };
    const migrate = () => childProcess.spawnSync(bin("df-theme-migrate"), { encoding: "utf8", env });

    let result = migrate();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.existsSync(path.join(home, ".config/themes")), false);
    assert.ok(fs.existsSync(path.join(home, "user/aurora/colors.toml")));
    assert.ok(fs.existsSync(path.join(old, "tracked")), "a tracked theme waits for the pull to remove it");

    git(dotfiles, "rm", "-rq", "themes");
    git(dotfiles, "commit", "-qm", "pack");
    result = migrate();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.existsSync(path.join(dotfiles, "themes/.config")), false);
});

test("migration empties a real ~/.config/themes directory of per-theme links and clones", t => {
    const { run, home, env } = sandbox(t);
    const old = path.join(home, ".config/themes");
    fs.mkdirSync(old);
    fs.symlinkSync(path.join(repoRoot, "themes/builtin/kanagawa"), path.join(old, "kanagawa"));
    writeTheme(path.join(old, "aurora"), { "colors.toml": ansiColors });

    const result = run("df-theme-migrate");
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.existsSync(old), false);
    assert.ok(fs.existsSync(path.join(env.DF_THEME_USER_DIR, "aurora/colors.toml")));
    assert.ok(fs.existsSync(path.join(repoRoot, "themes/builtin/kanagawa/colors.toml")),
        "removing the per-theme link must not touch its target");
});

test("migration relinks a dangling active theme, downloading it from the pack", t => {
    const { run, home, env } = sandbox(t);
    const link = path.join(home, ".config/theme");
    fs.symlinkSync(path.join(home, ".config/themes/nord"), link);

    const result = run("df-theme-migrate");
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.readlinkSync(link), path.join(env.DF_THEME_PACK_DIR, "nord"));
    assert.ok(fs.existsSync(path.join(link, "ghostty.conf")), "the relinked theme must be generated");
});

test("df-theme-list reports which root each installed theme came from", t => {
    const { run } = sandbox(t);
    assert.strictEqual(run("df-theme-fetch", "nord").status, 0);
    const kinds = run("df-theme-list", "--installed").stdout.trim().split("\n")
        .map(line => { const [, name, , kind] = line.split("\t"); return `${name} ${kind}`; });
    assert.deepStrictEqual(kinds, ["nord pack", "kanagawa builtin"]);
});

test("install waits for a running sync before checking for collisions", async t => {
    const { root, env } = sandbox(t);
    const repo = path.join(root, "omarchy-nord-theme");
    writeTheme(repo, { "colors.toml": ansiColors });
    git(repo, "init", "-q", "-b", "main");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "theme");

    const lockFile = path.join(env.XDG_RUNTIME_DIR || "/tmp", `df-theme-fetch-${process.getuid()}.lock`);
    const holder = childProcess.spawn("flock", [lockFile, "sleep", "1"]);
    t.after(() => holder.kill());
    await new Promise(resolve => setTimeout(resolve, 200));

    const result = await new Promise(resolve => {
        const child = childProcess.spawn(bin("df-theme-install"), [`file://${repo}`], { env });
        let stderr = "";
        child.stderr.on("data", chunk => stderr += chunk);
        child.on("close", status => resolve({ status, stderr }));
    });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /collides/);
});

test("migration drops dangling per-theme links and won't let a moved theme shadow the pack", t => {
    const { run, home, env } = sandbox(t);
    assert.strictEqual(run("df-theme-fetch", "--sync").status, 0);
    const old = path.join(home, ".config/themes");
    fs.mkdirSync(old);
    fs.symlinkSync(path.join(home, "gone"), path.join(old, "catppuccin"));
    writeTheme(path.join(old, "nord"), { "colors.toml": ansiColors });

    const result = run("df-theme-migrate");
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.existsSync(path.join(old, "catppuccin")) || isLink(path.join(old, "catppuccin")), false);
    assert.strictEqual(fs.existsSync(path.join(env.DF_THEME_USER_DIR, "nord")), false,
        "nord is a pack theme; a user copy would shadow it");
    assert.match(result.stderr, /left theme 'nord'/);
});

function isLink(file) {
    try {
        return fs.lstatSync(file).isSymbolicLink();
    } catch {
        return false;
    }
}

test("migration leaves third-party themes in place while the pack can't be checked", t => {
    const { home, env } = sandbox(t);
    const old = path.join(home, ".config/themes");
    writeTheme(path.join(old, "aurora"), { "colors.toml": ansiColors });

    const result = childProcess.spawnSync(bin("df-theme-migrate"), {
        encoding: "utf8",
        env: { ...env, DF_THEME_PACK_URL: `file://${home}/missing` },
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(old, "aurora/colors.toml")));
    assert.match(result.stderr, /unreachable/);
});

test("migration skips the pack sync once there is nothing left to migrate", t => {
    const { run, env } = sandbox(t);
    const result = run("df-theme-migrate");
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.existsSync(env.DF_THEME_PACK_DIR), false);
});
