const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "herdr-plugins/sidebar-index/bin/sidebar-index");

function fixture(t, workspaces) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sidebar-index-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const state = path.join(dir, "workspaces.json");
    const calls = path.join(dir, "calls.jsonl");
    const herdr = path.join(dir, "herdr");
    fs.writeFileSync(state, JSON.stringify({ result: { workspaces } }));
    fs.writeFileSync(herdr, `#!/usr/bin/env bash
case "$1 $2" in
    "workspace list") cat '${state}' ;;
    "agent list") printf '%s\\n' '{"result":{"agents":[]}}' ;;
    "pane list") printf '%s\\n' '{"result":{"panes":[]}}' ;;
    "workspace report-metadata")
        printf '%s\\n' "$@" | jq -Rsc 'split("\\n")[:-1]' >> '${calls}' ;;
    *) exit 1 ;;
esac
`);
    fs.chmodSync(herdr, 0o755);
    return {
        run(...args) {
            const result = childProcess.spawnSync(SCRIPT, args, {
                env: { ...process.env, HERDR_BIN_PATH: herdr,
                    HERDR_PLUGIN_STATE_DIR: path.join(dir, "state") },
                encoding: "utf8"
            });
            assert.equal(result.status, 0, result.stderr);
            return fs.existsSync(calls)
                ? fs.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse) : [];
        }
    };
}

const workspace = (id, number, worktree = null, tokens = {}) => ({
    workspace_id: id, number, worktree, tokens
});
const membership = (repo_key, is_linked_worktree) => ({ repo_key, is_linked_worktree });
const grouped = () => [
    workspace("dotfiles", 1),
    workspace("backend", 2),
    workspace("frontend", 3, membership("frontend-repo", false)),
    workspace("skills", 4),
    workspace("fix", 5, membership("frontend-repo", true)),
    workspace("share", 6, membership("frontend-repo", true)),
    workspace("approve", 7, membership("frontend-repo", true))
];

test("workspace indices follow the grouped sidebar shortcut order", (t) => {
    const calls = fixture(t, grouped()).run();
    const indices = Object.fromEntries(calls.map((args) => [args[2], args.at(-1)]));
    assert.deepEqual(indices, {
        dotfiles: "space_index=1", backend: "space_index=2", frontend: "space_index=3",
        fix: "space_index=4", share: "space_index=5", approve: "space_index=6",
        skills: "space_index=7"
    });
});

test("a group starts at its first member even when its main checkout comes later", (t) => {
    const calls = fixture(t, [
        workspace("child", 80, membership("repo", true)),
        workspace("other", 91),
        workspace("main", 104, membership("repo", false))
    ]).run();
    assert.deepEqual(calls.map((args) => [args[2], args.at(-1)]), [
        ["main", "space_index=1"], ["child", "space_index=2"], ["other", "space_index=3"]
    ]);
});

test("linked worktrees without a main checkout keep their list order", (t) => {
    const calls = fixture(t, [
        workspace("child-a", 12, membership("repo", true)),
        workspace("other", 25),
        workspace("child-b", 39, membership("repo", true))
    ]).run();
    assert.deepEqual(calls.map((args) => [args[2], args.at(-1)]), [
        ["child-a", "space_index=1"], ["other", "space_index=2"], ["child-b", "space_index=3"]
    ]);
});

test("different repositories form separate groups", (t) => {
    const calls = fixture(t, [
        workspace("main-a", 1, membership("a", false)),
        workspace("main-b", 2, membership("b", false)),
        workspace("child-b", 3, membership("b", true)),
        workspace("child-a", 4, membership("a", true))
    ]).run();
    assert.deepEqual(calls.map((args) => [args[2], args.at(-1)]), [
        ["main-a", "space_index=1"], ["child-a", "space_index=2"],
        ["main-b", "space_index=3"], ["child-b", "space_index=4"]
    ]);
});

test("an unchanged index is left alone and stale indices beyond nine are cleared", (t) => {
    const workspaces = Array.from({ length: 10 }, (_, index) =>
        workspace(`w${index + 1}`, index + 20, null, { space_index: String(index + 1) }));
    const calls = fixture(t, workspaces).run();
    assert.deepEqual(calls, [["workspace", "report-metadata", "w10",
        "--source", "plugin:dotfiles.sidebar-index", "--clear-token", "space_index"]]);
});

test("clear removes indices from every workspace, including linked children", (t) => {
    const calls = fixture(t, grouped()).run("clear");
    assert.deepEqual(calls.map((args) => args[2]), grouped().map((entry) => entry.workspace_id));
    assert.ok(calls.every((args) => args.at(-1) === "space_index"));
});
