// The headless multiplexer migration, asserted against source text.
//
//     node --test tests/setup/wiring.test.js
//
// Setup scripts have no safe in-container runtime harness. These checks pin
// the structural seam instead: each migrated stow path links the shared Herdr
// config, its entrypoint reaches the shared installer, and tmux is no longer
// installed or stowed there. Runtime attach/detach checks remain host-only.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const stowScripts = [
    "setup/ubuntu-devbox/stow",
    "setup/ubuntu-server/stow",
    "setup/ubuntu-server/minimal-user",
    "setup/alpine/minimal-user",
];

const installers = [
    "setup/ubuntu-devbox/init",
    "setup/ubuntu-server/init",
    "setup/ubuntu-server/minimal-user",
    "setup/alpine/minimal-user",
];

const packageLists = [
    "setup/ubuntu-devbox/packages",
    "setup/ubuntu-server/packages",
    "setup/alpine/minimal",
];

test("the migration matrix is non-empty", () => {
    assert.ok(stowScripts.length > 0, "stow enumeration is now asserting nothing");
    assert.ok(installers.length > 0, "installer enumeration is now asserting nothing");
    assert.ok(packageLists.length > 0, "package enumeration is now asserting nothing");
});

test("migrated stow paths do not install tmux and link Herdr config", () => {
    for (const relativePath of stowScripts) {
        const script = source(relativePath);

        assert.doesNotMatch(script, /^\s*stow\s+tmux\b/m,
            `${relativePath} still stows the retired multiplexer`);
        assert.match(script, /mkdir -p ~\/\.config\/herdr/,
            `${relativePath} does not create Herdr's runtime config directory`);
        assert.match(script, /ln -snf [^\n]*herdr\/\.config\/herdr\/config\.toml[^\n]*~\/\.config\/herdr\/config\.toml/,
            `${relativePath} does not link the managed Herdr config`);
    }
});

test("target package lists do not install tmux", () => {
    for (const relativePath of packageLists) {
        assert.doesNotMatch(source(relativePath), /(^|\s)tmux(\s|\\|$)/m,
            `${relativePath} still installs tmux`);
    }
});

test("every target Herdr config call site reaches the shared installer", () => {
    for (const relativePath of installers) {
        const script = source(relativePath);

        assert.match(script, /setup\/common\/setup-herdr/,
            `${relativePath} links or provisions a profile without installing Herdr`);
    }
});

test("Arch installs Herdr with pacman and retires user-level copies", () => {
    const packages = source("setup/common/packages/pacman-base");

    assert.match(packages, /^\s*herdr \\/m,
        "the shared Arch package list does not install Herdr");
    assert.match(packages, /rm -f "\$HOME\/\.local\/bin\/herdr"/,
        "a user-level Herdr binary can still shadow pacman's package");
    assert.match(packages, /mise uninstall -a herdr/,
        "the old mise-managed Herdr release is not retired");
});

test("the shared installer uses pacman on Arch and mise elsewhere", () => {
    const setup = source("setup/common/setup-herdr");

    assert.match(setup, /command -v pacman/);
    assert.match(setup, /pacman -Q herdr/);
    assert.match(setup, /mise use -g github:herdrdev\/herdr/);
    assert.match(setup, /skills add [^\n]* -y\s*$/m,
        "the global skill install would otherwise prompt during init");
    assert.doesNotMatch(setup, /lean/i,
        "no lean integration mode is justified without host evidence");
});

test("mise installation belongs to Arch devbox, not Arch workstation", () => {
    const workstation = source("setup/arch-workstation/init");
    const devbox = source("setup/arch-devbox/init");

    assert.doesNotMatch(workstation, /setup-mise|mise packages/);
    assert.match(devbox, /\$ARCH_DEVBOX_DIR\/setup-mise/);
    assert.ok(fs.existsSync(path.join(repoRoot, "setup/arch-devbox/setup-mise")));
    assert.ok(!fs.existsSync(path.join(repoRoot,
        "setup/arch-workstation/setup-packages/setup-mise")));
    assert.ok(!fs.existsSync(path.join(repoRoot,
        "setup/arch-workstation/packages/mise-packages")));
});

test("generated completions replace shell-startup generators", () => {
    const generator = source("bin/df-gen-completions");
    const zshrc = source("zsh/.config/zsh/.zshrc");
    const setupMise = source("setup/arch-devbox/setup-mise");

    assert.match(generator, /^gen mise mise completion zsh$/m);
    assert.match(generator, /^gen kilo kilo completion$/m);
    assert.match(generator, /^gen kubectl kubectl completion zsh$/m);
    assert.match(generator, /^gen herdr herdr completion zsh$/m);
    assert.doesNotMatch(zshrc, /kubectl completion zsh|herdr completion zsh/);
    assert.doesNotMatch(setupMise, /mise completion zsh|site-functions/);
});

test("the ADR records completed feasibility and per-host runtime checks", () => {
    const adr = source("docs/adr/0029-headless-profiles-use-herdr.md");

    assert.match(adr, /Alpine[\s\S]*feasibility check passed/i);
    assert.match(adr, /verified[\s\S]*Ubuntu devbox, Ubuntu server,[\s\S]*and Alpine/i);
});
