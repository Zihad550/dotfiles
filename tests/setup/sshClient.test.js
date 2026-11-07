const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const WRAPPER = path.join(ROOT, "zsh/.config/zsh/ssh-reconnect.zsh");

test("SSH classification accepts shells and rejects remote commands", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssh-wrapper-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const ssh = path.join(root, "ssh");
    fs.writeFileSync(ssh, "#!/usr/bin/env bash\n[[ $1 == -G ]] && printf '%s\\n' 'remotecommand none'\n");
    fs.chmodSync(ssh, 0o755);

    const command = `source ${JSON.stringify(WRAPPER)}; _ssh_interactive -p 22 devbox; print $?; _ssh_interactive devbox uptime; print $?`;
    const result = childProcess.spawnSync("zsh", ["-c", command], {
        env: { ...process.env, PATH: `${root}:/usr/bin:/bin` },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.stdout.trim().split("\n"), ["0", "1"]);
});

test("both Arch desktop profiles install shared SSH client defaults", () => {
    for (const file of ["setup/arch-workstation/init", "setup/arch-devbox/init"])
        assert.match(fs.readFileSync(path.join(ROOT, file), "utf8"), /setup\/common\/setup-ssh-client/);

    const setup = fs.readFileSync(path.join(ROOT, "setup/common/setup-ssh-client"), "utf8");
    assert.match(setup, /ServerAliveInterval 15/);
    assert.match(setup, /ConnectTimeout 10/);
    assert.match(setup, /\.local\/share\/mise\/shims/);
});
