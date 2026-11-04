// setup/ubuntu-devbox/tools against a fake mise.
//
//     node --test tests/setup/ubuntuTools.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const toolsPath = path.join(repoRoot, "setup/ubuntu-devbox/tools");

function runTools(t, failOn, { logDirectory, withMise = true, stateHome, viaSymlink = false } = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ubuntu-tools-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    const binDirectory = path.join(directory, "bin");
    const calls = path.join(directory, "calls");
    fs.mkdirSync(binDirectory);
    // PATH holds only this directory, so a real mise can never run from a test.
    for (const command of ["bash", "date", "mktemp", "mkdir", "tee", "rm", "rmdir", "tail", "sed", "find", "sort", "head", "dirname", "readlink"]) {
        const target = childProcess.execFileSync("bash", ["-c", `command -v ${command}`], { encoding: "utf8" }).trim();
        fs.symlinkSync(target, path.join(binDirectory, command));
    }
    if (withMise) fs.writeFileSync(path.join(binDirectory, "mise"), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_MISE_CALLS"
[[ "$FAKE_MISE_FAIL" == INTERRUPT && "$*" == *ghq* ]] && exit 130
[[ "$FAKE_MISE_FAIL" == INSTALL_INTERRUPT && "$*" == install*claude* ]] && exit 130
[[ "$FAKE_MISE_FAIL" == SIGNAL_* && "$*" == *claude* ]] && exit 3
if [[ "$FAKE_MISE_FAIL" == SIGNAL_* && "$*" == *python* ]]; then
    kill -s "\${FAKE_MISE_FAIL#SIGNAL_}" "$PPID"
    exit 0
fi
[[ "$FAKE_MISE_FAIL" == OOM && "$*" == *claude* ]] && exit 137
[[ "$FAKE_MISE_FAIL" == INTERRUPT && "$*" == *claude* ]] && exit 3
if [[ -n "$FAKE_MISE_FAIL" && "$*" =~ $FAKE_MISE_FAIL ]]; then
    echo "mise ERROR failed to install $*: HTTP 403 rate limited" >&2
    exit 3
fi
echo "installed $*"
`, { mode: 0o755 });

    const logs = stateHome ? undefined : logDirectory ?? path.join(directory, "logs");
    let command = toolsPath;
    if (viaSymlink) {
        command = path.join(directory, "tools");
        fs.symlinkSync(toolsPath, command);
    }
    const result = childProcess.spawnSync(command, [], {
        encoding: "utf8",
        env: {
            ...process.env,
            PATH: binDirectory,
            FAKE_MISE_CALLS: calls,
            FAKE_MISE_FAIL: failOn,
            ...(logs ? { TOOLS_LOG_DIR: logs } : { TOOLS_LOG_DIR: "", XDG_STATE_HOME: stateHome }),
        },
    });
    const callLines = fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [];
    return { result, calls: callLines, logDirectory: logs, directory };
}

function sourceLineOf(text) {
    const lines = fs.readFileSync(toolsPath, "utf8").split("\n");
    return lines.findIndex(line => line.startsWith(text)) + 1;
}

test("tools exits 0, prints no summary and keeps no logs when every step succeeds", t => {
    const { result, logDirectory, calls } = runTools(t, "");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(calls.includes("use -g claude opencode"), "the shared mise-dev-packages list did not run");
    assert.doesNotMatch(result.stderr, /failed/);
    assert.deepStrictEqual(fs.readdirSync(logDirectory), [], "a successful run left its logs behind");
});

test("a successful run keeps other files in a caller-supplied log directory", t => {
    const keep = fs.mkdtempSync(path.join(os.tmpdir(), "ubuntu-tools-keep-"));
    t.after(() => fs.rmSync(keep, { recursive: true, force: true }));
    fs.writeFileSync(path.join(keep, "mine.txt"), "keep me");

    const { result } = runTools(t, "", { logDirectory: keep });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(fs.readdirSync(keep), ["mine.txt"]);
});

test("every failed step is listed when several fail", t => {
    const { result } = runTools(t, "claude|ghq");

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /2 tool step\(s\) failed/);
    for (const step of ["step \"$(dirname", "step mise use -g worktrunk lazydocker ghq"]) {
        const line = sourceLineOf(step);
        assert.match(result.stderr, new RegExp(`tools:${line} {2}\\(exit 3\\)`));
    }
});

test("tools exits 2 when every step fails", t => {
    const { result } = runTools(t, ".");

    assert.strictEqual(result.status, 2);
});

test("tools exits 2 without mise", t => {
    const { result, calls } = runTools(t, "", { withMise: false });

    assert.strictEqual(result.status, 2);
    assert.deepStrictEqual(calls, []);
    assert.match(result.stderr, /mise is not on PATH/);
});

test("an interrupt stops tools and still summarises earlier failures", t => {
    const { result } = runTools(t, "INTERRUPT");

    assert.strictEqual(result.status, 130);
    assert.match(result.stderr, /1 tool step\(s\) failed/);
    assert.match(result.stderr, /mise-dev-packages/);
});

test("an interrupt during the shared list's parallel install stops tools", t => {
    const { result, calls } = runTools(t, "INSTALL_INTERRUPT");

    assert.strictEqual(result.status, 130);
    assert.strictEqual(calls.length, 1, "tools kept going after the interrupt");
});

test("tools finds the shared list when run through a symlink", t => {
    const { result, calls } = runTools(t, "", { viaSymlink: true });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.ok(calls.includes("use -g claude opencode"), "the shared mise-dev-packages list did not run");
});

test("a step killed by a signal other than Ctrl-C is an ordinary failure", t => {
    const { result, calls } = runTools(t, "OOM");

    assert.strictEqual(result.status, 1);
    assert.ok(calls.at(-1).includes("redis"), "tools stopped at the killed step");
    assert.match(result.stderr, /\(exit 137\)/);
});

test("the default log directory is kept on failure, removed on success, and pruned", t => {
    const stateHome = fs.mkdtempSync(path.join(os.tmpdir(), "ubuntu-tools-state-"));
    t.after(() => fs.rmSync(stateHome, { recursive: true, force: true }));
    const parent = path.join(stateHome, "dotfiles-setup/tools");
    fs.mkdirSync(parent, { recursive: true });
    for (let i = 0; i < 6; i++) fs.mkdirSync(path.join(parent, `20000101-00000${i}-old`));

    const failed = runTools(t, "ghq", { stateHome });
    assert.strictEqual(failed.result.status, 1);
    const kept = fs.readdirSync(parent).filter(name => !name.startsWith("20000101"));
    assert.strictEqual(kept.length, 1, "the failed run's logs were not kept");
    assert.match(failed.result.stderr, new RegExp(`full log: ${parent}/${kept[0]}/line-\\d+\\.log`));
    assert.ok(fs.readdirSync(parent).length <= 6, "old log directories were not pruned");

    const before = fs.readdirSync(parent).length;
    const succeeded = runTools(t, "", { stateHome });
    assert.strictEqual(succeeded.result.status, 0, succeeded.result.stderr);
    assert.ok(fs.readdirSync(parent).length <= before, "a successful run left a log directory");
});

for (const [signal, status] of [["INT", 130], ["TERM", 143]]) {
    test(`a real SIG${signal} to tools stops installation and summarises earlier failures`, t => {
        const { result, calls } = runTools(t, `SIGNAL_${signal}`);

        assert.strictEqual(result.status, status, result.stderr);
        assert.match(result.stderr, /1 tool step\(s\) failed/);
        assert.match(result.stderr, /mise-dev-packages/);
        assert.ok(!calls.some(call => call.includes("ghq")), "tools kept going after the signal");
    });
}
