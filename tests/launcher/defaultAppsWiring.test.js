// Structural wiring for the Default App Roles feature.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("the launcher exposes Default Apps through the provider list, not the default pool", () => {
    const launcher = source("quickshell/.config/quickshell/launcher/modules/Launcher.qml");
    const pool = launcher.match(/readonly property var pool: \[[^\n]+\]/)[0];
    const routable = launcher.match(/readonly property var rankedRoutable:[^\n]+/)[0];

    assert.doesNotMatch(pool, /\bdefaultApps\b/);
    assert.match(routable, /\bdefaultApps\b/);
    assert.match(launcher, /DefaultApps\s*\{\s*id: defaultApps/);
});

test("the keybindings call Role Launchers and keep the named Helium preset", () => {
    const apps = source("hypr/.config/hypr/lua/bindings/apps.lua");

    assert.match(apps, /local role_launcher\s*=.*df-launch-role/);
    assert.match(apps, /SUPER \+ B", "System Browser", role_launcher \..*browser/);
    assert.match(apps, /SUPER \+ F", "Preferred File Manager", role_launcher \..*file-manager/);
    assert.match(apps, /SUPER \+ SHIFT \+ B", "Helium default"/);
    assert.doesNotMatch(apps, /SUPER \+ B", "Zen Browser dev"/);
});

test("both setup profiles stow the registry and assert declared roles", () => {
    const workstationStow = source("setup/arch-workstation/stow");
    const baseStow = source("scripts/stow/stow-base");
    const workstation = source("setup/arch-workstation/post-install");
    const devbox = source("setup/arch-devbox/post-install");

    assert.match(workstationStow, /^stow dotfiles$/m);
    assert.match(baseStow, /^stow dotfiles$/m);
    for (const script of [workstation, devbox]) {
        assert.match(script, /df-default-app.*set browser/);
        assert.match(script, /df-default-app.*set directory-handler nautilus/);
        assert.match(script, /df-default-app.*set file-manager yazi/);
    }
    assert.match(workstation, /set browser zen/);
    assert.match(devbox, /set browser chromium/);
});

test("the workstation installs Yazi for its declared Preferred File Manager", () => {
    assert.match(source("setup/arch-workstation/packages/pacman-apps"), /^\s*yazi resvg \\/m);
});
