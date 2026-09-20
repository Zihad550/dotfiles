const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const cleanupPrompt = path.join(repoRoot, "setup/common/confirm-first-run-sudo-cleanup");

function runCleanup(t, input) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "first-run-sudo-cleanup-"));
    const sudoers = path.join(tempDir, "arch-setup-first-run");
    const sudo = path.join(tempDir, "sudo");
    fs.writeFileSync(sudoers, "temporary rule\n");
    fs.writeFileSync(sudo, "#!/usr/bin/env bash\n/usr/bin/rm \"${@: -1}\"\n", { mode: 0o755 });
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

    const result = childProcess.spawnSync(cleanupPrompt, {
        encoding: "utf8",
        input,
        env: {
            ...process.env,
            DF_FIRST_RUN_SUDOERS: sudoers,
            DF_FIRST_RUN_SUDO: sudo,
        },
    });

    return { result, sudoers };
}

test("the pre-restart check offers the exact removal command", t => {
    const { result, sudoers } = runCleanup(t, "y\n");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`sudo /usr/bin/rm -f ${sudoers}`));
    assert.match(result.stdout, /Remove it now\? \[Y\/n\]/);
    assert.strictEqual(fs.existsSync(sudoers), false);
});

test("the pre-restart check fails when the user keeps the file", t => {
    const { result, sudoers } = runCleanup(t, "n\n");

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /restart prompt was skipped/);
    assert.strictEqual(fs.existsSync(sudoers), true);
});

test("both Arch installers run the cleanup check before asking to restart", () => {
    for (const relativePath of ["setup/arch-workstation/init", "setup/arch-devbox/init"]) {
        const init = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

        assert.match(init,
            /on_exit_extra \|\| true[\s\S]*confirm-first-run-sudo-cleanup[\s\S]*confirm "Restart now\?"/);
    }
});
