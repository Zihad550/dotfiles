const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-gnupg-backup");

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gnupg-backup-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const media = path.join(root, "media");
    const bin = path.join(root, "bin");
    for (const dir of [home, media, bin]) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(bin, "gpgconf"), "#!/usr/bin/env bash\n");
    fs.chmodSync(path.join(bin, "gpgconf"), 0o755);
    const env = { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin`, DOTFILES_PROFILE: "arch-devbox" };
    const run = (args, extraEnv = {}) =>
        childProcess.spawnSync(SCRIPT, args, { env: { ...env, ...extraEnv }, encoding: "utf8" });
    return { home, media, run };
}

function writeKeyring(home) {
    const gnupg = path.join(home, ".gnupg");
    fs.mkdirSync(path.join(gnupg, "private-keys-v1.d"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(gnupg, "private-keys-v1.d/key.key"), "secret");
    fs.writeFileSync(path.join(gnupg, "S.gpg-agent"), "socket");
    fs.writeFileSync(path.join(gnupg, "pubring.kbx.lock"), "lock");
    fs.mkdirSync(path.join(gnupg, "public-keys.d"));
    fs.writeFileSync(path.join(gnupg, "public-keys.d/pubring.db"), "public");
    fs.writeFileSync(path.join(gnupg, "public-keys.d/.#lk0x1.host.42"), "stale");
    fs.mkdirSync(path.join(gnupg, "crls.d"));
}

test("create writes an archive that restore puts back, keeping the old keyring aside", (t) => {
    const { home, media, run } = sandbox(t);
    writeKeyring(home);

    const created = run(["create", media]);
    assert.strictEqual(created.status, 0, created.stderr);
    const [archive] = fs.readdirSync(media);
    assert.match(archive, /^arch-devbox-gnupg-backup-\d{8}-\d{6}\.tar\.zst$/);

    fs.writeFileSync(path.join(home, ".gnupg/private-keys-v1.d/key.key"), "changed");
    const restored = run(["restore", path.join(media, archive)]);
    assert.strictEqual(restored.status, 0, restored.stderr);

    const gnupg = path.join(home, ".gnupg");
    assert.strictEqual(fs.readFileSync(path.join(gnupg, "private-keys-v1.d/key.key"), "utf8"), "secret");
    assert.strictEqual(fs.statSync(gnupg).mode & 0o777, 0o700);
    assert.ok(!fs.existsSync(path.join(gnupg, "S.gpg-agent")));
    assert.ok(!fs.existsSync(path.join(gnupg, "pubring.kbx.lock")));
    assert.deepStrictEqual(fs.readdirSync(path.join(gnupg, "public-keys.d")), ["pubring.db"]);
    assert.ok(!fs.existsSync(path.join(gnupg, "crls.d")));
    const aside = fs.readdirSync(home).filter((name) => name.startsWith(".gnupg.pre-restore-"));
    assert.strictEqual(aside.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(home, aside[0], "private-keys-v1.d/key.key"), "utf8"), "changed");
    assert.deepStrictEqual(fs.readdirSync(home).filter((name) => name.startsWith(".gnupg-backup.")), []);
});

test("restore leaves the keyring untouched when the archive is unreadable", (t) => {
    const { home, media, run } = sandbox(t);
    writeKeyring(home);
    const archive = path.join(media, "gnupg-backup.tar.zst");
    fs.writeFileSync(archive, "not an archive");

    const result = run(["restore", archive]);
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(fs.readFileSync(path.join(home, ".gnupg/private-keys-v1.d/key.key"), "utf8"), "secret");
    assert.deepStrictEqual(fs.readdirSync(home), [".gnupg"]);
});

test("create refuses to run without a supported machine profile", (t) => {
    const { home, media, run } = sandbox(t);
    writeKeyring(home);
    const result = run(["create", media], { DOTFILES_PROFILE: "" });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /DOTFILES_PROFILE must be arch-devbox or arch-workstation/);
    assert.deepStrictEqual(fs.readdirSync(media), []);
});
