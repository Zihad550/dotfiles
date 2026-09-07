const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-herdr-close-tab");

function fixture(t, tabs) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-close-tab-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    const state = path.join(home, "tabs.json");
    const calls = path.join(home, "calls");
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(state, JSON.stringify({ result: { tabs } }));

    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
    "tab list")
        cat "${state}"
        ;;
    "tab create")
        printf '%s\\n' "$*" >> "${calls}"
        jq '.result.tabs += [{tab_id: "w1:t-new", workspace_id: "w1", label: "empty", pane_count: 1, number: 999}]' "${state}" > "${state}.tmp"
        mv "${state}.tmp" "${state}"
        ;;
    "tab close")
        printf '%s\\n' "$*" >> "${calls}"
        jq --arg tab_id "$3" '.result.tabs |= map(select(.tab_id != $tab_id))' "${state}" > "${state}.tmp"
        mv "${state}.tmp" "${state}"
        ;;
esac
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);

    function run() {
        return childProcess.spawnSync(SCRIPT, [], {
            env: {
                PATH: `${bin}:/usr/bin:/bin`,
                HOME: home,
                HERDR_BIN_PATH: path.join(bin, "herdr"),
                HERDR_ACTIVE_WORKSPACE_ID: "w1",
                HERDR_ACTIVE_TAB_ID: "w1:t1",
                HERDR_ACTIVE_PANE_CWD: "/work/project"
            },
            encoding: "utf8"
        });
    }

    function currentTabs() {
        return JSON.parse(fs.readFileSync(state, "utf8")).result.tabs;
    }

    function commandCalls() {
        return fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [];
    }

    return { run, currentTabs, commandCalls };
}

test("replaces the last tab before closing it", (t) => {
    const herdr = fixture(t, [{
        tab_id: "w1:t1",
        workspace_id: "w1",
        label: "work",
        pane_count: 1,
        number: 1
    }]);

    const result = herdr.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(herdr.commandCalls(), [
        "tab create --workspace w1 --cwd /work/project --label empty --no-focus",
        "tab close w1:t1"
    ]);
    assert.deepStrictEqual(herdr.currentTabs().map((tab) => tab.tab_id), ["w1:t-new"]);
});

test("closes normally when another tab remains", (t) => {
    const herdr = fixture(t, [
        { tab_id: "w1:t1", workspace_id: "w1", label: "work", pane_count: 1, number: 1 },
        { tab_id: "w1:t2", workspace_id: "w1", label: "other", pane_count: 1, number: 2 }
    ]);

    const result = herdr.run();

    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(herdr.commandCalls(), ["tab close w1:t1"]);
    assert.deepStrictEqual(herdr.currentTabs().map((tab) => tab.tab_id), ["w1:t2"]);
});
