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

test("both Arch profiles install Herdr with pacman", () => {
    const devbox = source("setup/common/packages/pacman-base");
    const workstation = source("setup/arch-workstation/packages/pacman-base");

    assert.match(devbox, /^\s*herdr \\/m);
    assert.match(workstation, /^\s*herdr$/m);
    assert.doesNotMatch(workstation, /mise (unuse|uninstall)|rm -[fr]+[^\n]*herdr/);
});

test("Arch workstation is a remote-development client", () => {
    const init = source("setup/arch-workstation/init");
    const packages = source("setup/arch-workstation/packages/pacman-base");
    const apps = source("setup/arch-workstation/packages/pacman-apps");
    const yayPackages = source("setup/arch-workstation/packages/yay-packages");
    const flatpaks = source("setup/common/packages/flatpak-packages");
    const stow = source("setup/arch-workstation/stow");
    const syncthing = source("setup/arch-workstation/setup-packages/setup-syncthing");
    const ufw = source("setup/arch-workstation/setup-packages/setup-ufw");
    const workstationGitHub = source("setup/arch-workstation/setup-packages/setup-github-cli");
    const devboxGitHub = source("setup/arch-devbox/setup-github-cli");

    assert.doesNotMatch(init,
        /setup-rootless-docker|go-packages|setup-file-watchers|setup-ts-serve|df-gen-completions/);
    assert.doesNotMatch(packages,
        /^\s*(gcc|base-devel|docker|docker-compose|go|nodejs|npm|pnpm|python|rust)(?:\s|\\|$)/m);
    assert.match(packages, /^\s*openssh \\/m);
    assert.match(packages, /^\s*tailscale \\/m);
    assert.match(packages, /^\s*herdr$/m);
    assert.match(packages, /^\s*github-cli \\/m);
    assert.match(packages, /systemctl enable --now tailscaled\.service/);
    assert.match(apps, /^\s*zed \\/m);
    assert.match(apps, /^\s*neovim \\/m);
    assert.match(yayPackages, /helium-browser-bin/);
    assert.doesNotMatch(yayPackages, /dragon-drop/);
    assert.match(apps, /^\s*yazi resvg \\/m);
    assert.doesNotMatch(`${init}\n${packages}\n${apps}\n${yayPackages}\n${flatpaks}`,
        /(^|\s)chromium(?:\s|\\|$)/m);
    assert.match(flatpaks, /com\.mongodb\.Compass/);
    assert.match(flatpaks, /io\.beekeeperstudio\.Studio/);
    assert.match(stow, /^stow zed$/m);
    assert.match(stow, /^stow kanata$/m);
    assert.match(stow, /^stow dotfiles$/m);
    assert.match(init, /setup-packages\/setup-kanata/);
    assert.match(init, /setup-packages\/setup-syncthing/);
    assert.match(syncthing, /systemctl --user enable --now syncthing\.service/);
    assert.doesNotMatch(syncthing, /~\/dev|\.stignore_dev/);
    assert.match(ufw, /sudo ufw deny SSH/);
    assert.doesNotMatch(ufw, /ufw allow (SSH|syncthing)/);
    assert.doesNotMatch(init, /systemctl[^\n]*sshd|run_step[^\n]*sshd/);
    assert.match(workstationGitHub, /gh config set git_protocol ssh/);
    assert.match(workstationGitHub, /gh extension install dlvhdr\/gh-dash/);
    assert.doesNotMatch(devboxGitHub, /gh config set git_protocol/);
    assert.match(devboxGitHub, /gh extension install dlvhdr\/gh-dash/);
    assert.doesNotMatch(stow, /stow (git|lazygit|worktrunk)|stow-ai/);
});

test("Arch devbox excludes workstation sync and browser", () => {
    const init = source("setup/arch-devbox/init");
    const packages = [
        source("setup/common/packages/pacman-base"),
        source("setup/arch-devbox/packages/pacman-apps"),
        source("setup/arch-devbox/packages/yay-packages"),
    ].join("\n");

    assert.doesNotMatch(init, /run_step[^\n]*syncthing/i);
    assert.doesNotMatch(packages, /^\s*syncthing(?:\s|\\|$)/m);
    assert.doesNotMatch(init, /setup\/common\/packages\/yay-packages/);
    assert.doesNotMatch(packages, /helium-browser-bin/);
    assert.match(packages, /^\s*yazi resvg \\/m);
    assert.match(packages, /dragon-drop/);
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
