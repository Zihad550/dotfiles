const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const check = path.join(repoRoot, "setup/common/check-kernel-modules");
const inits = ["setup/arch-workstation/init", "setup/arch-devbox/init"];

function runCheck(t, installedKernels) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-modules-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const modules = path.join(tempDir, "modules");
    for (const kernel of installedKernels) {
        fs.mkdirSync(path.join(modules, kernel), { recursive: true });
    }
    const bin = path.join(tempDir, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "uname"), "#!/usr/bin/env bash\necho 7.2.6-arch2-1\n", { mode: 0o755 });

    return childProcess.spawnSync(check, {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DF_MODULES_DIR: modules },
    });
}

test("the kernel check passes while the running kernel's modules exist", t => {
    const result = runCheck(t, ["7.2.6-arch2-1"]);
    assert.strictEqual(result.status, 0, result.stderr);
});

test("the kernel check asks for a reboot after an upgrade removed them", t => {
    const result = runCheck(t, ["7.2.7-arch1-1"]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /running kernel \(7\.2\.6-arch2-1\) has no modules/);
    assert.match(result.stderr, /Reboot, then rerun this setup/);
});

test("both Arch installers check kernel modules right after the upgrade", () => {
    for (const relativePath of inits) {
        const init = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        assert.match(init,
            /run_step "system upgrade \+ stow"[^\n]*\n(?:\s*\n|#[^\n]*\n)*run_step "kernel modules" "\$DOTFILES_DIR\/setup\/common\/check-kernel-modules"/,
            `${relativePath} does not run the kernel check right after the upgrade`);
    }
});

test("first-install reminders print only before .initialized exists", () => {
    for (const relativePath of inits) {
        const init = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        const decided = init.indexOf('if [[ -e "$ARCH_SETUP_STATE_DIR/.initialized" ]]; then');
        const marked = init.indexOf('touch "$ARCH_SETUP_STATE_DIR/.initialized"');
        assert.ok(decided !== -1 && decided < marked,
            `${relativePath} must read the marker before this run creates it`);
        assert.match(init.slice(marked), /if \[\[ "\$first_install" == true \]\]; then/);
    }
});
