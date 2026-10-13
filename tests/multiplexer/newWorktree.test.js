const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "../../bin/df-herdr-new-worktree");

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-worktree-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, "project with spaces");
    const calls = path.join(root, "calls");
    const herdr = path.join(root, "herdr");
    const env = {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        HERDR_BIN_PATH: herdr,
        WORKTREE_TEST_CALLS: calls
    };

    function git(args, cwd = repo) {
        return childProcess.execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    }

    fs.mkdirSync(repo);
    git(["init", "-b", "main"]);
    git(["-c", "user.name=Test", "-c", "user.email=test@example.com",
        "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "initial"]);
    fs.writeFileSync(herdr, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "$WORKTREE_TEST_CALLS"
[[ $1 == worktree && $2 == create ]]
shift 2
while (( $# )); do
    case "$1" in
        --cwd) cwd=$2; shift 2 ;;
        --branch) branch=$2; shift 2 ;;
        --path) destination=$2; shift 2 ;;
        --focus) shift ;;
        *) exit 2 ;;
    esac
done
if git -C "$cwd" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$cwd" worktree add "$destination" "$branch"
else
    git -C "$cwd" worktree add -b "$branch" "$destination"
fi
`, { mode: 0o755 });

    function run(branch, cwd = repo) {
        return childProcess.spawnSync(SCRIPT, [], {
            cwd: root,
            env: { ...env, HERDR_ACTIVE_PANE_CWD: cwd },
            input: `${branch}\n`,
            encoding: "utf8"
        });
    }

    return { root, repo, calls, git, run };
}

test("creates a sibling checkout from the active pane's nested directory", (t) => {
    const f = fixture(t);
    const nested = path.join(f.repo, "src");
    fs.mkdirSync(nested);
    const branch = "feature/login'$";
    const result = f.run(branch, nested);
    assert.equal(result.status, 0, result.stderr);
    const destination = `${f.repo}.feature-login'$`;
    assert.equal(f.git(["branch", "--show-current"], destination).trim(), branch);
    assert.deepEqual(fs.readFileSync(f.calls, "utf8").split("\0").slice(0, -1), [
        "worktree", "create", "--cwd", nested, "--branch", branch,
        "--path", destination, "--focus"
    ]);
});

test("creation from a linked checkout stays beside the primary project", (t) => {
    const f = fixture(t);
    const linked = `${f.repo}.first`;
    f.git(["worktree", "add", "-b", "first", linked]);
    f.git(["branch", "existing"]);
    const result = f.run("existing", linked);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.git(["branch", "--show-current"], `${f.repo}.existing`).trim(), "existing");
    assert.equal(fs.existsSync(`${linked}.existing`), false);
});

test("previous-branch shorthand resolves to the real branch name", (t) => {
    const f = fixture(t);
    f.git(["switch", "-c", "earlier"]);
    f.git(["switch", "main"]);
    const result = f.run("@{-1}");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.git(["branch", "--show-current"], `${f.repo}.earlier`).trim(), "earlier");
});

test("bare repositories fail before invoking Herdr", (t) => {
    const f = fixture(t);
    const bare = `${f.repo}.git`;
    f.git(["clone", "--bare", f.repo, bare]);
    const linked = path.join(f.root, "linked");
    f.git(["worktree", "add", "-b", "linked", linked], bare);
    const result = f.run("other", linked);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bare repositories are not supported/);
    assert.equal(fs.existsSync(f.calls), false);
});

test("invalid branch names fail before invoking Herdr", (t) => {
    const f = fixture(t);
    const result = f.run("../escape");
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(f.calls), false);
});

test("empty input cancels without invoking Herdr", (t) => {
    const f = fixture(t);
    assert.equal(f.run("").status, 0);
    assert.equal(fs.existsSync(f.calls), false);
});
