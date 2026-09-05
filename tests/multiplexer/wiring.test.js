// The tmux retirement, asserted against the live wiring rather than every
// occurrence of the word. Herdr's config and ADRs intentionally preserve the
// migration history that explains the port, so a repository-wide grep would
// make the test delete useful documentation.
//
//     node --test tests/multiplexer/wiring.test.js

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const stowScripts = [
    "scripts/stow/stow-base",
    "setup/devcontainer/stow",
    "setup/ubuntu-devbox/stow",
    "setup/ubuntu-server/stow",
    "setup/ubuntu-server/minimal-user",
    "setup/alpine/minimal-user",
    "setup/proxmox/stow",
];

const packageLists = [
    "setup/common/packages/pacman-base",
    "setup/arch-workstation/packages/pacman-base",
    "setup/arch-devbox/packages/pacman-apps",
    "setup/arch-workstation/packages/pacman-apps",
    "setup/ubuntu-devbox/packages",
    "setup/ubuntu-server/packages",
    "setup/alpine/minimal",
];

const aliases = ["zsh/.config/zsh/aliasrc"];
const configs = [
    "gh-dash/.config/gh-dash/config.yml",
    "worktrunk/.config/worktrunk/config.toml",
];
const commentedBindingFiles = ["hypr/.config/hypr/lua/bindings/apps.lua"];

test("the retirement scan enumerates every live seam", () => {
    for (const [name, files] of Object.entries({ stowScripts, packageLists, aliases, configs, commentedBindingFiles }))
        assert.ok(files.length > 0, `${name} is now asserting nothing`);
});

test("no live stow or package wiring names tmux", () => {
    for (const relativePath of stowScripts)
        assert.doesNotMatch(source(relativePath), /^\s*stow\s+tmux\b/m,
            `${relativePath} still stows the retired multiplexer`);

    for (const relativePath of packageLists)
        assert.doesNotMatch(source(relativePath), /(^|\s)tmux(\s|\\|$)/m,
            `${relativePath} still installs the retired multiplexer`);
});

test("no live alias, config, or binding invokes tmux", () => {
    for (const relativePath of [...aliases, ...configs, ...commentedBindingFiles])
        assert.doesNotMatch(source(relativePath), /\btmux\b/i,
            `${relativePath} still exposes a live or commented tmux seam`);
});

test("gh-dash's review binding creates a focused named Herdr tab", () => {
    const config = source("gh-dash/.config/gh-dash/config.yml");
    const universalStart = config.indexOf("    universal:");
    const prsStart = config.indexOf("    prs:", universalStart);
    const issuesStart = config.indexOf("    issues:", prsStart);

    assert.ok(universalStart >= 0 && prsStart > universalStart && issuesStart > prsStart,
        "universal, PR, and issue bindings must remain distinct template scopes");

    const universalBindings = config.slice(universalStart, prsStart);
    const prBindings = config.slice(prsStart, issuesStart);
    assert.doesNotMatch(universalBindings, /- key: C\b/,
        "a universal command receives RepoPath only, never PrNumber");

    const reviewBinding = prBindings.match(/- key: C[\s\S]*$/);

    assert.ok(reviewBinding, "the review binding disappeared from PR bindings");
    assert.match(reviewBinding[0], /herdr tab create/);
    assert.match(reviewBinding[0], /--workspace \"\$HERDR_WORKSPACE_ID\"/);
    assert.match(reviewBinding[0], /--cwd \"\{\{\.RepoPath\}\}\"/);
    assert.match(reviewBinding[0], /--label \"PR-\{\{\.PrNumber\}\}\"/);
    assert.match(reviewBinding[0], /--focus/);
    assert.match(reviewBinding[0], /jq -er '\.result\.root_pane\.pane_id'/);
    assert.match(reviewBinding[0], /herdr pane run \"\$review_pane\"/);
    assert.match(reviewBinding[0], /wt switch pr:\{\{\.PrNumber\}\} -x \"opencode --prompt review-pr-for-this-branch\"/);
});

test("the old config is absent from main", () => {
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "tmux")), false,
        "the retired config still exists on main");
});

test("historical migration mentions remain available outside live wiring", () => {
    assert.match(source("herdr/.config/herdr/config.toml"), /tmux: bind/,
        "Herdr's porting comments were removed with the old config");
    assert.match(source("zsh/.config/zsh/herdr-rename.zsh"), /tmux's automatic-rename/,
        "the shell hook no longer explains its origin");
    assert.match(source("docs/adr/0003-tmux-to-herdr.md"), /superseded by issue #121/i,
        "ADR 0003 does not record the final retirement");
});

test("the live gh-dash behavior has a host-only verification guide", () => {
    const guide = source("docs/issue-121-gh-dash-verification.md");

    assert.match(guide, /active Herdr session/i);
    assert.match(guide, /press `C`/);
    assert.match(guide, /review-pr-for-this-branch/);
    assert.match(guide, /not a substitute/i);
});
