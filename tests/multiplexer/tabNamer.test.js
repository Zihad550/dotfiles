// The tab-namer Herdr plugin, driven as the executable Herdr actually invokes:
// one event payload in, at most one `herdr tab rename` out.
//
//     node --test tests/multiplexer/tabNamer.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const PLUGIN = path.join(ROOT, "herdr-plugins/tab-namer");

const PANE = "w1:p4F";
const TAB = "w1:t2V";

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "tab-namer-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    fs.mkdirSync(bin, { recursive: true });

    const label = path.join(home, "label");
    const pane = path.join(home, "pane.json");
    const tab = path.join(home, "tab.json");
    const index = path.join(home, "session_index.jsonl");

    fs.writeFileSync(label, options.label ?? "3");
    fs.writeFileSync(pane, JSON.stringify({ result: { pane: options.pane ?? {} } }));
    fs.writeFileSync(tab, JSON.stringify({
        result: { tab: { pane_count: options.panes ?? 1, number: 3 } }
    }));
    fs.writeFileSync(index,
        (options.threads ?? []).map((entry) => JSON.stringify(entry)).join("\n"));

    // The tab's label is the one piece of state a rename has to move, so it
    // lives in a file the fake reads back rather than in the fixture JSON.
    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
case "$1 $2" in
    "pane get") cat "${pane}" ;;
    "tab get") jq --arg label "$(cat "${label}")" '.result.tab.label = $label' "${tab}" ;;
    "tab rename") printf '%s' "$4" > "${label}" ;;
esac
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);

    function fire(event) {
        const result = childProcess.spawnSync(path.join(PLUGIN, "bin/tab-namer"), [], {
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                HOME: home,
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_PLUGIN_STATE_DIR: path.join(home, "state"),
                CODEX_SESSION_INDEX: index,
                HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event ?? { data: { pane: { pane_id: PANE } } })
            },
            encoding: "utf8"
        });
        assert.strictEqual(result.status, 0, result.stderr);
        return result;
    }

    function setPane(next) {
        fs.writeFileSync(pane, JSON.stringify({ result: { pane: next } }));
    }

    return { fire, setPane, label: () => fs.readFileSync(label, "utf8") };
}

const codexPane = (overrides = {}) => ({
    agent: "codex",
    agent_session: { value: "thread-1" },
    tab_id: TAB,
    cwd: "/home/dev/project",
    terminal_title_stripped: "project",
    ...overrides
});

test("setup links the plugin, so a fresh machine gets it", () => {
    const setup = fs.readFileSync(path.join(ROOT, "setup/common/setup-herdr"), "utf8");

    assert.match(setup, /herdr plugin link "\$DOTFILES_DIR\/herdr-plugins\/tab-namer"/,
        "nothing links the plugin, so herdr never runs it");
});

test("a codex tab takes the thread name, and the last entry for it wins", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [
            { id: "thread-1", thread_name: "first prompt text" },
            { id: "thread-2", thread_name: "another session" },
            { id: "thread-1", thread_name: "Add default app picker" }
        ]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "Add default app picker");
});

test("the pane id is found wherever the event nests it", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Nested payload" }]
    });
    herdr.fire({ result: { event: { type: "pane.agent_status_changed", pane: { pane_id: PANE } } } });
    assert.strictEqual(herdr.label(), "Nested payload");
});

test("another agent's terminal title is used, cut at a word", (t) => {
    const herdr = fixture(t, {
        pane: {
            agent: "claude",
            tab_id: TAB,
            cwd: "/home/dev/project",
            terminal_title_stripped: "Rename tabs after the agent session name"
        }
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "Rename tabs after the agent");
});

test("a title that says nothing the tab does not already show is ignored", (t) => {
    for (const title of ["codex", "project", "019f8e03-5bbd-70a1-9017-b2216a66bf4c"]) {
        const herdr = fixture(t, { pane: codexPane({ terminal_title_stripped: title }) });
        herdr.fire();
        assert.strictEqual(herdr.label(), "3", `"${title}" was used as a label`);
    }
});

test("a shared tab is left alone", (t) => {
    const herdr = fixture(t, {
        panes: 2,
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Add default app picker" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});

test("a hand-typed label is never taken over", (t) => {
    const herdr = fixture(t, {
        label: "mine",
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Add default app picker" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "mine");
});

test("its own label is reclaimed, and handed back when the agent goes", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Add default app picker" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "Add default app picker");

    // pane.exited: the pane is still there, the agent is not.
    herdr.setPane({ tab_id: TAB, cwd: "/home/dev/project" });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});
