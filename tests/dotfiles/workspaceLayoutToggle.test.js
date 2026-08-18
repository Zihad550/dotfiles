const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve("bin/df-hypr-workspace-layout-toggle");

function harness(options = {}) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-layout-toggle-"));
    const hyprctlLog = path.join(temp, "hyprctl.log");
    const notificationLog = path.join(temp, "notifications.log");
    const layoutState = path.join(temp, "layout");

    fs.writeFileSync(layoutState, "scrolling\n");
    fs.writeFileSync(path.join(temp, "hyprctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$HYPRCTL_LOG"

if [ "$1" = "activeworkspace" ]; then
    layout=$(cat "$LAYOUT_STATE")
    printf '{"id":3,"tiledLayout":"%s"}\\n' "$layout"
    exit 0
fi

if [ "$1" = "-r" ]; then
    shift
fi

if [ "$1" = "eval" ]; then
    if [ "$HYPRCTL_FAIL_EVAL" = "1" ]; then
        printf '%s\\n' 'eval rejected' >&2
        exit 1
    fi

    if [ "$HYPRCTL_KEEP_LAYOUT" != "1" ]; then
        case "$2" in
            *'layout = "dwindle"'*) printf '%s\\n' dwindle > "$LAYOUT_STATE" ;;
            *'layout = "scrolling"'*) printf '%s\\n' scrolling > "$LAYOUT_STATE" ;;
        esac
    fi
    printf '%s\\n' ok
    exit 0
fi

printf '%s\\n' 'legacy keyword rejected' >&2
exit 1
`);
    fs.writeFileSync(path.join(temp, "notify-send"), `#!/bin/sh
printf '%s\\n' "$*" >> "$NOTIFICATION_LOG"
`);
    fs.chmodSync(path.join(temp, "hyprctl"), 0o755);
    fs.chmodSync(path.join(temp, "notify-send"), 0o755);

    const result = childProcess.spawnSync(SCRIPT, {
        encoding: "utf8",
        env: {
            ...process.env,
            PATH: `${temp}:${process.env.PATH}`,
            HYPRCTL_LOG: hyprctlLog,
            NOTIFICATION_LOG: notificationLog,
            LAYOUT_STATE: layoutState,
            HYPRCTL_FAIL_EVAL: options.failEval ? "1" : "0",
            HYPRCTL_KEEP_LAYOUT: options.keepLayout ? "1" : "0",
        },
    });

    return {
        result,
        hyprctlCalls: fs.existsSync(hyprctlLog) ? fs.readFileSync(hyprctlLog, "utf8") : "",
        notifications: fs.existsSync(notificationLog)
            ? fs.readFileSync(notificationLog, "utf8") : "",
        layout: fs.readFileSync(layoutState, "utf8").trim(),
        cleanup: () => fs.rmSync(temp, { recursive: true, force: true }),
    };
}

test("toggles the active workspace through Lua eval and verifies the result", t => {
    const run = harness();
    t.after(run.cleanup);

    assert.strictEqual(run.result.status, 0, run.result.stderr);
    assert.match(run.hyprctlCalls,
        /-r eval hl\.workspace_rule\(\{ workspace = "3", layout = "dwindle" \}\)/);
    assert.strictEqual(run.layout, "dwindle");
    assert.match(run.notifications, /Workspace layout set to dwindle/);
});

test("does not announce success when Hyprland rejects the layout rule", t => {
    const run = harness({ failEval: true });
    t.after(run.cleanup);

    assert.notStrictEqual(run.result.status, 0);
    assert.doesNotMatch(run.notifications, /Workspace layout set to/);
});

test("does not announce success when the workspace layout did not change", t => {
    const run = harness({ keepLayout: true });
    t.after(run.cleanup);

    assert.notStrictEqual(run.result.status, 0);
    assert.strictEqual(run.layout, "scrolling");
    assert.doesNotMatch(run.notifications, /Workspace layout set to/);
});
