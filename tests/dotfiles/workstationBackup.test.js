const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "../../bin/df-worstation-backup");

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "workstation-sync-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const media = path.join(root, "media with spaces");
    fs.mkdirSync(media);
    for (const folder of ["Documents", "Videos", "Pictures"]) {
        fs.mkdirSync(path.join(home, folder), { recursive: true });
    }
    const env = { ...process.env, HOME: home };
    const run = (destination = media) => spawnSync(SCRIPT, [destination], { env, encoding: "utf8" });
    return { root, home, media, env, run };
}

test("creates separate ZIPs including hidden files and empty directories, and replaces stale contents", (t) => {
    const { root, home, media, run } = sandbox(t);
    fs.writeFileSync(path.join(home, "Documents", "old.txt"), "old");
    fs.writeFileSync(path.join(home, "Pictures", ".hidden photo"), "picture");
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    fs.unlinkSync(path.join(home, "Documents", "old.txt"));
    fs.writeFileSync(path.join(home, "Documents", "new.txt"), "new");
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(media).sort(), [
        "documents-workstation.zip", "pictures-workstation.zip", "videos-workstation.zip",
    ]);
    const extracted = path.join(root, "extracted");
    for (const name of fs.readdirSync(media)) {
        const unpacked = spawnSync("7z", ["x", `-o${extracted}`, path.join(media, name)], { encoding: "utf8" });
        assert.equal(unpacked.status, 0, unpacked.stderr);
    }
    assert.deepEqual(fs.readdirSync(path.join(extracted, "Documents")), ["new.txt"]);
    assert.equal(fs.readFileSync(path.join(extracted, "Documents", "new.txt"), "utf8"), "new");
    assert.equal(fs.readFileSync(path.join(extracted, "Pictures", ".hidden photo"), "utf8"), "picture");
    assert.deepEqual(fs.readdirSync(path.join(extracted, "Videos")), []);
});

test("archive failure keeps the old backup and removes temporary files", (t) => {
    const { root, media, env, run } = sandbox(t);
    const oldArchive = path.join(media, "documents-workstation.zip");
    fs.writeFileSync(oldArchive, "previous backup");
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "7z"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    env.PATH = `${bin}:${env.PATH}`;
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /previous documents-workstation.zip kept/);
    assert.equal(fs.readFileSync(oldArchive, "utf8"), "previous backup");
    assert.deepEqual(fs.readdirSync(media), ["documents-workstation.zip"]);
});

test("rejects a destination inside a source and missing source directories before writing", (t) => {
    const { home, media, run } = sandbox(t);
    let result = run(path.join(home, "Documents"));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /destination must be outside/);
    fs.rmdirSync(path.join(home, "Videos"));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Videos does not exist/);
    assert.deepEqual(fs.readdirSync(media), []);
});

test("interactive picker filters mount targets and decodes spaces", (t) => {
    const { root, media, env } = sandbox(t);
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "findmnt"),
        "#!/bin/sh\nprintf '%s\\n' / /home /run/media /run/media-other/drive /run/media/external-drive /run/media/test-user/usb '/mnt/drive\\x20with\\x20spaces'\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "gum"),
        '#!/bin/sh\nmounts=$(cat)\n[ "$mounts" = "/run/media/external-drive\n/run/media/test-user/usb\n/mnt/drive with spaces" ] || exit 1\nprintf "%s\\n" "$BACKUP_TEST_MEDIA"\n',
        { mode: 0o755 });
    env.PATH = `${bin}:${env.PATH}`;
    env.BACKUP_TEST_MEDIA = media;
    const result = spawnSync("script", ["-qec", SCRIPT, "/dev/null"], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readdirSync(media).length, 3);
});
