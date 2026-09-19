const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const scriptPath = path.join(repoRoot, "setup/proxmox/ubuntu/create-ubuntu-lxc");
const script = fs.readFileSync(scriptPath, "utf8");
const firewallPath = path.join(repoRoot, "setup/proxmox/ubuntu/setup-firewall");
const firewall = fs.readFileSync(firewallPath, "utf8");

function createFakeProxmoxEnvironment() {
    const directory = fs.mkdtempSync("/tmp/proxmox-test-");
    const binDirectory = path.join(directory, "bin");
    const containerState = path.join(directory, "container-created");
    const pctLog = path.join(directory, "pct.log");
    const authorizedKeys = path.join(directory, "authorized_keys");
    fs.mkdirSync(binDirectory);
    fs.writeFileSync(pctLog, "");
    fs.writeFileSync(authorizedKeys, "ssh-ed25519 test-key\n");

    const commands = {
        pct: `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_PCT_LOG"
if [[ "$*" == *" -- chpasswd" ]]; then
    IFS= read -r password_entry
    printf 'stdin:%s\\n' "$password_entry" >> "$FAKE_PCT_LOG"
fi
case "$1" in
status)
    [[ -e "$FAKE_PCT_STATE" ]] || exit 1
    printf 'status: stopped\\n'
    ;;
create)
    : > "$FAKE_PCT_STATE"
    ;;
esac
`,
        pveam: `#!/usr/bin/env bash
if [[ "$1" == available ]]; then
    printf 'system/ubuntu-26.04-standard_26.04-1_amd64.tar.zst\\n'
fi
`,
        pvesh: "#!/usr/bin/env bash\nprintf '101\\n'\n",
        pvesm: `#!/usr/bin/env bash
if [[ "$1" == path ]]; then
    printf '/tmp/fake-template\\n'
fi
`,
    };

    for (const [name, contents] of Object.entries(commands)) {
        const commandPath = path.join(binDirectory, name);
        fs.writeFileSync(commandPath, contents, { mode: 0o755 });
    }

    return {
        directory,
        pctLog,
        env: {
            ...process.env,
            PATH: `${binDirectory}:${process.env.PATH}`,
            FAKE_PCT_LOG: pctLog,
            FAKE_PCT_STATE: containerState,
            BRIDGE: "lo",
            TUN: "0",
            UPDATE_TEMPLATE_CATALOG: "0",
            SSH_AUTHORIZED_KEY_FILE: authorizedKeys,
        },
    };
}

function runLxcCreator(overrides = {}) {
    const fake = createFakeProxmoxEnvironment();
    try {
        return childProcess.spawnSync("fakeroot", ["bash", scriptPath], {
            encoding: "utf8",
            env: { ...fake.env, ...overrides },
        });
    } finally {
        fs.rmSync(fake.directory, { recursive: true });
    }
}

function runLxcCreatorInTerminal(input, overrides = {}) {
    const fake = createFakeProxmoxEnvironment();
    try {
        const result = childProcess.spawnSync(
            "script",
            ["-qec", `fakeroot bash ${scriptPath}`, "/dev/null"],
            {
                encoding: "utf8",
                env: { ...fake.env, ...overrides },
                input,
            },
        );
        return {
            ...result,
            pctLog: fs.readFileSync(fake.pctLog, "utf8"),
        };
    } finally {
        fs.rmSync(fake.directory, { recursive: true });
    }
}

test("the Proxmox LXC creator has valid Bash syntax", () => {
    const result = childProcess.spawnSync("bash", ["-n", scriptPath], {
        encoding: "utf8",
    });

    assert.strictEqual(result.status, 0, result.stderr);
});

test("the optional container user defaults to root-only access", () => {
    assert.match(script, /CT_USERNAME="\$\{CT_USERNAME:-\}"/);
    assert.match(script, /if \[\[ -n "\$CT_USERNAME" \]\]; then\n\s+provision_user/);
    assert.match(script, /user:\s+\$\{CT_USERNAME:-root\}/);
});

test("root-only container creation continues past the optional password prompt", () => {
    const result = runLxcCreator();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /creating Ubuntu 26\.04 LXC/);
    assert.match(result.stdout, /created container 101/);
});

test("container creation continues when an unused container ID is specified", () => {
    const result = runLxcCreator({ CT_ID: "123" });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /created container 123/);
});

test("container creation continues when its optional user password is declined", () => {
    const result = runLxcCreatorInTerminal("n\n", { CT_USERNAME: "dev" });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /created container 101/);
});

test("container creation prompts for a user and confirmed password", () => {
    const result = runLxcCreatorInTerminal("y\ndev\nsecret\nsecret\n");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.pctLog, /useradd --create-home --shell \/bin\/bash --groups sudo dev/);
    assert.match(result.pctLog, /stdin:dev:secret/);
});

test("interactive user creation rejects an empty username", () => {
    const result = runLxcCreatorInTerminal("y\n\nx\nx\n");

    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /error: username must not be empty/);
});

test("a container user receives password-protected sudo and the configured SSH key", () => {
    assert.match(script, /useradd --create-home --shell \/bin\/bash --groups sudo "\$CT_USERNAME"/);
    assert.match(script, /Set a password for \$CT_USERNAME\? \[y\/N\]/);
    assert.match(script, /pct exec "\$CT_ID" -- chpasswd/);
    assert.doesNotMatch(script, /NOPASSWD/);
    assert.match(script, /home\/\$CT_USERNAME\/\.ssh\/authorized_keys/);
    assert.match(script, /rm -f \/root\/\.ssh\/authorized_keys/);
});

test("the Proxmox firewall setup has valid Bash syntax", () => {
    const result = childProcess.spawnSync("bash", ["-n", firewallPath], {
        encoding: "utf8",
    });

    assert.strictEqual(result.status, 0, result.stderr);
});

test("the Proxmox firewall setup preserves net0 while enabling its firewall", () => {
    const command = 'source "$1"; enable_firewall_in_net_config "$2"';
    const withoutFlag = childProcess.spawnSync(
        "bash",
        ["-c", command, "bash", firewallPath, "name=eth0,bridge=vmbr0,ip=dhcp"],
        { encoding: "utf8" },
    );
    const disabledFlag = childProcess.spawnSync(
        "bash",
        ["-c", command, "bash", firewallPath, "name=eth0,firewall=0,ip=dhcp"],
        { encoding: "utf8" },
    );

    assert.strictEqual(withoutFlag.status, 0, withoutFlag.stderr);
    assert.strictEqual(
        withoutFlag.stdout,
        "name=eth0,bridge=vmbr0,ip=dhcp,firewall=1\n",
    );
    assert.strictEqual(disabledFlag.status, 0, disabledFlag.stderr);
    assert.strictEqual(disabledFlag.stdout, "name=eth0,firewall=1,ip=dhcp\n");
});

test("the Proxmox firewall setup finds its managed Tailscale rule", () => {
    const command = `
        source "$1"
        pvesh() {
            printf '%s\\n' '[{"pos":0,"comment":"other"},{"pos":3,"comment":"dotfiles-tailscale-direct"}]'
        }
        tailscale_rule_position /test/firewall
    `;
    const result = childProcess.spawnSync(
        "bash",
        ["-c", command, "bash", firewallPath],
        { encoding: "utf8" },
    );

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout, "3");
});

test("the Proxmox firewall setup uses guest policy and requires the cluster firewall", () => {
    assert.match(firewall, /pvesh get \/cluster\/firewall\/options/);
    assert.match(firewall, /--policy_in DROP/);
    assert.match(firewall, /--policy_out ACCEPT/);
    assert.match(firewall, /--ndp 1/);
    assert.match(firewall, /pct set "\$ct_id" --net0 "\$firewall_net0"/);
    assert.match(firewall, /pvesh delete "\$api_path\/rules\/\$position"/);
    assert.doesNotMatch(firewall, /pvesh set \/cluster\/firewall\/options/);
});
