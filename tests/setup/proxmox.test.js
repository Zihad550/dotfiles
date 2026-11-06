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
    printf '%s\\n' \\
        'system/ubuntu-24.04-standard_24.04-2_amd64.tar.zst' \\
        'system/ubuntu-26.04-standard_26.04-1_amd64.tar.zst' \\
        'system/ubuntu-26.04-standard_26.04-2_amd64.tar.zst' \\
        'system/ubuntu-27.04-standard_27.04-1_arm64.tar.zst'
fi
`,
        pvesh: "#!/usr/bin/env bash\nprintf '101\\n'\n",
        pvesm: `#!/usr/bin/env bash
if [[ "$1" == status && "$2" == --storage ]]; then
    [[ "$3" == "$FAKE_UNAVAILABLE_STORAGE" ]] && exit 1
    exit 0
fi
if [[ "$1" == status && "$2" == --content && "$3" == rootdir ]]; then
    printf '%s\\n' \\
        'Name       Type     Status Total Used Available %' \\
        'local      dir      active 100   10   90        10%' \\
        'fast-lvm   lvmthin  active 200   20   180       10%' \\
        'offline    dir      inactive 50  0    50         0%'
    exit
fi
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

function runLxcCreator(overrides = {}, args = ["--defaults"]) {
    const fake = createFakeProxmoxEnvironment();
    try {
        const result = childProcess.spawnSync("fakeroot", ["bash", scriptPath, ...args], {
            encoding: "utf8",
            env: { ...fake.env, ...overrides },
        });
        return { ...result, pctLog: fs.readFileSync(fake.pctLog, "utf8") };
    } finally {
        fs.rmSync(fake.directory, { recursive: true });
    }
}

function runLxcCreatorInTerminal(input, overrides = {}, args = ["--defaults"]) {
    const fake = createFakeProxmoxEnvironment();
    try {
        const result = childProcess.spawnSync(
            "script",
            ["-qec", `fakeroot bash ${scriptPath} ${args.join(" ")}`, "/dev/null"],
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

// One answer per question in ask_config order; unset entries press Enter.
const QUESTIONS = [
    "version", "arch", "id", "hostname", "user", "cpu", "ram", "swap", "disk",
    "templateStorage", "rootfsStorage", "bridge", "ipv4", "ipv6", "sshKey",
    "unprivileged", "nesting", "keyctl", "tun", "onboot", "start", "updateCatalog",
];

function answers(given = {}, after = []) {
    for (const key of Object.keys(given)) assert.ok(QUESTIONS.includes(key), key);
    return [...QUESTIONS.map((key) => given[key] ?? ""), ...after].join("\n") + "\n";
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
    assert.match(result.stdout, /template: ubuntu-26\.04-standard_26\.04-2_amd64\.tar\.zst/);
    assert.match(result.stdout, /created container 101/);
});

test("a pinned Ubuntu version uses that release's newest template", () => {
    const result = runLxcCreator({ UBUNTU_VERSION: "24.04" });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /creating Ubuntu 24\.04 LXC/);
    assert.match(result.pctLog, /ubuntu-24\.04-standard_24\.04-2_amd64/);
});

test("without --defaults and without a terminal, nothing is created", () => {
    const result = runLxcCreator({}, []);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /pass --defaults/);
    assert.doesNotMatch(result.pctLog, /^create /m);
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

test("pressing Enter at every question creates the default container", () => {
    const result = runLxcCreatorInTerminal(answers({}, [""]), {}, []);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /Container ID \[next free\]/);
    assert.match(result.stdout, /Login user \[root only\]/);
    assert.match(result.pctLog, /ubuntu-26\.04-standard_26\.04-2_amd64/);
    assert.match(result.pctLog, /--cores 1 --memory 2048 --swap 1024 --rootfs local-lvm:12/);
});

test("interactive answers override the defaults and set a confirmed password", () => {
    const result = runLxcCreatorInTerminal(
        answers(
            { id: "150", hostname: "devbox", user: "dev", cpu: "4", disk: "40", sshKey: "none", onboot: "y" },
            ["", "secret", "secret", ""],
        ),
        {},
        [],
    );

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.pctLog, /^create 150 .*--hostname devbox --cores 4 .*--rootfs local-lvm:40 .*--onboot 1/m);
    assert.doesNotMatch(result.pctLog, /--ssh-public-keys/);
    assert.match(result.pctLog, /useradd --create-home --shell \/bin\/bash --groups sudo dev/);
    assert.match(result.pctLog, /stdin:dev:secret/);
});

test("an invalid answer is asked again", () => {
    const result = runLxcCreatorInTerminal(answers({ cpu: "zero\n4" }, [""]), {}, []);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /error: CPU_COUNT must be an integer: zero/);
    assert.match(result.pctLog, /--cores 4/);
});

test("declining the final confirmation creates nothing", () => {
    const result = runLxcCreatorInTerminal(answers({}, ["n"]), {}, []);

    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /cancelled; nothing was created/);
    assert.doesNotMatch(result.pctLog, /^create /m);
});

test("an unavailable rootfs storage can be replaced interactively", () => {
    const result = runLxcCreatorInTerminal(answers({}, ["2", ""]), {
        ROOTFS_STORAGE: "missing",
        FAKE_UNAVAILABLE_STORAGE: "missing",
    }, []);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /1\) local/);
    assert.match(result.stdout, /2\) fast-lvm/);
    assert.match(result.stdout, /disk:\s+12 GiB on fast-lvm/);
    assert.match(result.pctLog, /--rootfs fast-lvm:12/);
});

test("--defaults fails on an unavailable rootfs storage instead of asking", () => {
    const result = runLxcCreatorInTerminal("2\n", {
        ROOTFS_STORAGE: "missing",
        FAKE_UNAVAILABLE_STORAGE: "missing",
    });

    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /error: rootfs storage does not exist or is unavailable: missing/);
    assert.doesNotMatch(result.pctLog, /^create /m);
});

test("a missing template storage answer is asked again", () => {
    const result = runLxcCreatorInTerminal(
        answers({ templateStorage: "gone\nlocal" }, [""]),
        { FAKE_UNAVAILABLE_STORAGE: "gone" },
        [],
    );

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /error: template storage does not exist or is unavailable: gone/);
});

test("a privileged container is not asked about keyctl", () => {
    const keys = QUESTIONS.filter((key) => key !== "keyctl");
    const input = [...keys.map((key) => (key === "unprivileged" ? "n" : "")), ""].join("\n") + "\n";
    const result = runLxcCreatorInTerminal(input, {}, []);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /keyctl \(Docker/);
    assert.match(result.pctLog, /--unprivileged 0/);
});

test("a container user receives password-protected sudo and the configured SSH key", () => {
    assert.match(script, /useradd --create-home --shell \/bin\/bash --groups sudo "\$CT_USERNAME"/);
    assert.match(script, /Set a password for \$CT_USERNAME\? \[Y\/n\]/);
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
