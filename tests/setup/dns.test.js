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
    shim("tailscale", '[[ "$*" != "${DNS_TEST_FAIL:-}" ]]');
    shim("sudo", `
        printf 'sudo %s\\n' "$*" >> "$DNS_TEST_LOG"
        command="$1"
        shift
        case "$command" in
            cmp)
                exec /usr/bin/cmp -s "$2" "$DNS_TEST_ROOT$3"
                ;;
            install)
                [[ "$1 $2 $3 $4 $5" == '-Dm644 -o root -g root' || "$1 $2 $3 $4 $5" == '-Dm755 -o root -g root' ]]
                exec /usr/bin/install "$1" "$6" "$DNS_TEST_ROOT$7"
                ;;
            ln)
                mkdir -p "$DNS_TEST_ROOT/etc"
                exec /usr/bin/ln -sfn "$2" "$DNS_TEST_ROOT$3"
                ;;
            systemctl|tailscale)
                exec "$command" "$@"
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
    assert.match(config, /^DNS=1\.0\.0\.3#family\.cloudflare-dns\.com$/m);
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
    assert.match(h.log(), /^sudo tailscale set --accept-dns=false$/m);
    assert.doesNotMatch(h.log(), /resolvectl|^sudo ln |dotfiles-tailscale-dns|libexec/m);
});

test("a split resolver is handed to resolved only after its configuration is in place", t => {
    const h = harness(t, true);
    for (const run of [1, 2]) {
        const result = h.run();
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(h.nmDestination, "utf8"), nmConfig);
        assert.equal(h.count(/^systemctl restart tailscaled$/gm), 0);
        assert.equal(h.count(/^systemctl reload NetworkManager$/gm), 1);
    }
    const lines = h.log().split("\n");
    const at = pattern => lines.findIndex(line => pattern.test(line));
    const link = at(/^sudo ln /);
    assert.ok(at(/^sudo install .*10-dns-override\.conf$/) < link);
    assert.ok(at(/^sudo install .*NetworkManager/) < link);
    assert.ok(at(/^systemctl enable --now systemd-resolved$/) < link);
    assert.ok(at(/^systemctl reload NetworkManager$/) < link);
    assert.ok(at(/^sudo tailscale set --accept-dns=false$/) < link);
    assert.doesNotMatch(h.log(), /resolvectl|systemctl restart NetworkManager/);
});

test("DNS takeover must be disabled before changing the system resolver", t => {
    const h = harness(t, true);
    const result = h.run({ DNS_TEST_FAIL: "set --accept-dns=false" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(h.log(), /^sudo ln |^sudo install /m);
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

function runApply(t, { active = true, link = true, fail = "", domains = "work.example\n" } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-split-dns-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = path.join(dir, "commands");
    for (const [name, code] of Object.entries({
        systemctl: `exit ${active ? 0 : 3}`,
        ip: `exit ${link ? 0 : 1}`,
        tailscale: 'echo "tailscale $*" >> "$LOG"',
        resolvectl: 'echo "resolvectl $*" >> "$LOG"; [[ "$*" != "$FAIL" ]]',
    })) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${code}\n`, { mode: 0o755 });
    }
    const configFile = path.join(dir, "domains");
    fs.writeFileSync(configFile, domains);
    const helper = path.join(dir, "apply");
    fs.writeFileSync(helper, fs.readFileSync(path.join(repo, "setup/common/apply-tailscale-dns"), "utf8")
        .replaceAll("/etc/dotfiles/tailscale-dns-domains", configFile), { mode: 0o755 });
    const result = spawnSync(helper, [], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, LOG: log, FAIL: fail },
    });
    return { ...result, log: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "" };
}

test("local split DNS disables takeover and configures only the allowed domain", t => {
    const result = runApply(t);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.log.trim().split("\n"), [
        "tailscale set --accept-dns=false",
        "resolvectl default-route tailscale0 no",
        "resolvectl dnsovertls tailscale0 no",
        "resolvectl domain tailscale0 ~work.example",
        "resolvectl dns tailscale0 100.100.100.100",
    ]);
});

test("inactive Tailscale is left stopped and missing interfaces are tolerated", t => {
    const stopped = runApply(t, { active: false });
    assert.equal(stopped.status, 0);
    assert.equal(stopped.log, "");
    const noLink = runApply(t, { link: false });
    assert.equal(noLink.status, 0);
    assert.equal(noLink.log, "tailscale set --accept-dns=false\n");
});

test("resolver failure is propagated so systemd can retry", t => {
    const result = runApply(t, { fail: "domain tailscale0 ~work.example" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.log, /resolvectl dns /);
});

test("split DNS is reapplied on resolver, daemon and interface activation", () => {
    const service = fs.readFileSync(path.join(repo, "setup/common/dotfiles-tailscale-dns.service"), "utf8");
    assert.match(service, /^WantedBy=systemd-resolved.service tailscaled.service sys-subsystem-net-devices-tailscale0.device$/m);
    assert.match(service, /^After=systemd-resolved.service tailscaled.service$/m);
    assert.match(service, /^Restart=on-failure$/m);
    assert.doesNotMatch(service, /RemainAfterExit=yes/);
    assert.match(nmConfig, /match-device=interface-name:tailscale0\nmanaged=0/);
});

test("workstation retains DHCP DNS without an explicit default upstream", () => {
    const config = fs.readFileSync(path.join(repo, "setup/arch-workstation/dns.conf"), "utf8");
    assert.match(config, /^DNS=$/m);
    assert.match(config, /^Domains=$/m);
    assert.match(config, /^DNSOverTLS=no$/m);
    assert.doesNotMatch(config, /1\.0\.0\.3|~\./);
});

test("joining opts supported profiles out of DNS takeover and preserves legacy defaults", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-dns-join-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = path.join(dir, "commands");
    for (const [name, code] of Object.entries({
        sudo: 'exec "$@"',
        systemctl: "exit 0",
        tailscale: 'echo "$*" >> "$LOG"; if [[ "$1" == ip ]]; then echo 100.64.0.1; fi',
    })) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${code}\n`, { mode: 0o755 });
    }
    const configHome = path.join(dir, "config");
    const profileFile = path.join(configHome, "uwsm/env.d/10-dotfiles-profile");
    fs.mkdirSync(path.dirname(profileFile), { recursive: true });
    for (const [profile, saved, optOut] of [
        ["", null, false],
        ["arch-devbox", null, true],
        ["arch-workstation", null, true],
        ["ubuntu-lxc-devbox", null, true],
        ["", "arch-devbox", true],
        ["", "arch-workstation", true],
        ["", "ubuntu-lxc-devbox", true],
        ["arch-devbox", "unsupported", false],
    ]) {
        if (saved === null) fs.rmSync(profileFile, { force: true });
        else fs.writeFileSync(profileFile, `export DOTFILES_PROFILE=${saved}\n`);
        fs.writeFileSync(log, "");
        const result = spawnSync(path.join(repo, "setup/common/setup-tailscale"), [], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${dir}:/usr/bin:/bin`, LOG: log, DOTFILES_PROFILE: profile, XDG_CONFIG_HOME: configHome,
                TS_HOSTNAME: "devbox", TS_AUTHKEY: "", TS_SSH: "0",
                TS_TAILNET_UFW_RULE: "0", TS_NEXT: "",
            },
        });
        assert.equal(result.status, 0, result.stderr);
        const commands = fs.readFileSync(log, "utf8");
        if (optOut) assert.match(commands, /^up --hostname devbox --accept-dns=false$/m);
        else assert.match(commands, /^up --hostname devbox$/m);
    }
});

test("no configured domains means no Tailscale DNS route", t => {
    const result = runApply(t, { domains: "" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.log, "tailscale set --accept-dns=false\nresolvectl revert tailscale0\n");
});

test("every saved domain becomes a routing-only suffix", t => {
    const result = runApply(t, { domains: "work.example\n\nother.example\n" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.log, /^resolvectl domain tailscale0 ~work.example ~other.example$/m);
});
