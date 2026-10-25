const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repo = path.resolve(__dirname, "../..");

function domainInstaller(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-dns-domain-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = path.join(dir, "commands");
    for (const destination of ["etc/dotfiles", "run/lock"]) {
        fs.mkdirSync(path.join(dir, "root", destination), { recursive: true });
    }
    let script = fs.readFileSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), "utf8");
    for (const prefix of ["/etc/", "/run/lock/", "/usr/local/libexec/"]) {
        script = script.replaceAll(prefix, `${dir}/root${prefix}`);
    }
    const installer = path.join(dir, "add-domain");
    fs.writeFileSync(installer, script, { mode: 0o755 });
    for (const name of ["apply-tailscale-dns", "dotfiles-tailscale-dns.service", "dotfiles-tailscale-dns.timer"]) {
        fs.copyFileSync(path.join(repo, "setup/common", name), path.join(dir, name));
    }
    for (const [name, code] of Object.entries({
        id: "echo 0",
        systemctl: 'echo "$*" >> "$LOG"; [[ "$1" != is-active || "${RESOLVED:-1}" == 1 ]]',
        install: `args=(); while (( $# )); do
            case "$1" in
                -o|-g) shift 2 ;;
                *) args+=("$1"); shift ;;
            esac
        done
        exec /usr/bin/install "\${args[@]}"`,
    })) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${code}\n`, { mode: 0o755 });
    }
    return {
        config: path.join(dir, "root/etc/dotfiles/tailscale-dns-domains"),
        log: () => fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "",
        run(domain, env = {}) {
            return spawnSync(installer, [domain], {
                encoding: "utf8", env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, LOG: log, ...env },
            });
        },
    };
}

test("adding domains preserves earlier choices and deduplicates normalized input", t => {
    const h = domainInstaller(t);
    for (const domain of ["Work.Example.", " other.example\t", "work.example\n"]) {
        const result = h.run(domain);
        assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(h.config, "utf8"), "other.example\nwork.example\n");
    assert.equal(fs.statSync(h.config).mode & 0o777, 0o644);
    assert.deepEqual(fs.readdirSync(path.dirname(h.config)), [".tailscale-dns.lock", "tailscale-dns-domains"]);
    assert.match(h.log(), /^enable dotfiles-tailscale-dns.service$/m);
    assert.match(h.log(), /^enable --now dotfiles-tailscale-dns.timer$/m);
    assert.match(h.log(), /^restart dotfiles-tailscale-dns.service$/m);
});

test("invalid domains cannot change the saved list or activate services", t => {
    const h = domainInstaller(t);
    for (const domain of ["", ".", "~.", "localhost", "100.100.100.100", "https://100.100.100.100/", "https://", "https://[fd7a::1]/", "*.work.example", "work..example", "-work.example", "work.example:http", "work.example\nother.example", "https://user\n@work.example/", "https://work.example/\nother.example", "work.example/\tx", "https://work.example\\@other.example/path", "ssh://work.example\\@other.example/repo", "https://100.100.100.0x64/", "work.0x", "1.2.3.4", "a".repeat(64) + ".example"]) {
        const result = h.run(domain);
        assert.equal(result.status, 2, domain);
    }
    assert.equal(fs.existsSync(h.config), false);
    assert.equal(h.log(), "");
});

test("--check prints the normalized domain without root", () => {
    const valid = spawnSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), ["--check", " Work.Example. "], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, "work.example\n");
    for (const url of ["https://Work.Example/org/repo.git?tab=1#top", "ssh://git@work.example:2222/repo", "http://user:pw@work.example:8080", "work.example:53"]) {
        const result = spawnSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), ["--check", url], { encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "work.example\n", url);
    }
    // A "://" later in a scheme-less URL is not a scheme.
    for (const url of ["work.example?next=https://other.example", "work.example/redirect/https://other.example"]) {
        const result = spawnSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), ["--check", url], { encoding: "utf8" });
        assert.equal(result.stdout, "work.example\n", url);
    }
    // Bash lowercasing maps some non-ASCII letters onto ASCII in a UTF-8 locale.
    for (const name of ["https://\u0130.example/path", "\u0130.example", "caf\u00e9.example"]) {
        const result = spawnSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), ["--check", name], {
            encoding: "utf8", env: { ...process.env, LC_ALL: "C.UTF-8" },
        });
        assert.equal(result.status, 2, name);
        assert.match(result.stderr, /punycode/);
    }
    const invalid = spawnSync(path.join(repo, "setup/common/add-tailscale-dns-domain"), ["--check", "*.work.example"], { encoding: "utf8" });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /'\*\.work\.example'/);
});

test("adding a domain requires the base resolver setup first", t => {
    const h = domainInstaller(t);
    const result = h.run("work.example", { RESOLVED: "0" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /setup-dns/);
    assert.equal(fs.existsSync(h.config), false);
});

test("Gum input reaches the installer, while cancellation and empty input do not", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-dns-gum-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = path.join(dir, "commands");
    for (const [name, code] of Object.entries({
        gum: 'printf "%s" "$DOMAIN"; exit "${GUM_STATUS:-0}"',
        id: "echo 1000",
        sudo: 'printf "%s\\n" "$*" > "$LOG"',
    })) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${code}\n`, { mode: 0o755 });
    }
    for (const [domain, gumStatus, expectedStatus, installs] of [
        ["Work.Example.", "0", 0, true],
        ["", "0", 0, false],
        ["work.example", "130", 130, false],
        ["https://work.example/path", "0", 0, true],
        ["*.work.example", "0", 2, false],
    ]) {
        fs.rmSync(log, { force: true });
        const result = spawnSync(path.join(repo, "bin/df-tailscale-dns"), [], {
            encoding: "utf8",
            env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, DOMAIN: domain, GUM_STATUS: gumStatus, LOG: log },
        });
        assert.equal(result.status, expectedStatus, result.stderr);
        assert.equal(fs.existsSync(log), installs);
        if (installs) assert.match(fs.readFileSync(log, "utf8"), /add-tailscale-dns-domain work.example\n$/);
    }
});

function domainRemover(t, saved) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-dns-remove-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = path.join(dir, "commands");
    fs.mkdirSync(path.join(dir, "root/etc/dotfiles"), { recursive: true });
    const config = path.join(dir, "root/etc/dotfiles/tailscale-dns-domains");
    if (saved !== null) fs.writeFileSync(config, saved);
    const remover = path.join(dir, "remove-domain");
    fs.writeFileSync(remover, fs.readFileSync(path.join(repo, "setup/common/remove-tailscale-dns-domain"), "utf8")
        .replaceAll("/etc/", `${dir}/root/etc/`), { mode: 0o755 });
    for (const [name, code] of Object.entries({ id: "echo 0", systemctl: 'echo "$*" >> "$LOG"' })) {
        fs.writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${code}\n`, { mode: 0o755 });
    }
    return {
        saved: () => fs.existsSync(config) ? fs.readFileSync(config, "utf8") : null,
        log: () => fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "",
        run: domain => spawnSync(remover, [domain], {
            encoding: "utf8", env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, LOG: log },
        }),
    };
}

test("removing a domain keeps the others and reapplies forwarding", t => {
    const h = domainRemover(t, "other.example\nwork.example\n");
    let result = h.run("work.example");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(h.saved(), "other.example\n");
    result = h.run("other.example");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(h.saved(), "");
    assert.equal(h.log(), "restart dotfiles-tailscale-dns.service\nrestart dotfiles-tailscale-dns.service\n");
});

test("removing an unsaved domain changes nothing", t => {
    for (const saved of [null, "work.example\n", "other.example\nwork.example\n"]) {
        const h = domainRemover(t, saved);
        for (const domain of ["", "unsaved.example", "work", "-v", ".*", "work.example\nother.example"]) {
            const result = h.run(domain);
            assert.equal(result.status, 1, domain);
            assert.match(result.stderr, /not a saved Tailscale DNS domain/);
        }
        assert.equal(h.saved(), saved);
        assert.equal(h.log(), "");
    }
});
