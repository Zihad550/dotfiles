const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const scriptPath = path.join(repoRoot, "setup/proxmox/create-ubuntu-lxc");
const script = fs.readFileSync(scriptPath, "utf8");

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
