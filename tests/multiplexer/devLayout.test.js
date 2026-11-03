const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-herdr-layout");

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-layout-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    const calls = path.join(root, "calls");
    const counter = path.join(root, "counter");
    fs.mkdirSync(bin);
    fs.writeFileSync(counter, "1");
    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "${calls}"
if [[ $1 == pane && $2 == split ]]; then
  n=$(<"${counter}"); printf '%s' "$((n + 1))" > "${counter}"
  printf '{"result":{"pane":{"pane_id":"w1:p%s"}}}\n' "$n"
elif [[ $1 == tab && $2 == create ]]; then
  printf '{"result":{"root_pane":{"pane_id":"w1:p9"}}}\n'
fi
`);
    fs.writeFileSync(path.join(bin, "editor"), `#!/usr/bin/env bash
printf 'editor %s\n' "$*" >> "${calls}"
`);
    fs.writeFileSync(path.join(bin, "worker"), `#!/usr/bin/env bash
printf 'worker %s\n' "$*" >> "${calls}"
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);
    fs.chmodSync(path.join(bin, "editor"), 0o755);
    fs.chmodSync(path.join(bin, "worker"), 0o755);

    function run(args, cwd = root) {
        return childProcess.spawnSync(SCRIPT, args, {
            cwd,
            env: {
                ...process.env,
                PATH: `${bin}:/usr/bin:/bin`,
                EDITOR: path.join(bin, "editor"),
                HERDR_ENV: "1",
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_WORKSPACE_ID: "w1",
                HERDR_TAB_ID: "w1:t1",
                HERDR_PANE_ID: "w1:p0"
            },
            encoding: "utf8"
        });
    }

    return { run, calls: () => fs.readFileSync(calls, "utf8").trim().split("\n"), root };
}

test("dev layout creates terminal and agent panes before opening the editor", (t) => {
    const herdr = fixture(t);
    const result = herdr.run(["dev", "codex", "--quiet"]);
    assert.strictEqual(result.status, 0, result.stderr);
    const calls = herdr.calls();
    assert.ok(calls.some((call) => call.match(/pane split w1:p0 --direction down --ratio 0\.85/)));
    assert.ok(calls.some((call) => call.match(/pane split w1:p0 --direction right --ratio 0\.70/)));
    assert.ok(calls.some((call) => call.includes("pane run w1:p2 codex --quiet")));
    assert.strictEqual(calls.at(-1), "editor .");
});

test("the command refuses to control Herdr from an unmanaged shell", () => {
    const result = childProcess.spawnSync(SCRIPT, ["dev"], {
        env: { ...process.env, HERDR_ENV: "", HERDR_PANE_ID: "", HERDR_TAB_ID: "" },
        encoding: "utf8"
    });
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /must run inside a Herdr pane/);
});

test("square layout starts the diff watcher and selected agent", (t) => {
    const herdr = fixture(t);
    const result = herdr.run(["square", "codex"]);
    assert.strictEqual(result.status, 0, result.stderr);
    const calls = herdr.calls();
    assert.ok(calls.some((call) => call.includes("pane run w1:p2 hunk diff --watch")));
    assert.ok(calls.some((call) => call.includes("pane run w1:p3 codex")));
});

test("projects creates a safely addressed tab for every child directory", (t) => {
    const herdr = fixture(t);
    const work = path.join(herdr.root, "work");
    fs.mkdirSync(path.join(work, "first project"), { recursive: true });
    fs.mkdirSync(path.join(work, "second"));
    const result = herdr.run(["projects", "codex", "--quiet"], work);
    assert.strictEqual(result.status, 0, result.stderr);
    const calls = herdr.calls();
    assert.strictEqual(calls.filter((call) => call.startsWith("tab create ")).length, 2);
    assert.strictEqual(calls.filter((call) => call.startsWith("pane run w1:p9 ")).length, 2);
    assert.ok(calls.some((call) => call.includes("--cwd /tmp/") && call.includes("first project")));
});

test("swarm fills the requested pane count and runs the command in the caller", (t) => {
    const herdr = fixture(t);
    const result = herdr.run(["swarm", "3", "worker", "test"]);
    assert.strictEqual(result.status, 0, result.stderr);
    const calls = herdr.calls();
    assert.strictEqual(calls.filter((call) => call.startsWith("pane split ")).length, 2);
    assert.strictEqual(calls.filter((call) => call.match(/^pane run .* worker test/)).length, 2);
    assert.strictEqual(calls.at(-1), "worker test");
});
