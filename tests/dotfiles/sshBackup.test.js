const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-ssh-backup");

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssh-backup-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const media = path.join(root, "media");
    for (const dir of [home, media]) fs.mkdirSync(dir);
    const env = { ...process.env, HOME: home, DOTFILES_PROFILE: "arch-workstation" };
    const run = (args) => childProcess.spawnSync(SCRIPT, args, { env, encoding: "utf8" });
    return { home, media, run };
}

test("create archives ~/.ssh without sockets and restore puts it back with strict permissions", async (t) => {
    const { home, media, run } = sandbox(t);
    const ssh = path.join(home, ".ssh");
    fs.mkdirSync(ssh, { mode: 0o700 });
    fs.writeFileSync(path.join(ssh, "id_ed25519"), "private", { mode: 0o600 });
    fs.writeFileSync(path.join(ssh, "id_ed25519.pub"), "public", { mode: 0o644 });
    fs.writeFileSync(path.join(ssh, "known_hosts.old"), "stale");
    const server = net.createServer();
    await new Promise((resolve) => server.listen(path.join(ssh, "control-host"), resolve));
    t.after(() => server.close());

    const created = run(["create", media]);
    assert.strictEqual(created.status, 0, created.stderr);
    const [archive] = fs.readdirSync(media);
    assert.match(archive, /^arch-workstation-ssh-backup-\d{8}-\d{6}\.tar\.zst$/);

    const restored = run(["restore", path.join(media, archive)]);
    assert.strictEqual(restored.status, 0, restored.stderr);
    assert.deepStrictEqual(fs.readdirSync(ssh).sort(), ["id_ed25519", "id_ed25519.pub"]);
    assert.strictEqual(fs.statSync(ssh).mode & 0o777, 0o700);
    assert.strictEqual(fs.statSync(path.join(ssh, "id_ed25519")).mode & 0o777, 0o600);
    assert.strictEqual(fs.readFileSync(path.join(ssh, "id_ed25519"), "utf8"), "private");
    assert.strictEqual(fs.readdirSync(home).filter((name) => name.startsWith(".ssh.pre-restore-")).length, 1);
});
