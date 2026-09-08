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

    const pane = path.join(home, "pane.json");
    const tabs = path.join(home, "tabs.json");
    const index = path.join(home, "session_index.jsonl");
    const codexSessions = path.join(home, ".codex", "sessions");
    const generatorCalls = path.join(home, "generator-calls");
    const claudeProjects = path.join(home, ".claude", "projects");

    fs.writeFileSync(pane, JSON.stringify({ result: { pane: options.pane ?? {} } }));
    fs.writeFileSync(tabs, JSON.stringify({ result: { tabs: options.tabs ?? [{
        tab_id: TAB,
        workspace_id: "w1",
        label: options.label ?? "3",
        pane_count: options.panes ?? 1,
        number: options.number ?? 3
    }] } }));
    fs.writeFileSync(index,
        (options.threads ?? []).map((entry) => JSON.stringify(entry)).join("\n"));
    if (options.codexTranscript) {
        fs.mkdirSync(codexSessions, { recursive: true });
        fs.writeFileSync(path.join(codexSessions,
            `rollout-${options.codexThread ?? "thread-1"}.jsonl`),
        options.codexTranscript.map((entry) => JSON.stringify(entry)).join("\n"));
    }
    if (options.claudeTranscript) {
        fs.mkdirSync(claudeProjects, { recursive: true });
        fs.writeFileSync(path.join(claudeProjects,
            `${options.claudeThread ?? "claude-thread"}.jsonl`),
        options.claudeTranscript.map((entry) => JSON.stringify(entry)).join("\n"));
    }

    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
case "$1 $2" in
    "pane get") cat "${pane}" ;;
    "tab get") jq --arg id "$3" '{result: {tab: (.result.tabs[] | select(.tab_id == $id))}}' "${tabs}" ;;
    "tab list") cat "${tabs}" ;;
    "tab rename")
        jq --arg id "$3" --arg label "$4" '(.result.tabs[] | select(.tab_id == $id).label) = $label' "${tabs}" > "${tabs}.tmp"
        mv "${tabs}.tmp" "${tabs}"
        ;;
esac
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);
    fs.writeFileSync(path.join(bin, "claude"), `#!/usr/bin/env bash
printf x >> "${generatorCalls}"
printf '%s\\n' '${options.generated ?? "add default app picker"}'
`);
    fs.chmodSync(path.join(bin, "claude"), 0o755);

    function fire(event) {
        const result = childProcess.spawnSync(path.join(PLUGIN, "bin/tab-namer"), [], {
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                HOME: home,
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_PLUGIN_STATE_DIR: path.join(home, "state"),
                CODEX_SESSION_INDEX: index,
                CODEX_SESSIONS_DIR: codexSessions,
                CLAUDE_PROJECTS_DIR: claudeProjects,
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

    function setTabs(next) {
        fs.writeFileSync(tabs, JSON.stringify({ result: { tabs: next } }));
    }

    function label(tabId = TAB) {
        return JSON.parse(fs.readFileSync(tabs)).result.tabs
            .find((entry) => entry.tab_id === tabId)?.label;
    }

    function calls() {
        return fs.existsSync(generatorCalls) ? fs.readFileSync(generatorCalls, "utf8").length : 0;
    }

    return { fire, setPane, setTabs, label, calls };
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

test("Haiku summarizes the latest Codex thread name", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [
            { id: "thread-1", thread_name: "first prompt text" },
            { id: "thread-2", thread_name: "another session" },
            { id: "thread-1", thread_name: "Add default app picker" }
        ]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");
    assert.strictEqual(herdr.calls(), 1);
});

test("the Codex transcript fills the session-index race", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        codexTranscript: [{
            type: "response_item",
            payload: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: "Fix intermittent tab renaming" }]
            }
        }]
    });

    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");
    assert.strictEqual(herdr.calls(), 1);
});

test("a fresh tab uses Herdr's positional label, not its public tab number", (t) => {
    const herdr = fixture(t, {
        label: "4",
        number: 110,
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Fix session tab titles" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");
});

test("the pane id is found wherever the event nests it", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Nested payload" }]
    });
    herdr.fire({ result: { event: { type: "pane.agent_status_changed", pane: { pane_id: PANE } } } });
    assert.strictEqual(herdr.label(), "1:add default app picker");
});

test("another agent's terminal title is summarized", (t) => {
    const herdr = fixture(t, {
        pane: {
            agent: "claude",
            tab_id: TAB,
            cwd: "/home/dev/project",
            terminal_title_stripped: "Rename tabs after the agent session name"
        }
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");
});

test("Claude's generic terminal title falls back to its latest prompt", (t) => {
    const herdr = fixture(t, {
        label: "4",
        number: 110,
        pane: {
            agent: "claude",
            agent_session: { value: "claude-thread" },
            tab_id: TAB,
            cwd: "/home/dev/project",
            terminal_title_stripped: "Claude Code"
        },
        claudeTranscript: [
            { type: "user", message: { content: "Fix the upload flow" } }
        ]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");
});

test("an explicit issue number is appended without asking Haiku to infer it", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        generated: "fix default app handling",
        threads: [{ id: "thread-1", thread_name: "Fix default apps for issue #151" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:fix default app handling #151");
});

test("the generated summary is cached while the source stays unchanged", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Add default app picker" }]
    });
    herdr.fire();
    herdr.fire();
    assert.strictEqual(herdr.calls(), 1);
});

test("a malformed model answer falls back to a three-word summary", (t) => {
    const herdr = fixture(t, {
        pane: codexPane(),
        generated: "Auth",
        threads: [{ id: "thread-1", thread_name: "Fix auth" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:Fix auth task");
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
        label: "4",
        number: 110,
        pane: codexPane(),
        threads: [{ id: "thread-1", thread_name: "Add default app picker" }]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:add default app picker");

    // pane.exited: the pane is still there, the agent is not.
    herdr.setPane({ tab_id: TAB, cwd: "/home/dev/project" });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1");
});

test("closing a tab renumbers every remaining plugin-owned label", (t) => {
    const secondTab = "w1:t2W";
    const firstPane = codexPane({ agent_session: { value: "thread-1" } });
    const secondPane = codexPane({
        agent_session: { value: "thread-2" },
        tab_id: secondTab
    });
    const herdr = fixture(t, {
        pane: firstPane,
        tabs: [
            { tab_id: TAB, workspace_id: "w1", label: "1", pane_count: 1, number: 80 },
            { tab_id: secondTab, workspace_id: "w1", label: "2", pane_count: 1, number: 97 }
        ],
        threads: [
            { id: "thread-1", thread_name: "First task source" },
            { id: "thread-2", thread_name: "Second task source" }
        ]
    });

    herdr.fire();
    herdr.setPane(secondPane);
    herdr.fire();
    assert.strictEqual(herdr.label(secondTab), "2:add default app picker");

    herdr.setTabs([
        { tab_id: secondTab, workspace_id: "w1", label: herdr.label(secondTab), pane_count: 1, number: 97 }
    ]);
    herdr.fire({ data: { type: "tab_closed", tab_id: TAB, workspace_id: "w1" } });
    assert.strictEqual(herdr.label(secondTab), "1:add default app picker");
});
