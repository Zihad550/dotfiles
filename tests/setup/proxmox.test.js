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
