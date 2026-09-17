const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const installer = path.join(repoRoot, "bin/df-webapp-install");

function install(root, profile, name, url) {
    const icon = path.join(root, "icon.png");
    fs.writeFileSync(icon, "icon");

    return childProcess.spawnSync(installer, [name, url, icon], {
        encoding: "utf8",
        env: {
            ...process.env,
            DOTFILES_DIR: path.join(root, "dotfiles"),
            DOTFILES_PROFILE: profile,
            HOME: path.join(root, "home"),
        },
    });
}

test("web app installs are recorded in the active machine profile", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-packages-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    let result = install(root, "arch-devbox", "Dev App", "dev.example/one");
    assert.strictEqual(result.status, 0, result.stderr);
    result = install(root, "arch-devbox", "Dev App", "dev.example/two");
    assert.strictEqual(result.status, 0, result.stderr);
    result = install(root, "arch-workstation", "Work App", "work.example");
    assert.strictEqual(result.status, 0, result.stderr);

    const devbox = fs.readFileSync(path.join(
        root, "dotfiles/setup/arch-devbox/packages/webapp-packages"), "utf8");
    const workstation = fs.readFileSync(path.join(
        root, "dotfiles/setup/arch-workstation/packages/webapp-packages"), "utf8");

    assert.match(devbox,
        /df-webapp-install "Dev App" "https:\/\/dev\.example\/two"/);
    assert.doesNotMatch(devbox, /dev\.example\/one/);
    assert.strictEqual((devbox.match(/df-webapp-install/g) || []).length, 1);
    assert.match(workstation,
        /df-webapp-install "Work App" "https:\/\/work\.example"/);
    assert.doesNotMatch(workstation, /Dev App/);
    assert.match(devbox, /^export DF_WEBAPP_PACKAGE_REPLAY=1$/m);
});

test("an unknown machine profile does not create a package list", t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-packages-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const result = install(root, "arch-other", "Other App", "other.example");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /DOTFILES_PROFILE is not set to a supported Arch profile/);
    assert.ok(!fs.existsSync(path.join(root, "dotfiles/setup/arch-other")));
});
