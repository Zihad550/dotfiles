const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function sandbox(t, profile = "arch-workstation") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "home-backup-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "home");
    const media = path.join(root, "media with spaces");
    const bin = path.join(root, "bin");
    for (const folder of [home, media, bin]) fs.mkdirSync(folder);
    for (const folder of ["Documents", "Videos", "Pictures", ".ssh", ".gnupg", ".password-store", "dev"]) {
        fs.mkdirSync(path.join(home, folder), { mode: 0o700 });
    }
    fs.writeFileSync(path.join(home, "bk.json"), '{"fixture":true}');
    const log = path.join(root, "gum.log");
    fs.writeFileSync(path.join(bin, "gum"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$BACKUP_TEST_LOG"
action=$1
shift
case "$action" in
    style) exit 0 ;;
    confirm) exit "\${BACKUP_TEST_CONFIRM:-0}" ;;
    spin)
        while [[ $1 != -- ]]; do shift; done
        shift
        exec "$@" ;;
    choose)
        header=
        choices=()
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --header) header=$2; shift 2 ;;
                --*) shift ;;
                *) choices+=("$1"); shift ;;
            esac
        done
        if [[ $header == "Select backup drive" ]]; then
            mounts=$(cat)
            [[ $mounts == "$BACKUP_TEST_MOUNTS" ]] || exit 1
            printf '%s\\n' "$BACKUP_TEST_MEDIA"
        else
            printf '%s\\n' "\${choices[@]}" >"$BACKUP_TEST_OPTIONS"
            [[ \${BACKUP_TEST_CANCEL:-0} == 0 ]] || exit 130
            while IFS= read -r entry; do
                printf '%s\\n' "\${choices[@]}" | grep -Fx -- "$entry" >/dev/null || exit 1
            done <<<"$BACKUP_TEST_SELECT"
            printf '%s\\n' "$BACKUP_TEST_SELECT"
        fi ;;
esac
`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "findmnt"),
        "#!/bin/sh\nprintf '%s\\n' / /home /run/media-other/drive /run/media /run/media/external-drive /run/media/test-user/usb '/mnt/drive\\x20with\\x20spaces'\n",
        { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "gpgconf"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >>"$BACKUP_TEST_GPG_LOG"\n', { mode: 0o755 });
    const env = {
        ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, DOTFILES_PROFILE: profile,
        BACKUP_TEST_MEDIA: media, BACKUP_TEST_SELECT: "Documents",
        BACKUP_TEST_MOUNTS: "/run/media\n/run/media/external-drive\n/run/media/test-user/usb\n/mnt/drive with spaces",
        BACKUP_TEST_LOG: log, BACKUP_TEST_OPTIONS: path.join(root, "options"),
        BACKUP_TEST_GPG_LOG: path.join(root, "gpg.log"),
    };
    function run(command, entries = ["Documents"], directory) {
        env.BACKUP_TEST_SELECT = entries.join("\n");
        const args = [path.join(ROOT, "bin", command)];
        if (directory !== undefined) args.push(directory);
        const shellCommand = args.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
        return spawnSync("script", ["-qec", shellCommand, "/dev/null"], { env, encoding: "utf8" });
    }
    function archive(entry) {
        return `${profile}-${entry.replace(/^\./, "").replaceAll("/", "-").toLowerCase()}-backup.tar.zst`;
    }
    return { root, home, media, bin, env, log, run, archive };
}

function succeeds(result) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

for (const profile of ["arch-workstation", "arch-devbox"]) {
    test(`${profile}: selected items replace fixed archives and restore with permissions and links`, (t) => {
        const { home, media, env, log, run, archive } = sandbox(t, profile);
        const entries = ["Documents", "Videos", "Pictures", ".ssh", ".gnupg", ".password-store", "bk.json"];
        fs.writeFileSync(path.join(home, "Documents", "deleted.txt"), "old");
        fs.writeFileSync(path.join(home, ".ssh", "id_ed25519"), "private", { mode: 0o600 });
        fs.writeFileSync(path.join(home, ".ssh", "known_hosts.old"), "exclude");
        fs.writeFileSync(path.join(home, "Pictures", ".hidden photo"), "picture", { mode: 0o600 });
        fs.symlinkSync(".hidden photo", path.join(home, "Pictures", "link"));
        fs.writeFileSync(path.join(home, ".gnupg", "secret"), "gpg", { mode: 0o600 });
        for (const name of ["S.gpg-agent", "pubring.kbx.lock", ".#lk0x1.host.42"]) {
            fs.writeFileSync(path.join(home, ".gnupg", name), "exclude");
        }
        fs.mkdirSync(path.join(home, ".gnupg", "crls.d"));
        fs.writeFileSync(path.join(home, ".password-store", "entry.gpg"), "encrypted", { mode: 0o600 });
        succeeds(run("df-backup", entries));
        fs.unlinkSync(path.join(home, "Documents", "deleted.txt"));
        fs.writeFileSync(path.join(home, "Documents", "new.txt"), "new");
        succeeds(run("df-backup", entries));
        assert.deepEqual(fs.readdirSync(media).sort(), entries.map(archive).sort());
        fs.writeFileSync(path.join(home, ".ssh", "id_ed25519"), "changed");
        succeeds(run("df-restore", entries));
        assert.deepEqual(fs.readdirSync(path.join(home, "Documents")), ["new.txt"]);
        assert.equal(fs.readFileSync(path.join(home, ".ssh", "id_ed25519"), "utf8"), "private");
        assert.equal(fs.statSync(path.join(home, ".ssh", "id_ed25519")).mode & 0o777, 0o600);
        assert.equal(fs.statSync(path.join(home, ".ssh")).mode & 0o777, 0o700);
        assert.equal(fs.readlinkSync(path.join(home, "Pictures", "link")), ".hidden photo");
        assert.deepEqual(fs.readdirSync(path.join(home, "Videos")), []);
        assert.deepEqual(fs.readdirSync(path.join(home, ".gnupg")), ["secret"]);
        assert.equal(fs.readFileSync(path.join(home, ".password-store", "entry.gpg"), "utf8"), "encrypted");
        assert.equal(fs.readFileSync(path.join(home, "bk.json"), "utf8"), '{"fixture":true}');
        const previous = fs.readdirSync(home).find((name) => name.startsWith(".ssh.pre-restore."));
        assert.equal(fs.readFileSync(path.join(home, previous, ".ssh", "id_ed25519"), "utf8"), "changed");
        assert.match(fs.readFileSync(env.BACKUP_TEST_GPG_LOG, "utf8"), /--kill all/);
        assert.match(fs.readFileSync(log, "utf8"), /style --border rounded/);
        assert.match(fs.readFileSync(log, "utf8"), /spin --show-error/);
        assert.doesNotMatch(fs.readFileSync(log, "utf8"), /--select-if-one|^confirm/m);
    });
}

test("backup picker lists existing items and excludes development caches", (t) => {
    const { home, media, env, run, archive, root } = sandbox(t);
    fs.mkdirSync(path.join(home, "dev", "node_modules"));
    fs.writeFileSync(path.join(home, "dev", "node_modules", "ignored"), "cache");
    fs.writeFileSync(path.join(home, "dev", "source.txt"), "source");
    succeeds(run("df-backup", ["dev"], media));
    const choices = fs.readFileSync(env.BACKUP_TEST_OPTIONS, "utf8").trim().split("\n");
    assert.ok(choices.includes(".password-store"));
    assert.ok(!choices.includes("Music"));
    const extracted = path.join(root, "extracted");
    fs.mkdirSync(extracted);
    succeeds(spawnSync("tar", ["--zstd", "-xf", path.join(media, archive("dev")), "-C", extracted], { encoding: "utf8" }));
    assert.deepEqual(fs.readdirSync(path.join(extracted, "dev")), ["source.txt"]);
});

test("development cache excludes do not apply to personal folders", (t) => {
    const { home, media, run, archive, root } = sandbox(t);
    fs.mkdirSync(path.join(home, "Documents", "logs"));
    fs.writeFileSync(path.join(home, "Documents", "logs", "journal.txt"), "keep");
    fs.writeFileSync(path.join(home, "Documents", "server.log"), "keep");
    succeeds(run("df-backup", ["Documents"], media));
    const extracted = path.join(root, "extracted");
    fs.mkdirSync(extracted);
    succeeds(spawnSync("tar", ["--zstd", "-xf", path.join(media, archive("Documents")), "-C", extracted], { encoding: "utf8" }));
    assert.deepEqual(fs.readdirSync(path.join(extracted, "Documents")).sort(), ["logs", "server.log"]);
});

test("dangling symlink items back up and restore as links", (t) => {
    const { home, run } = sandbox(t);
    fs.symlinkSync("/nonexistent/vault", path.join(home, ".obsidian-vault"));
    succeeds(run("df-backup", [".obsidian-vault"]));
    fs.unlinkSync(path.join(home, ".obsidian-vault"));
    succeeds(run("df-restore", [".obsidian-vault"]));
    assert.equal(fs.readlinkSync(path.join(home, ".obsidian-vault")), "/nonexistent/vault");
});

test("low free space asks before writing and keeps the previous archive when declined", (t) => {
    const { home, media, bin, env, log, run, archive } = sandbox(t);
    fs.writeFileSync(path.join(home, "Documents", "report.txt"), "new");
    succeeds(run("df-backup"));
    const oldArchive = fs.readFileSync(path.join(media, archive("Documents")));
    fs.writeFileSync(path.join(bin, "df"), "#!/bin/sh\nprintf 'Avail\\n10\\n'\n", { mode: 0o755 });
    env.BACKUP_TEST_CONFIRM = "1";
    const declined = run("df-backup");
    assert.equal(declined.status, 1);
    assert.match(declined.stdout, /not enough space for Documents; previous archive kept/);
    assert.match(fs.readFileSync(log, "utf8"), /^confirm --default=false Documents needs up to/m);
    assert.deepEqual(fs.readFileSync(path.join(media, archive("Documents"))), oldArchive);
    assert.deepEqual(fs.readdirSync(media), [archive("Documents")]);
    env.BACKUP_TEST_CONFIRM = "0";
    succeeds(run("df-backup"));
});

test("Downloads/backups is its own item and restores after Downloads", (t) => {
    const { home, media, run, archive } = sandbox(t);
    const backups = path.join(home, "Downloads", "backups");
    fs.mkdirSync(backups, { recursive: true });
    fs.writeFileSync(path.join(home, "Downloads", "other.txt"), "other");
    fs.writeFileSync(path.join(backups, "db.sql"), "v1");
    succeeds(run("df-backup", ["Downloads"]));
    fs.writeFileSync(path.join(backups, "db.sql"), "v2");
    succeeds(run("df-backup", ["Downloads/backups"]));
    assert.ok(fs.existsSync(path.join(media, "arch-workstation-downloads-backups-backup.tar.zst")));
    assert.deepEqual(fs.readdirSync(media).sort(), [archive("Downloads"), archive("Downloads/backups")].sort());

    fs.rmSync(path.join(home, "Downloads"), { recursive: true });
    succeeds(run("df-restore", ["Downloads/backups"]));
    assert.deepEqual(fs.readdirSync(path.join(home, "Downloads")), ["backups"]);
    assert.equal(fs.readFileSync(path.join(backups, "db.sql"), "utf8"), "v2");

    fs.rmSync(path.join(home, "Downloads"), { recursive: true });
    succeeds(run("df-restore", ["Downloads/backups", "Downloads"]));
    assert.equal(fs.readFileSync(path.join(home, "Downloads", "other.txt"), "utf8"), "other");
    assert.equal(fs.readFileSync(path.join(backups, "db.sql"), "utf8"), "v2");
});

test("restore rejects nested item archives containing sibling paths", (t) => {
    const { home, media, run, archive } = sandbox(t);
    fs.mkdirSync(path.join(home, "Downloads", "backups"), { recursive: true });
    fs.writeFileSync(path.join(home, "Downloads", "other.txt"), "other");
    succeeds(spawnSync("tar", ["--zstd", "-cf", path.join(media, archive("Downloads/backups")), "-C", home,
        "Downloads/backups", "Downloads/other.txt"], { encoding: "utf8" }));
    const result = run("df-restore", ["Downloads/backups"]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /contains a path outside Downloads\/backups/);
    assert.ok(fs.existsSync(path.join(home, "Downloads", "backups")));
});

test("SSH backup skips active control sockets and restores private key permissions", async (t) => {
    const { home, run } = sandbox(t);
    fs.writeFileSync(path.join(home, ".ssh", "id_ed25519"), "private", { mode: 0o600 });
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(path.join(home, ".ssh", "control-host"), resolve);
    });
    t.after(() => server.close());
    succeeds(run("df-backup", [".ssh"]));
    succeeds(run("df-restore", [".ssh"]));
    assert.deepEqual(fs.readdirSync(path.join(home, ".ssh")), ["id_ed25519"]);
    assert.equal(fs.statSync(path.join(home, ".ssh", "id_ed25519")).mode & 0o777, 0o600);
});

for (const tool of ["tar", "zstd"]) {
    test(`${tool} failure preserves the old archive and removes temporary files`, (t) => {
        const { media, bin, run, archive } = sandbox(t);
        succeeds(run("df-backup"));
        const oldArchive = fs.readFileSync(path.join(media, archive("Documents")));
        fs.writeFileSync(path.join(bin, tool), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
        const result = run("df-backup");
        assert.equal(result.status, 1);
        assert.match(result.stdout, /previous archive kept/);
        assert.deepEqual(fs.readFileSync(path.join(media, archive("Documents"))), oldArchive);
        assert.deepEqual(fs.readdirSync(media), [archive("Documents")]);
    });
}

test("restore picker excludes other profiles and timestamped archives", (t) => {
    const { media, env, run, archive } = sandbox(t);
    succeeds(run("df-backup"));
    fs.writeFileSync(path.join(media, "arch-devbox-ssh-backup.tar.zst"), "other profile");
    fs.writeFileSync(path.join(media, "arch-workstation-gnupg-backup-20261002-120000.tar.zst"), "old");
    succeeds(run("df-restore"));
    assert.equal(fs.readFileSync(env.BACKUP_TEST_OPTIONS, "utf8"), "Documents\n");
    assert.ok(fs.existsSync(path.join(media, archive("Documents"))));
});

test("corrupt selected archives leave all home items untouched", (t) => {
    const { home, media, run, archive } = sandbox(t);
    fs.writeFileSync(path.join(home, "Documents", "current"), "keep");
    succeeds(run("df-backup", ["Documents", ".ssh"]));
    fs.writeFileSync(path.join(media, archive(".ssh")), "corrupt");
    const result = run("df-restore", ["Documents", ".ssh"]);
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(path.join(home, "Documents", "current"), "utf8"), "keep");
    assert.ok(!fs.readdirSync(home).some((name) => name.includes("pre-restore") || name.startsWith(".df-restore.")));
});

test("restore rejects archives containing other home items", (t) => {
    const { home, media, run, archive } = sandbox(t);
    succeeds(spawnSync("tar", ["--zstd", "-cf", path.join(media, archive("Documents")), "-C", home, ".ssh"], { encoding: "utf8" }));
    const result = run("df-restore");
    assert.equal(result.status, 1);
    assert.match(result.stdout, /contains a path outside Documents/);
    assert.ok(fs.existsSync(path.join(home, "Documents")));
});

test("backup rejects destinations inside selected sources before writing", (t) => {
    const { home, media, run } = sandbox(t);
    const result = run("df-backup", ["Documents"], path.join(home, "Documents"));
    assert.equal(result.status, 1);
    assert.match(result.stdout, /destination must be outside/);
    assert.deepEqual(fs.readdirSync(media), []);
    assert.deepEqual(fs.readdirSync(path.join(home, "Documents")), []);
});

test("unsupported profiles and cancelled selection write nothing", (t) => {
    const { media, env, run } = sandbox(t);
    env.DOTFILES_PROFILE = "";
    const invalid = run("df-backup");
    assert.equal(invalid.status, 1);
    assert.match(invalid.stdout, /DOTFILES_PROFILE must be/);
    env.DOTFILES_PROFILE = "arch-workstation";
    env.BACKUP_TEST_CANCEL = "1";
    assert.equal(run("df-backup").status, 130);
    assert.deepEqual(fs.readdirSync(media), []);
});
