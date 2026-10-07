const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function sandbox(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "home-rsync-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const home = path.join(root, "local home");
    const remote = path.join(root, "remote home");
    const bin = path.join(root, "bin");
    for (const dir of [home, remote, bin]) fs.mkdirSync(dir);
    fs.mkdirSync(path.join(home, ".ssh"));
    fs.writeFileSync(path.join(home, ".ssh/config"), "Host devbox other *.invalid !blocked\nInclude hosts/*\nHost=devbox\n");
    fs.mkdirSync(path.join(home, ".ssh/hosts"));
    fs.writeFileSync(path.join(home, ".ssh/hosts/extra"), 'Host "included"\nInclude ../config\n');
    fs.writeFileSync(path.join(bin, "gum"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$SYNC_TEST_GUM_LOG"
action=$1
shift
case "$action" in
    style) ;;
    confirm) exit "\${SYNC_TEST_CONFIRM:-0}" ;;
    input)
        case "$2" in
            'IP address (required)') printf '%s\\n' "$SYNC_TEST_IP" ;;
            'SSH user'*) printf '%s\\n' "\${SYNC_TEST_USER:-}" ;;
            'SSH port'*) printf '%s\\n' "\${SYNC_TEST_PORT:-}" ;;
        esac ;;
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
        case "$header" in
            'Select operation') picked="$SYNC_TEST_OPERATION" ;;
            'Select remote') picked="$SYNC_TEST_REMOTE" ;;
            *) picked="$SYNC_TEST_ITEMS" ;;
        esac
        [[ \${SYNC_TEST_CANCEL:-} != "$header" ]] || exit 130
        while IFS= read -r item; do
            printf '%s\\n' "\${choices[@]}" | /usr/bin/grep -Fx -- "$item" >/dev/null || exit 1
        done <<<"$picked"
        printf '%s\\n' "$picked" ;;
esac
`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "ssh"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$SYNC_TEST_SSH_LOG"
[[ \${SYNC_TEST_SSH_FAIL:-0} == 0 ]] || exit 255
while [[ $1 == -* ]]; do
    case "$1" in
        -p|-l|-o) shift 2 ;;
        *) shift ;;
    esac
done
shift
export HOME="$SYNC_TEST_REMOTE_HOME"
cd "$HOME"
exec /bin/sh -c "$*"
`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "rsync"), `#!/usr/bin/env bash
set -euo pipefail
if [[ $1 != --server ]]; then
    printf '%s\\n' "$*" >>"$SYNC_TEST_RSYNC_LOG"
    [[ \${SYNC_TEST_RSYNC_FAIL:-0} == 0 ]] || exit 23
fi
exec /usr/bin/rsync "$@"
`, { mode: 0o755 });
    const env = {
        ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`,
        SYNC_TEST_REMOTE_HOME: remote, SYNC_TEST_REMOTE: "devbox",
        SYNC_TEST_ITEMS: "Documents", SYNC_TEST_OPERATION: "send",
        SYNC_TEST_GUM_LOG: path.join(root, "gum.log"),
        SYNC_TEST_SSH_LOG: path.join(root, "ssh.log"),
        SYNC_TEST_RSYNC_LOG: path.join(root, "rsync.log"),
    };
    function run(operation = "") {
        return spawnSync("script", ["-qec", `${ROOT}/bin/df-rsync ${operation}`, "/dev/null"], {
            env, encoding: "utf8",
        });
    }
    function write(base, item, text = item) {
        fs.mkdirSync(path.dirname(path.join(base, item)), { recursive: true });
        fs.writeFileSync(path.join(base, item), text);
    }
    function log(name) {
        const file = env[`SYNC_TEST_${name}_LOG`];
        return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    }
    return { home, remote, env, run, write, log };
}

function succeeds(result) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

for (const operation of ["send", "receive"]) {
    test(`${operation} mirrors selected directories, keeps exclusions and unrelated files`, (t) => {
        const { home, remote, env, run, write, log } = sandbox(t);
        const source = operation === "send" ? home : remote;
        const destination = operation === "send" ? remote : home;
        write(source, "dev/project/source.js", "new source");
        write(source, "dev/project/node_modules/package/index.js");
        write(source, "dev/node_modules/root/index.js");
        write(source, "dev/project/.cache/cache");
        write(source, "dev/project/output.log");
        write(destination, "dev/stale.txt");
        write(destination, "dev/project/node_modules/keep.txt");
        write(destination, "dev/project/old.log");
        write(destination, "Videos/unrelated.txt");
        write(source, ".ssh/known_hosts");
        write(source, ".ssh/known_hosts.old");
        write(source, ".gnupg/public-key");
        write(source, ".gnupg/S.gpg-agent");
        write(source, ".gnupg/crls.d/cache");
        write(source, ".gnupg/key.lock");
        env.SYNC_TEST_ITEMS = "dev\n.ssh\n.gnupg";
        succeeds(run(operation));
        assert.equal(fs.readFileSync(path.join(destination, "dev/project/source.js"), "utf8"), "new source");
        assert.ok(!fs.existsSync(path.join(destination, "dev/stale.txt")));
        assert.ok(!fs.existsSync(path.join(destination, "dev/project/node_modules/package")));
        assert.ok(!fs.existsSync(path.join(destination, "dev/node_modules/root")));
        assert.ok(fs.existsSync(path.join(destination, "dev/project/node_modules/keep.txt")));
        assert.ok(fs.existsSync(path.join(destination, "dev/project/old.log")));
        assert.ok(fs.existsSync(path.join(destination, "Videos/unrelated.txt")));
        assert.ok(!fs.existsSync(path.join(destination, ".ssh/known_hosts.old")));
        assert.ok(!fs.existsSync(path.join(destination, ".gnupg/S.gpg-agent")));
        assert.ok(!fs.existsSync(path.join(destination, ".gnupg/crls.d")));
        assert.ok(!fs.existsSync(path.join(destination, ".gnupg/key.lock")));
        assert.ok(fs.existsSync(path.join(destination, ".gnupg/public-key")));
        const transfers = log("RSYNC").trim().split("\n");
        assert.equal(transfers.length, 3);
        assert.ok(transfers.every((line) => line.includes("-avhP --delete-after")));
        assert.match(log("GUM"), /confirm --default=false .*overwrite .*files and delete destination-only/);
        if (operation === "receive") assert.match(log("GUM"), /overwrite this host's files/);
    });
}

test("files, nested selections, symlinks, and custom IPv6 user/port round trip", (t) => {
    const { home, remote, env, run, write, log } = sandbox(t);
    write(home, "Downloads/backups/nested.txt");
    write(home, "bk.json", "config");
    write(home, ".backup.hc", "backup container");
    write(home, ".recovery.hc", "recovery container");
    write(remote, "unselected.txt", "keep");
    fs.symlinkSync("Downloads", path.join(home, "Documents"));
    env.SYNC_TEST_ITEMS = "Downloads/backups\n.recovery.hc\nDownloads\nbk.json\n.backup.hc\nDocuments";
    env.SYNC_TEST_REMOTE = "Custom IP";
    env.SYNC_TEST_IP = "2001:db8::1";
    env.SYNC_TEST_USER = "alice";
    env.SYNC_TEST_PORT = "2222";
    succeeds(run());
    assert.equal(fs.readlinkSync(path.join(remote, "Documents")), "Downloads");
    assert.equal(fs.readFileSync(path.join(remote, ".backup.hc"), "utf8"), "backup container");
    assert.equal(fs.readFileSync(path.join(remote, ".recovery.hc"), "utf8"), "recovery container");
    assert.equal(fs.readFileSync(path.join(remote, "unselected.txt"), "utf8"), "keep");
    assert.match(log("RSYNC"), /ssh -p 2222 .*alice@\[2001:db8::1\]/);
    assert.match(log("SSH"), /-p 2222 alice@2001:db8::1/);
    const transfers = log("RSYNC").trim().split("\n");
    assert.ok(transfers[1].includes("/Downloads "));
    assert.ok(transfers[2].includes("/Downloads/backups "));
    fs.unlinkSync(path.join(home, "Documents"));
    fs.rmSync(path.join(home, "Downloads"), { recursive: true });
    fs.unlinkSync(path.join(home, "bk.json"));
    env.SYNC_TEST_OPERATION = "receive";
    succeeds(run());
    assert.equal(fs.readlinkSync(path.join(home, "Documents")), "Downloads");
    assert.equal(fs.readFileSync(path.join(home, "Downloads/backups/nested.txt"), "utf8"), "Downloads/backups/nested.txt");
    assert.equal(fs.readFileSync(path.join(home, "bk.json"), "utf8"), "config");
});

test("SSH alias discovery follows Includes, deduplicates, and skips patterns", (t) => {
    const { home } = sandbox(t);
    const result = spawnSync("python3", [path.join(ROOT, "scripts/rsync/ssh-hosts.py")], {
        env: { ...process.env, HOME: home }, encoding: "utf8",
    });
    succeeds(result);
    assert.deepEqual(result.stdout.trim().split("\n"), ["devbox", "other", "included"]);
});

test("SSH alias discovery skips unusable aliases and unparsable lines", (t) => {
    const { home } = sandbox(t);
    fs.writeFileSync(path.join(home, ".ssh/hosts/extra"),
        "Host my+server -flag .hidden\nIdentityFile ~/.ssh/bob's_key\nHost after\n");
    const result = spawnSync("python3", [path.join(ROOT, "scripts/rsync/ssh-hosts.py")], {
        env: { ...process.env, HOME: home }, encoding: "utf8",
    });
    succeeds(result);
    assert.deepEqual(result.stdout.trim().split("\n"), ["devbox", "other", "after"]);
});

test("blank custom user/port use SSH defaults", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file");
    env.SYNC_TEST_REMOTE = "Custom IP";
    env.SYNC_TEST_IP = "192.0.2.10";
    succeeds(run("send"));
    assert.match(log("SSH"), /^192\.0\.2\.10 /);
    assert.ok(!log("RSYNC").includes("ssh -p"));
});

test("declined confirmation and cancelled selections perform no transfer", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file");
    env.SYNC_TEST_CONFIRM = "1";
    succeeds(run("send"));
    assert.equal(log("SSH"), "");
    assert.equal(log("RSYNC"), "");
    env.SYNC_TEST_CANCEL = "Select items to send";
    assert.equal(run("send").status, 130);
    assert.equal(log("RSYNC"), "");
});

test("SSH discovery failure never writes local files", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file", "keep");
    env.SYNC_TEST_SSH_FAIL = "1";
    assert.notEqual(run("receive").status, 0);
    assert.equal(fs.readFileSync(path.join(home, "Documents/file"), "utf8"), "keep");
    assert.equal(log("RSYNC"), "");
});

test("failed transfer stops before later selections", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file");
    write(home, "Videos/file");
    env.SYNC_TEST_ITEMS = "Documents\nVideos";
    env.SYNC_TEST_RSYNC_FAIL = "1";
    assert.notEqual(run("send").status, 0);
    assert.equal(log("RSYNC").trim().split("\n").length, 1);
});

test("receive rejects destination symlinks instead of modifying their targets", (t) => {
    const { home, remote, run, write, log } = sandbox(t);
    write(remote, "Documents/file");
    write(home, "Videos/keep");
    fs.symlinkSync("Videos", path.join(home, "Documents"));
    assert.notEqual(run("receive").status, 0);
    assert.ok(fs.existsSync(path.join(home, "Videos/keep")));
    assert.equal(log("RSYNC"), "");
});

test("invalid custom port is rejected before SSH", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file");
    env.SYNC_TEST_REMOTE = "Custom IP";
    env.SYNC_TEST_IP = "192.0.2.10";
    env.SYNC_TEST_PORT = "65536";
    assert.notEqual(run("send").status, 0);
    assert.equal(log("SSH"), "");
    assert.equal(log("RSYNC"), "");
});

test("invalid custom IP is rejected before SSH", (t) => {
    const { home, env, run, write, log } = sandbox(t);
    write(home, "Documents/file");
    env.SYNC_TEST_REMOTE = "Custom IP";
    env.SYNC_TEST_IP = "999.0.2.10";
    assert.notEqual(run("send").status, 0);
    assert.equal(log("SSH"), "");
    assert.equal(log("RSYNC"), "");
});

test("receive offers only existing remote items", (t) => {
    const { remote, env, run, write, log } = sandbox(t);
    write(remote, "Videos/file");
    const result = run("receive");
    assert.notEqual(result.status, 0);
    assert.match(log("GUM"), /Select items to receive Videos/);
    assert.equal(log("RSYNC"), "");
    env.SYNC_TEST_ITEMS = "Videos";
    succeeds(run("receive"));
});
