//     node --test tests/dotfiles/workBranchNameGen.test.js

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-work-branch-name-gen");

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "work-branch-name-gen-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    fs.mkdirSync(bin);

    const zshCalls = path.join(home, "zsh-calls");
    const claudeArgs = path.join(home, "claude-args");
    const claudePrompt = path.join(home, "claude-prompt");
    const claudeThinking = path.join(home, "claude-thinking");
    const clipboard = path.join(home, "clipboard");
    const primarySelection = path.join(home, "primary-selection");
    const notification = path.join(home, "notification");
    const herdrNotification = path.join(home, "herdr-notification");

    fs.writeFileSync(path.join(bin, "zsh"), `#!/usr/bin/env bash
printf '%s\\n' "$2" >> "${zshCalls}"
issue=\${2#ti }
[[ \$issue != "\${FAIL_ISSUE:-}" ]] || exit 1
printf 'Issue %s\\nTitle: outcome for issue %s\\n' "\$issue" "\$issue"
`);
    fs.chmodSync(path.join(bin, "zsh"), 0o755);

    fs.writeFileSync(path.join(bin, "claude"), `#!/usr/bin/env bash
printf '%s\\n' "$@" > "${claudeArgs}"
printf '%s' "\${MAX_THINKING_TOKENS:-}" > "${claudeThinking}"
prompt=\$(/bin/cat)
printf '%s' "\$prompt" > "${claudePrompt}"
printf '%s\\n' "\${CLAUDE_OUTPUT:-}"
`);
    fs.chmodSync(path.join(bin, "claude"), 0o755);

    fs.writeFileSync(path.join(bin, "wl-copy"), `#!/usr/bin/env bash
if [[ \${1:-} == --primary ]]; then
    /bin/cat > "${primarySelection}"
else
    /bin/cat > "${clipboard}"
fi
`);
    fs.chmodSync(path.join(bin, "wl-copy"), 0o755);

    fs.writeFileSync(path.join(bin, "notify-send"), `#!/usr/bin/env bash
printf '%s\\n' "$@" > "${notification}"
`);
    fs.chmodSync(path.join(bin, "notify-send"), 0o755);

    fs.writeFileSync(path.join(bin, "herdr"), `#!/usr/bin/env bash
printf '%s\\n' "$@" > "${herdrNotification}"
`);
    fs.chmodSync(path.join(bin, "herdr"), 0o755);

    function run(...args) {
        return childProcess.spawnSync(SCRIPT, args, {
            env: {
                ...process.env,
                PATH: `${bin}:/usr/bin:/bin`,
                CLAUDE_OUTPUT: options.output ?? "jd-230/fix-payment-timeout",
                FAIL_ISSUE: options.failIssue ?? "",
                DF_WORK_BRANCH_MODEL: options.model ?? "",
                HERDR_ENV: options.herdr ? "1" : "",
                HERDR_BIN_PATH: options.herdr ? path.join(bin, "herdr") : "",
            },
            encoding: "utf8",
        });
    }

    return {
        run,
        zshCalls,
        claudeArgs,
        claudePrompt,
        claudeThinking,
        clipboard,
        primarySelection,
        notification,
        herdrNotification,
    };
}

test("fetches ordered issues and asks Claude Sonnet for one shared branch name", t => {
    const harness = fixture(t, {
        output: "jd-230_231_245/fix-shared-payment-timeout",
    });

    const result = harness.run("230,231", "245");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout, "jd-230_231_245/fix-shared-payment-timeout\n");
    assert.strictEqual(fs.readFileSync(harness.clipboard, "utf8"),
        "jd-230_231_245/fix-shared-payment-timeout");
    assert.strictEqual(fs.readFileSync(harness.primarySelection, "utf8"),
        "jd-230_231_245/fix-shared-payment-timeout");
    assert.strictEqual(fs.readFileSync(harness.notification, "utf8"),
        "Branch copied\njd-230_231_245/fix-shared-payment-timeout copied to clipboard\n");
    assert.strictEqual(fs.existsSync(harness.herdrNotification), false);
    assert.deepStrictEqual(fs.readFileSync(harness.zshCalls, "utf8").trim().split("\n"),
        ["ti 230", "ti 231", "ti 245"]);

    const claudeArgs = fs.readFileSync(harness.claudeArgs, "utf8").trim().split("\n");
    assert.ok(claudeArgs.includes("--model=sonnet"));
    assert.ok(claudeArgs.includes("--no-session-persistence"));
    assert.ok(claudeArgs.includes("--tools="));
    assert.ok(claudeArgs.includes("--safe-mode"));
    assert.strictEqual(fs.readFileSync(harness.claudeThinking, "utf8"), "0");

    const prompt = fs.readFileSync(harness.claudePrompt, "utf8");
    assert.match(prompt, /must start with: jd-230_231_245\//);
    assert.match(prompt, /Return exactly one non-empty line containing only the branch name/);
    assert.ok(prompt.indexOf('<issue number="230">') < prompt.indexOf('<issue number="245">'));
});

test("rejects non-decimal input before invoking another command", t => {
    const harness = fixture(t);

    const result = harness.run("230,nope");

    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /invalid issue number 'nope'/);
    assert.strictEqual(fs.existsSync(harness.zshCalls), false);
    assert.strictEqual(fs.existsSync(harness.claudeArgs), false);
    assert.strictEqual(fs.existsSync(harness.clipboard), false);
    assert.strictEqual(fs.existsSync(harness.primarySelection), false);
});

test("accepts a Claude model override", t => {
    const harness = fixture(t, { model: "haiku" });

    const result = harness.run("230");

    assert.strictEqual(result.status, 0, result.stderr);
    const claudeArgs = fs.readFileSync(harness.claudeArgs, "utf8").trim().split("\n");
    assert.ok(claudeArgs.includes("--model=haiku"));
});

test("uses a Herdr notification inside a Herdr pane", t => {
    const harness = fixture(t, { herdr: true });

    const result = harness.run("230");

    assert.strictEqual(result.status, 0, result.stderr);
    const encodedBranch = Buffer.from("jd-230/fix-payment-timeout").toString("base64");
    assert.strictEqual(result.stdout,
        `\u001b]52;c;${encodedBranch}\u0007jd-230/fix-payment-timeout\n`);
    assert.strictEqual(fs.readFileSync(harness.herdrNotification, "utf8"),
        "notification\nshow\nBranch copied\n--body\n" +
        "jd-230/fix-payment-timeout copied to clipboard\n--sound\ndone\n");
    assert.strictEqual(fs.existsSync(harness.notification), false);
    assert.strictEqual(fs.existsSync(harness.clipboard), false);
    assert.strictEqual(fs.existsSync(harness.primarySelection), false);
});

test("stops when an issue cannot be read", t => {
    const harness = fixture(t, { failIssue: "231" });

    const result = harness.run("230", "231", "245");

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /could not read issue 231/);
    assert.deepStrictEqual(fs.readFileSync(harness.zshCalls, "utf8").trim().split("\n"),
        ["ti 230", "ti 231"]);
    assert.strictEqual(fs.existsSync(harness.claudeArgs), false);
    assert.strictEqual(fs.existsSync(harness.clipboard), false);
    assert.strictEqual(fs.existsSync(harness.primarySelection), false);
});

test("rejects a malformed Claude response", t => {
    const harness = fixture(t, {
        output: "feature-230/Fix Payment Timeout",
    });

    const result = harness.run("230");

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /invalid branch name/);
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(fs.existsSync(harness.clipboard), false);
    assert.strictEqual(fs.existsSync(harness.primarySelection), false);
});

test("prints Claude's response when it has the wrong number of lines", t => {
    const harness = fixture(t, {
        output: "jd-230/fix-payment-timeout\n\nThis rationale should not be present.",
    });

    const result = harness.run("230");

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /expected only one branch-name line:/);
    assert.match(result.stderr, /jd-230\/fix-payment-timeout/);
    assert.match(result.stderr, /This rationale should not be present\./);
    assert.strictEqual(result.stdout, "");
    assert.strictEqual(fs.existsSync(harness.clipboard), false);
    assert.strictEqual(fs.existsSync(harness.primarySelection), false);
});
