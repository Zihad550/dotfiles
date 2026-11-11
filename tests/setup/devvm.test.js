const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");

const repo = path.resolve(__dirname, "../..");
const installer = path.join(repo, "setup/ubuntu-lxc-devbox/setup-devvm");

function fixture(t, installed = false) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lxc-devvm-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const home = path.join(directory, "home");
    const bin = path.join(directory, "bin");
    const release = path.join(directory, "release");
    const config = path.join(directory, "config");
    const calls = path.join(directory, "calls");
    for (const dir of [home, bin, release, config]) fs.mkdirSync(dir);
    fs.writeFileSync(calls, "");
    const writeCommand = (dir, name, body) =>
        fs.writeFileSync(path.join(dir, name), `#!/bin/bash\nset -e\n${body}\n`, { mode: 0o755 });

    writeCommand(bin, "sudo", 'printf "sudo %s\\n" "$*" >> "$CALLS"');
    writeCommand(bin, "systemd-detect-virt", 'echo "${VIRT:-lxc}"');
    writeCommand(bin, "curl", `printf 'curl %s\\n' "$*" >> "$CALLS"
while (( $# )); do
    if [[ "$1" == -o ]]; then output=$2; shift 2; else url=$1; shift; fi
done
cp "$RELEASE/\${url##*/}" "$output"`);
    writeCommand(bin, "minisign", 'echo minisign >> "$CALLS"; exit "${SIGNATURE_STATUS:-0}"');
    writeCommand(release, "devvm", `printf 'devvm %s\\n' "$*" >> "$CALLS"
if [[ "$1" == doctor ]]; then exit "\${DOCTOR_STATUS:-0}"; fi`);
    writeCommand(release, "limactl", "exit 0");
    writeCommand(release, "install.sh", `echo install >> "$CALLS"
mkdir -p "$HOME/.local/bin"
cp "$RELEASE/devvm" "$RELEASE/limactl" "$HOME/.local/bin/"`);
    const installBytes = fs.readFileSync(path.join(release, "install.sh"));
    const digest = createHash("sha256").update(installBytes).digest("hex");
    fs.writeFileSync(path.join(release, "SHA256SUMS"), `${digest}  install.sh\n`);
    fs.writeFileSync(path.join(release, "SHA256SUMS.minisig"), "fixture signature\n");

    // Only the hardware probe is simulated; download checksums use sha256sum.
    const bashEnv = path.join(directory, "bash-env");
    fs.writeFileSync(bashEnv, `test() {
    if [[ \${2:-} == /dev/kvm ]]; then
        [[ \${KVM_FAILURE:-} != "$1" ]]
    else
        builtin test "$@"
    fi
}
`);
    if (installed) {
        fs.mkdirSync(path.join(home, ".local/bin"), { recursive: true });
        for (const name of ["devvm", "limactl"]) {
            fs.copyFileSync(path.join(release, name), path.join(home, ".local/bin", name));
        }
    }
    return {
        home, release, config,
        run(overrides = {}) {
            const result = spawnSync("bash", [installer], {
                encoding: "utf8",
                env: {
                    ...process.env, HOME: home, XDG_CONFIG_HOME: config,
                    DOTFILES_DIR: repo, PATH: `${bin}:/usr/bin:/bin`,
                    BASH_ENV: bashEnv, RELEASE: release, CALLS: calls, ...overrides,
                },
            });
            return { ...result, calls: fs.readFileSync(calls, "utf8") };
        },
    };
}

test("LXC DevVM setup installs verified tools and configures shell plus desktop", t => {
    const f = fixture(t);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /apt-get install .*qemu-system qemu-utils rsync/);
    assert.match(result.calls, /minisign\ninstall\ndevvm doctor\ndevvm setup --layers shell,desktop --no-input/);
    assert.equal(fs.readlinkSync(path.join(f.config, "devvm/layers")), path.join(repo, "devvm/.config/devvm/layers"));
});

test("installed DevVM and Lima skip downloads, including on rerun", t => {
    const f = fixture(t, true);
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = f.run();
        assert.equal(result.status, 0, result.stderr);
        assert.doesNotMatch(result.calls, /^curl |^minisign$|^install$/m);
    }
});

test("missing Lima triggers installation even with DevVM already installed", t => {
    const f = fixture(t, true);
    fs.unlinkSync(path.join(f.home, ".local/bin/limactl"));
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.calls, /^install$/m);
});

for (const flag of ["-c", "-r", "-w"]) {
    test(`KVM probe failure (${flag}) stops before package or config changes`, t => {
        const f = fixture(t);
        const result = f.run({ KVM_FAILURE: flag });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /KVM passthrough/);
        assert.equal(result.calls, "");
        assert.equal(fs.existsSync(path.join(f.config, "devvm")), false);
    });
}

test("a different machine profile or container type stops before installation", t => {
    const f = fixture(t);
    let result = f.run({ VIRT: "docker" });
    assert.equal(result.status, 1);
    assert.equal(result.calls, "");
    const profileDir = path.join(f.config, "uwsm/env.d");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "10-dotfiles-profile"), "export DOTFILES_PROFILE=arch-workstation\n");
    result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already set up/);
    assert.equal(result.calls, "");
});

test("a real layers directory is preserved and installation stops", t => {
    const f = fixture(t);
    const layers = path.join(f.config, "devvm/layers");
    fs.mkdirSync(layers, { recursive: true });
    fs.writeFileSync(path.join(layers, "custom.sh"), "custom");
    const result = f.run();
    assert.equal(result.status, 1);
    assert.equal(result.calls, "");
    assert.equal(fs.readFileSync(path.join(layers, "custom.sh"), "utf8"), "custom");
});

test("a failed signature prevents executing the downloaded installer", t => {
    const result = fixture(t).run({ SIGNATURE_STATUS: "1" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.calls, /^install$|devvm /m);
});

for (const sums of ["bad digest", "missing installer entry"]) {
    test(`${sums} prevents executing the downloaded installer`, t => {
        const f = fixture(t);
        fs.writeFileSync(path.join(f.release, "SHA256SUMS"), `${"0".repeat(64)}  ${sums === "bad digest" ? "install.sh" : "other-file"}\n`);
        const result = f.run();
        assert.notEqual(result.status, 0);
        assert.doesNotMatch(result.calls, /^install$|devvm /m);
    });
}

test("failed doctor prevents configuring VM defaults", t => {
    const f = fixture(t, true);
    const result = f.run({ DOCTOR_STATUS: "1" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.calls, /devvm setup/);
    assert.equal(fs.existsSync(path.join(f.config, "devvm")), false);
});
