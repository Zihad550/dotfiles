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

test("Arch setup offers the background collection before the restart prompt", () => {
    for (const relativePath of ["setup/arch-workstation/init", "setup/arch-devbox/init"]) {
        const init = source(relativePath);

        assert.doesNotMatch(init, /run_step "stow backgrounds"/);
        assert.match(init,
            /confirm "Clone the optional theme backgrounds now\?"[\s\S]*scripts\/stow\/stow-backgrounds[\s\S]*confirm "Restart now\?"/);
        assert.match(init,
            /if "\$DOTFILES_DIR\/scripts\/stow\/stow-backgrounds"; then[\s\S]*installation failed\. Retry with/);
    }
});

test("background startup succeeds when no image is installed", t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-no-background-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const result = childProcess.spawnSync(path.join(repoRoot, "bin/df-theme-bg-start"), {
        encoding: "utf8",
        env: { ...process.env, HOME: home },
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(result.stderr, "");
});

test("Hyprland starts an optional background through the guarded helper", () => {
    const autostart = source("hypr/.config/hypr/lua/autostart.lua");
    const themeSet = source("bin/df-theme-set");

    assert.match(autostart, /dotfiles\/bin\/df-theme-bg-start/);
    assert.doesNotMatch(autostart, /swaybg -i/);
    assert.match(themeSet, /rm -f ~\/\.config\/theme\/background[\s\S]*using its background color/);
    assert.match(themeSet, /df-theme-bg-start/);
});
