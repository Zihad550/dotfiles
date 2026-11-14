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
const THREAD = "claude-thread";

const workStart = (args) => ({
    type: "user",
    message: {
        content: `<command-message>work-start</command-message>\n<command-name>/work-start</command-name>\n<command-args>${args}</command-args>`
    }
});
const prompt = (content) => ({ type: "user", message: { content } });

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "tab-namer-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    fs.mkdirSync(bin, { recursive: true });

    const pane = path.join(home, "pane.json");
    const tabs = path.join(home, "tabs.json");
    const claudeProjects = path.join(home, ".claude", "projects");
    const transcript = path.join(claudeProjects, "-home-dev-project", `${THREAD}.jsonl`);
    const checkout = path.join(home, "project");

    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    fs.writeFileSync(transcript,
        (options.transcript ?? []).map((entry) => JSON.stringify(entry)).join("\n"));

    fs.mkdirSync(checkout);
    childProcess.execFileSync("git", ["init", "-q", "-b", options.branch ?? "main", checkout]);

    const claudePane = {
        agent: "claude",
        agent_session: { value: THREAD },
        tab_id: TAB,
        workspace_id: "w1",
        cwd: checkout
    };

    function setPane(next) {
        fs.writeFileSync(pane, JSON.stringify({ result: { pane: next } }));
    }

    function setTabs(next) {
        fs.writeFileSync(tabs, JSON.stringify({ result: { tabs: next } }));
    }

    setPane({ ...claudePane, ...options.pane });
    setTabs(options.tabs ?? [{
        tab_id: TAB,
        workspace_id: "w1",
        label: options.label ?? "3",
        pane_count: options.panes ?? 1,
        number: options.number ?? 3
    }]);

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

    function fire(event) {
        const result = childProcess.spawnSync(path.join(PLUGIN, "bin/tab-namer"), [], {
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                HOME: home,
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_PLUGIN_STATE_DIR: path.join(home, "state"),
                CLAUDE_PROJECTS_DIR: claudeProjects,
                HERDR_PLUGIN_EVENT_JSON: JSON.stringify(event ?? { data: { pane: { pane_id: PANE } } })
            },
            encoding: "utf8"
        });
        assert.strictEqual(result.status, 0, result.stderr);
        return result;
    }

    function append(entry) {
        fs.appendFileSync(transcript, "\n" + JSON.stringify(entry));
    }

    function label(tabId = TAB) {
        return JSON.parse(fs.readFileSync(tabs)).result.tabs
            .find((entry) => entry.tab_id === tabId)?.label;
    }

    return { home, fire, append, setPane, setTabs, label, claudePane };
}

test("/work-start <issue> names the tab after the issue", (t) => {
    const herdr = fixture(t, { transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:working #151");
});

test("/work-start pr <pr> takes the issue from the jd- branch", (t) => {
    const herdr = fixture(t, { branch: "jd-151-default-apps", transcript: [workStart("pr 981")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:fixing requested changes #151 !981");
});

test("a PR URL counts as a PR", (t) => {
    const herdr = fixture(t, {
        branch: "jd-151/default-apps",
        transcript: [workStart("https://example.com/org/repo/pulls/981")]
    });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:fixing requested changes #151 !981");
});

test("a PR branch without an issue leaves the issue out", (t) => {
    const herdr = fixture(t, { branch: "feat-tiktok", transcript: [workStart("pr 939 conflicts")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:fixing requested changes !939");
});

test("a session without /work-start keeps Herdr's label", (t) => {
    const herdr = fixture(t, { transcript: [prompt("Fix the upload flow for issue #12")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});

test("/work-start without a number keeps Herdr's label", (t) => {
    const herdr = fixture(t, { transcript: [workStart("")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});

test("the latest /work-start wins", (t) => {
    const herdr = fixture(t, { branch: "jd-151-x", transcript: [workStart("151")] });
    herdr.fire();
    herdr.append(prompt("now the review comments"));
    herdr.append(workStart("pr 981"));
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:fixing requested changes #151 !981");
});

test("a non-Claude agent is left alone", (t) => {
    const herdr = fixture(t, { pane: { agent: "codex" }, transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});

test("the pane id is found wherever the event nests it", (t) => {
    const herdr = fixture(t, { transcript: [workStart("151")] });
    herdr.fire({ result: { event: { type: "pane.agent_status_changed", pane: { pane_id: PANE } } } });
    assert.strictEqual(herdr.label(), "1:working #151");
});

test("a shared tab is left alone", (t) => {
    const herdr = fixture(t, { panes: 2, transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "3");
});

test("a hand-typed label is never taken over", (t) => {
    const herdr = fixture(t, { label: "mine", transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "mine");
});

test("its own label is reclaimed, and handed back when the agent goes", (t) => {
    const herdr = fixture(t, { label: "4", number: 110, transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:working #151");

    // pane.exited: the pane is still there, the agent is not.
    herdr.setPane({ tab_id: TAB, workspace_id: "w1", cwd: herdr.claudePane.cwd });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1");
});

test("a later session without /work-start hands the label back", (t) => {
    const herdr = fixture(t, { transcript: [workStart("151")] });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1:working #151");

    herdr.setPane({ ...herdr.claudePane, agent_session: { value: "new-thread" } });
    herdr.fire();
    assert.strictEqual(herdr.label(), "1");
    herdr.fire({ data: { type: "tab_moved", tab_id: TAB, workspace_id: "w1" } });
    assert.strictEqual(herdr.label(), "1");
});

test("a summary cached by the old LLM namer is not reapplied", (t) => {
    const herdr = fixture(t, { label: "1" });
    const state = path.join(herdr.home, "state");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, TAB.replace(/[^A-Za-z0-9]/g, "-") + ".summary"),
        "add default app picker");
    herdr.fire({ data: { type: "tab_moved", tab_id: TAB, workspace_id: "w1" } });
    assert.strictEqual(herdr.label(), "1");
});

test("closing a tab renumbers every remaining plugin-owned label", (t) => {
    const secondTab = "w1:t2W";
    const herdr = fixture(t, {
        tabs: [
            { tab_id: TAB, workspace_id: "w1", label: "1", pane_count: 1, number: 80 },
            { tab_id: secondTab, workspace_id: "w1", label: "2", pane_count: 1, number: 97 }
        ],
        transcript: [workStart("151")]
    });

    herdr.setPane({ ...herdr.claudePane, tab_id: secondTab });
    herdr.fire();
    assert.strictEqual(herdr.label(secondTab), "2:working #151");

    herdr.setTabs([
        { tab_id: secondTab, workspace_id: "w1", label: herdr.label(secondTab), pane_count: 1, number: 97 }
    ]);
    herdr.fire({ data: { type: "tab_closed", tab_id: TAB, workspace_id: "w1" } });
    assert.strictEqual(herdr.label(secondTab), "1:working #151");
});
