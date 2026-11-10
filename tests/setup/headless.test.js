// Headless installers, the shared setup helpers, and the setup entry point.
//
//     node --test tests/setup/headless.test.js
//
// Setup scripts have no safe in-container runtime harness, so most checks pin
// source structure. Runtime attach/detach checks remain host-only.

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const stowScripts = [
    "setup/ubuntu-devbox/stow",
    "setup/ubuntu-server/stow",
    "setup/ubuntu-server/minimal-user",
];

const installers = [
    "setup/ubuntu-devbox/init",
    "setup/ubuntu-lxc-devbox/init",
    "setup/ubuntu-server/init",
    "setup/ubuntu-server/minimal-user",
];

const packageLists = [
    "setup/ubuntu-devbox/packages",
    "setup/ubuntu-server/packages",
    "setup/ubuntu-lxc-devbox/packages",
];

test("the headless matrix is non-empty", () => {
    assert.ok(stowScripts.length > 0, "stow enumeration is now asserting nothing");
    assert.ok(installers.length > 0, "installer enumeration is now asserting nothing");
    assert.ok(packageLists.length > 0, "package enumeration is now asserting nothing");
});

test("headless stow paths link Herdr config and never stow tmux", () => {
    for (const relativePath of [...stowScripts, "setup/proxmox/stow"]) {
        assert.doesNotMatch(source(relativePath), /^\s*stow\b[^\n]*\btmux\b/m,
            `${relativePath} still stows the retired multiplexer`);
    }
    for (const relativePath of stowScripts) {
        const script = source(relativePath);
        assert.match(script, /mkdir -p ~\/\.config\/herdr/,
            `${relativePath} does not create Herdr's runtime config directory`);
        assert.match(script, /ln -snf [^\n]*herdr\/\.config\/herdr\/config\.toml[^\n]*~\/\.config\/herdr\/config\.toml/,
            `${relativePath} does not link the managed Herdr config`);
    }
});

test("headless stow scripts link into HOME wherever the checkout lives", () => {
    for (const relativePath of [...stowScripts, "setup/proxmox/stow"]) {
        const stowLines = source(relativePath).split("\n").filter(line => /^\s*stow\b/.test(line));
        assert.ok(stowLines.length > 0, `${relativePath} has no stow lines`);
        for (const line of stowLines) {
            assert.match(line, /--target "\$HOME"/, `${relativePath}: ${line}`);
        }
    }
});

test("headless package lists do not install tmux", () => {
    for (const relativePath of packageLists) {
        assert.doesNotMatch(source(relativePath), /(^|\s)tmux(\s|\\|$)/m,
            `${relativePath} still installs tmux`);
    }
});

test("every headless installer reaches the shared Herdr installer", () => {
    for (const relativePath of installers) {
        assert.match(source(relativePath), /setup\/common\/setup-herdr/,
            `${relativePath} links or provisions a profile without installing Herdr`);
    }
});

test("the shared Herdr installer uses pacman on Arch and mise elsewhere", () => {
    const setup = source("setup/common/setup-herdr");

    assert.match(setup, /command -v pacman/);
    assert.match(setup, /pacman -Q herdr/);
    assert.match(setup, /mise use -g github:herdrdev\/herdr/);
    assert.match(setup, /skills add [^\n]* -y\s*$/m,
        "the global skill install would otherwise prompt during init");
    for (const plugin of ["tab-namer", "sidebar-index"]) {
        assert.ok(setup.includes(`herdr plugin link "$DOTFILES_DIR/herdr-plugins/${plugin}"`));
        assert.ok(fs.existsSync(path.join(repoRoot, "herdr-plugins", plugin)), `${plugin} is missing`);
    }
});

test("the machine profile is shared by UWSM and shell startup", t => {
    const writer = path.join(repoRoot, "setup/common/set-dotfiles-profile");

    for (const profile of ["arch-devbox", "arch-workstation", "ubuntu-lxc-devbox"]) {
        const configHome = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-profile-"));
        t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

        const result = childProcess.spawnSync(writer, [profile], {
            encoding: "utf8",
            env: { ...process.env, XDG_CONFIG_HOME: configHome },
        });

        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(
            fs.readFileSync(path.join(configHome, "uwsm/env.d/10-dotfiles-profile"), "utf8"),
            `export DOTFILES_PROFILE=${profile}\n`,
        );
    }
    assert.match(source("zsh/.zshenv"), /source "\$DOTFILES_PROFILE_ENV"/);
});

test("the machine profile writer rejects unknown targets", () => {
    const writer = path.join(repoRoot, "setup/common/set-dotfiles-profile");
    const result = childProcess.spawnSync(writer, ["arch-other"], { encoding: "utf8" });

    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /arch-devbox\|arch-workstation/);
});

test("the Ubuntu LXC devbox records its machine profile after every step", () => {
    const init = source("setup/ubuntu-lxc-devbox/init");
    const steps = [
        'check-machine-profile" ubuntu-lxc-devbox',
        '"$SETUP_DIR/packages"',
        'bash -e "$UBUNTU_DEVBOX_DIR/packages"',
        '"$SETUP_DIR/setup-docker"',
        'bash -e "$UBUNTU_DEVBOX_DIR/stow"',
        '"$UBUNTU_DEVBOX_DIR/tools"',
        "setup/common/setup-herdr",
        "setup/common/setup-skills",
        "chsh",
        'set-dotfiles-profile" ubuntu-lxc-devbox',
    ];
    const positions = steps.map(step => init.indexOf(step));

    for (const [index, step] of steps.entries()) {
        assert.ok(positions[index] >= 0, `init is missing ${step}`);
        if (index > 0) {
            assert.ok(positions[index] > positions[index - 1], `${step} runs too early`);
        }
    }
});

test("the Ubuntu LXC setup exports a login user when USER is absent", { skip: process.getuid?.() === 0 }, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lxc-init-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const setup = path.join(directory, "setup/ubuntu-lxc-devbox");
    const bin = path.join(directory, "bin");
    const calls = path.join(directory, "calls");
    fs.mkdirSync(setup, { recursive: true });
    fs.mkdirSync(bin);
    fs.copyFileSync(path.join(repoRoot, "setup/ubuntu-lxc-devbox/init"), path.join(setup, "init"));
    const stub = `#!/usr/bin/env bash
[ -n "\${USER:-}" ] || exit 2
printf '%s:%s\\n' "$0" "$USER" >> "$LXC_TEST_CALLS"
`;
    for (const relative of [
        "setup/ubuntu-lxc-devbox/packages", "setup/ubuntu-lxc-devbox/setup-docker",
        "setup/ubuntu-devbox/packages", "setup/ubuntu-devbox/stow", "setup/ubuntu-devbox/tools",
        "setup/common/check-machine-profile", "setup/common/setup-herdr",
        "setup/common/setup-skills", "setup/common/set-dotfiles-profile", "bin/sudo",
    ]) {
        const filename = path.join(directory, relative);
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, stub, { mode: 0o755 });
    }
    fs.writeFileSync(path.join(bin, "systemd-detect-virt"), "#!/bin/sh\necho lxc\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "zsh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const env = {
        ...process.env, HOME: directory, DOTFILES_DIR: directory,
        PATH: `${bin}:${process.env.PATH}`, LXC_TEST_CALLS: calls,
    };
    delete env.USER;
    const result = childProcess.spawnSync("bash", [path.join(setup, "init")], { encoding: "utf8", env });
    assert.strictEqual(result.status, 0, result.stderr);
    const expectedUser = os.userInfo().username;
    const steps = fs.readFileSync(calls, "utf8").trim().split("\n");
    assert.ok(steps.some(step => step.includes("set-dotfiles-profile")), "setup did not finish");
    assert.ok(steps.every(step => step.endsWith(`:${expectedUser}`)), "a child received no login user");
});

function runBoot(t, args, setupEnv = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "boot-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const calls = path.join(directory, "calls");
    const archDesktop = path.join(directory, "arch-desktop");
    fs.mkdirSync(path.join(archDesktop, "setup"), { recursive: true });
    fs.writeFileSync(path.join(archDesktop, "setup/boot.sh"),
        `#!/usr/bin/env bash\nprintf 'arch-desktop:%s:%s\\n' "$1" "$DOTFILES_DIR" >> "${calls}"\n`, { mode: 0o755 });
    const result = childProcess.spawnSync(path.join(repoRoot, "setup/boot.sh"), args, {
        encoding: "utf8",
        env: { ...process.env, ARCH_DESKTOP_DIR: archDesktop, XDG_CONFIG_HOME: path.join(directory, "config"), ...setupEnv },
    });
    return { ...result, calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8") : "" };
}

test("boot.sh lists the Arch and headless targets", t => {
    const result = runBoot(t, ["--help"]);
    assert.strictEqual(result.status, 0, result.stderr);
    for (const target of ["arch-workstation", "arch-devbox", "ubuntu-lxc-devbox", "ubuntu-devbox", "ubuntu-server", "proxmox"]) {
        assert.match(result.stdout, new RegExp(`^  - ${target}$`, "m"));
    }
    assert.doesNotMatch(result.stdout, /^  - (common|devvm)$/m);
});

test("boot.sh hands Arch targets to arch-desktop with this checkout", t => {
    for (const target of ["arch-workstation", "arch-devbox"]) {
        const result = runBoot(t, [target]);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(result.calls, `arch-desktop:${target}:${repoRoot}\n`);
    }
});

test("boot.sh rejects unknown targets and paths", t => {
    for (const target of ["nope", "common", "../setup/ubuntu-devbox", "ubuntu-devbox/../proxmox"]) {
        const result = runBoot(t, [target]);
        assert.strictEqual(result.status, 1, target);
        assert.match(result.stderr, /is not a setup target/);
        assert.strictEqual(result.calls, "");
    }
});

test("boot.sh refuses a target that differs from the machine profile", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "boot-profile-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const profile = path.join(directory, "uwsm/env.d/10-dotfiles-profile");
    fs.mkdirSync(path.dirname(profile), { recursive: true });
    fs.writeFileSync(profile, "export DOTFILES_PROFILE=arch-devbox\n");
    const result = runBoot(t, ["ubuntu-lxc-devbox"], { XDG_CONFIG_HOME: directory });

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /already set up as 'arch-devbox'/);
    assert.match(result.stderr, /~\/dotfiles\/setup\/boot\.sh arch-devbox/);
});
