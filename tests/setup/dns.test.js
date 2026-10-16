const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repo = path.resolve(__dirname, "../..");
const config = fs.readFileSync(path.join(repo, "setup/arch-devbox/10-dns-override.conf"), "utf8");
const nmConfig = fs.readFileSync(path.join(repo, "setup/common/networkmanager-dns.conf"), "utf8");

function harness(t, splitResolver = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-dns-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const destination = path.join(dir, "etc/systemd/resolved.conf.d/10-dns-override.conf");
    const nmDestination = path.join(dir, "etc/NetworkManager/conf.d/dns.conf");
    const log = path.join(dir, "commands");
    function shim(name, body) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 });
    }
    shim("readlink", `
        if [[ -L "$DNS_TEST_ROOT/etc/resolv.conf" ]]; then
            echo /run/systemd/resolve/stub-resolv.conf
        else
            echo '${splitResolver ? "/etc/resolv.conf" : "/run/systemd/resolve/stub-resolv.conf"}'
        fi
    `);
    shim("systemctl", `
        printf "systemctl %s\\n" "$*" >> "$DNS_TEST_LOG"
        [[ "$*" != "\${DNS_TEST_FAIL:-}" ]]
    `);
    shim("tailscale", 'echo "unexpected Tailscale mutation" >&2; exit 99');
    shim("sudo", `
        printf 'sudo %s\\n' "$*" >> "$DNS_TEST_LOG"
        command="$1"
        shift
        case "$command" in
            cmp)
                exec /usr/bin/cmp -s "$2" "$DNS_TEST_ROOT$3"
                ;;
            install)
                [[ "$1 $2 $3 $4 $5" == '-Dm644 -o root -g root' ]]
                exec /usr/bin/install -Dm644 "$6" "$DNS_TEST_ROOT$7"
                ;;
            ln)
                mkdir -p "$DNS_TEST_ROOT/etc"
                exec /usr/bin/ln -sfn "$2" "$DNS_TEST_ROOT$3"
                ;;
            systemctl)
                exec systemctl "$@"
                ;;
            *) exit 98 ;;
        esac
    `);
    const readLog = () => fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
    return {
        destination,
        nmDestination,
        log: readLog,
        count: pattern => (readLog().match(pattern) || []).length,
        run(extraEnv = {}) {
            return spawnSync(path.join(repo, "setup/arch-devbox/setup-dns"), [], {
                encoding: "utf8",
                env: {
                    ...process.env,
                    DNS_SERVERS: "",
                    PATH: `${dir}:/usr/bin:/bin`,
                    DNS_TEST_ROOT: dir,
                    DNS_TEST_LOG: log,
                    ...extraEnv,
                },
            });
        },
    };
}

test("the tracked drop-in selects authenticated strict Cloudflare Family DoT", () => {
    assert.match(config, /^DNS=1\.1\.1\.3#family\.cloudflare-dns\.com 1\.0\.0\.3#family\.cloudflare-dns\.com$/m);
    assert.match(config, /^DNSOverTLS=yes$/m);
    assert.match(config, /^Domains=~\.$/m);
});

test("devbox installs the drop-in, repairs drift and avoids redundant restarts", t => {
    const h = harness(t);
    for (const run of [1, 2, 3]) {
        if (run === 3) fs.writeFileSync(h.destination, "[Resolve]\nDNS=1.1.1.3\n");
        const result = h.run();
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(h.destination, "utf8"), config);
        assert.equal(fs.statSync(h.destination).mode & 0o777, 0o644);
        assert.equal(h.count(/^systemctl restart systemd-resolved$/gm), run === 3 ? 2 : 1);
    }
    assert.match(h.log(), /^systemctl enable --now systemd-resolved$/m);
    assert.doesNotMatch(h.log(), /tailscale|resolvectl|^sudo ln /m);
});

test("a split resolver is handed to resolved only after its configuration is in place", t => {
    const h = harness(t, true);
    for (const run of [1, 2]) {
        const result = h.run();
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(h.nmDestination, "utf8"), nmConfig);
        assert.equal(h.count(/^systemctl restart tailscaled$/gm), 1);
        assert.equal(h.count(/^systemctl reload NetworkManager$/gm), 1);
    }
    const lines = h.log().split("\n");
    const at = pattern => lines.findIndex(line => pattern.test(line));
    const link = at(/^sudo ln /);
    assert.ok(at(/^sudo install .*10-dns-override\.conf$/) < link);
    assert.ok(at(/^sudo install .*NetworkManager/) < link);
    assert.ok(at(/^systemctl enable --now systemd-resolved$/) < link);
    assert.ok(at(/^systemctl reload NetworkManager$/) < link);
    assert.equal(at(/^sudo systemctl restart tailscaled$/), link + 2);
    assert.doesNotMatch(h.log(), /--accept-dns|resolvectl|systemctl restart NetworkManager/);
});

test("a failed tailscaled re-probe fails the run with the manual fix", t => {
    const h = harness(t, true);
    const result = h.run({ DNS_TEST_FAIL: "restart tailscaled" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sudo systemctl restart tailscaled/);
});

test("a failed resolved restart stops before the handoff and names the command", t => {
    const h = harness(t, true);
    const result = h.run({ DNS_TEST_FAIL: "restart systemd-resolved" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sudo systemctl restart systemd-resolved/);
    assert.equal(fs.existsSync(h.nmDestination), false);
    assert.doesNotMatch(h.log(), /^sudo ln /m);
});

test("DNS_SERVERS overrides the tracked drop-in and reruns idempotently", t => {
    const h = harness(t);
    for (const run of [1, 2]) {
        const result = h.run({ DNS_SERVERS: "9.9.9.9 149.112.112.112" });
        assert.equal(result.status, 0, result.stderr);
        const dropin = fs.readFileSync(h.destination, "utf8");
        assert.match(dropin, /^DNS=9\.9\.9\.9 149\.112\.112\.112$/m);
        assert.match(dropin, /^Domains=~\.$/m);
        assert.match(dropin, /^# setup-ufw blocks a LAN-only resolver/m);
        assert.equal(h.count(/^systemctl restart systemd-resolved$/gm), 1);
    }
});
