const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repo = path.resolve(__dirname, "../..");

function fixture(t, commands) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lxc-security-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const calls = path.join(directory, "calls");
    for (const [name, body] of Object.entries(commands)) {
        fs.writeFileSync(path.join(directory, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    }
    return {
        run(script, overrides = {}) {
            fs.writeFileSync(calls, "");
            const result = spawnSync("bash", [path.join(repo, script)], {
                encoding: "utf8",
                env: {
                    ...process.env, PATH: `${directory}:/usr/bin:/bin`,
                    XDG_CONFIG_HOME: path.join(directory, "config"),
                    PROBE_CALLS: calls, ...overrides,
                },
            });
            return { ...result, calls: fs.readFileSync(calls, "utf8") };
        },
    };
}

test("LXC packages remove only confirmed inactive UFW with no dependent removals", t => {
    const h = fixture(t, {
        sudo: 'exec "$@"',
        apt: "exit 0",
        ufw: 'printf "%s\\n" "$UFW_OUTPUT"; exit "$UFW_STATUS"',
        "apt-get": `if [[ "$1" == -s ]]; then
    printf '%s\\n' "$REMOVE_PLAN"
else
    printf '%s\\n' "$*" >> "$PROBE_CALLS"
fi`,
    });
    for (const [output, status, plan, removes] of [
        ["Status: inactive", "0", "Remv ufw [1.0]", true],
        ["Status: active", "0", "Remv ufw [1.0]", false],
        ["", "1", "Remv ufw [1.0]", false],
        ["Status: inactive", "1", "Remv ufw [1.0]", false],
        ["unknown", "0", "Remv ufw [1.0]", false],
        ["Status: inactive", "0", "Remv ufw [1.0]\nRemv other [1.0]", false],
    ]) {
        const result = h.run("setup/ubuntu-lxc-devbox/packages", {
            UFW_OUTPUT: output, UFW_STATUS: status, REMOVE_PLAN: plan,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.calls.includes("remove -y ufw"), removes, `${output}, exit ${status}`);
        if (status !== "0") assert.match(result.stderr, /could not determine ufw status/);
    }
});

test("Tailscale command previews redact auth keys on success and failure", t => {
    const h = fixture(t, {
        sudo: 'exec "$@"',
        systemctl: "exit 0",
        tailscale: `if [[ "$1" == up ]]; then
    printf '%s\\n' "$@" > "$PROBE_CALLS"
    exit "$UP_STATUS"
fi`,
    });
    const key = "tskey-auth-example-test-value";
    for (const status of ["0", "1"]) {
        const result = h.run("setup/common/setup-tailscale", {
            TS_AUTHKEY: key, TS_HOSTNAME: "devbox", TS_SSH: "0",
            TS_TAILNET_UFW_RULE: "0", TS_NEXT: "", UP_STATUS: status,
            DOTFILES_PROFILE: "ubuntu-lxc-devbox",
        });
        assert.equal(result.status, Number(status), result.stderr);
        assert.ok(!`${result.stdout}${result.stderr}`.includes(key), "auth key leaked in output");
        assert.match(result.stdout, /--authkey <redacted>/);
        assert.ok(result.calls.includes(`--authkey\n${key}\n`), "authentication argument changed");
        assert.ok(result.calls.includes("--accept-dns=false\n"));
        if (status === "1") assert.match(result.stdout, /--authkey <redacted> --accept-risk=lose-ssh/);
    }
    const result = h.run("setup/common/setup-tailscale", {
        TS_AUTHKEY: "", TS_HOSTNAME: "devbox", TS_SSH: "0",
        TS_TAILNET_UFW_RULE: "0", TS_NEXT: "", UP_STATUS: "0",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.calls.includes("--authkey"));
    assert.ok(!result.stdout.includes("<redacted>"));
});
