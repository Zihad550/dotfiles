// The herdr tab-rename hook, driven as zsh rather than grepped as text: its
// whole job is deciding who owns a tab label, and only running it shows that.
// The one exception is that .zshrc loads it at all, which no run can prove.
//
//     node --test tests/multiplexer/tabRename.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const HOOK = path.join(ROOT, "zsh/.config/zsh/herdr-rename.zsh");

const TAB = "w1:t2V";
const PANE = "w1:p4F";

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-rename-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    const project = path.join(home, "project");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(path.join(home, ".codex"), { recursive: true });

    const label = path.join(home, "label");
    const pane = path.join(home, "pane.json");
    fs.writeFileSync(label, options.label ?? "1:project");
    fs.writeFileSync(pane, JSON.stringify({ result: { pane: options.pane ?? {} } }));
    fs.writeFileSync(path.join(home, ".codex/session_index.jsonl"),
        (options.threads ?? []).map((entry) => JSON.stringify(entry)).join("\n"));

    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
case "$1 $2" in
    "pane current") cat "${pane}" ;;
    "tab list") jq -n --arg label "$(cat "${label}")" \
        '{result: {tabs: [{tab_id: "${TAB}", label: $label}]}}' ;;
    "tab rename") printf '%s' "$4" > "${label}" ;;
esac
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);

    function run(script) {
        const result = childProcess.spawnSync("zsh", ["-c", `source ${HOOK}\n${script}`], {
            cwd: project,
            env: {
                ...process.env,
                HOME: home,
                XDG_RUNTIME_DIR: home,
                PATH: `${bin}:/usr/bin:/bin`,
                HERDR_ENV: "1",
                HERDR_TAB_ID: TAB,
                HERDR_PANE_ID: PANE
            },
            encoding: "utf8"
        });
        assert.strictEqual(result.status, 0, result.stderr);
        return result.stdout.trim();
    }

    return { run, label: () => fs.readFileSync(label, "utf8") };
}

test("the hook is loaded, and only where herdr exists", () => {
    const zshrc = fs.readFileSync(path.join(ROOT, "zsh/.config/zsh/.zshrc"), "utf8");

    assert.match(zshrc,
        /if command -v herdr >\/dev\/null 2>&1; then source "\$XDG_CONFIG_HOME\/zsh\/herdr-rename\.zsh"; fi/,
        "the tab-rename hook is never sourced, so none of it runs");
});

test("a plain command labels the tab the tmux way", (t) => {
    const herdr = fixture(t);
    herdr.run(`_herdr_rename_tab "ls -la"`);
    assert.strictEqual(herdr.label(), "1:project (ls)");
});

test("a codex pane is labelled with the thread name, not the directory", (t) => {
    const herdr = fixture(t, {
        pane: {
            agent: "codex",
            agent_session: { value: "thread-1" },
            cwd: "/home/dev/project",
            terminal_title_stripped: "project"
        },
        // Appended to on every rename, so the last entry for a thread wins.
        threads: [
            { id: "thread-1", thread_name: "first prompt text" },
            { id: "thread-2", thread_name: "another session" },
            { id: "thread-1", thread_name: "Add default app picker" }
        ]
    });
    assert.strictEqual(herdr.run('print -r -- "$(_herdr_agent_label)"'), "Add default app picker");
});

test("an agent with nothing better than the directory is ignored", (t) => {
    const herdr = fixture(t, {
        pane: {
            agent: "codex",
            agent_session: { value: "unknown-thread" },
            cwd: "/home/dev/project",
            terminal_title_stripped: "project"
        }
    });
    assert.strictEqual(herdr.run('print -r -- "$(_herdr_agent_label)"'), "");
});

test("other agents are labelled from their terminal title, cut at a word", (t) => {
    const herdr = fixture(t, {
        pane: { agent: "claude", cwd: "/home/dev/project", terminal_title_stripped: "Rename tabs after the codex session" }
    });
    assert.strictEqual(herdr.run('print -r -- "$(_herdr_agent_label)"'), "Rename tabs after the");
});

test("the shell reclaims a tab the agent named, but not one renamed by hand", (t) => {
    const herdr = fixture(t);
    herdr.run(`_herdr_apply_tab_label "Add default app picker"`);
    assert.strictEqual(herdr.label(), "1:Add default app picker");

    herdr.run("_herdr_apply_tab_label project");
    assert.strictEqual(herdr.label(), "1:project");
});

test("a hand-renamed tab keeps its name and still gets renumbered", (t) => {
    const herdr = fixture(t, { label: "3:mine" });
    herdr.run(`_herdr_apply_tab_label project; herdr tab rename "$HERDR_TAB_ID" "3:mine"; _herdr_apply_tab_label project`);
    assert.strictEqual(herdr.label(), "1:mine");
});

test("only agent commands get a watcher", (t) => {
    const herdr = fixture(t);
    const watched = (command) => herdr.run(
        `_herdr_rename_tab ${command}; print -r -- "${'${_herdr_watch_pid:-none}'}"; kill $_herdr_watch_pid 2>/dev/null; true`
    );
    assert.strictEqual(watched(`"ls -la"`), "none");
    assert.notStrictEqual(watched(`"/usr/bin/codex resume"`), "none");
});
