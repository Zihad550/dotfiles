const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const source = path.join(repo, "quickshell/.config/quickshell/dotfiles");
const hasQuickshell = spawnSync("quickshell", ["--version"]).status === 0;

for (const scenario of [
    { name: "fast operator refresh", delay: 0, exit: 0, state: "empty" },
    { name: "slow refresh", delay: 0.9, exit: 0, state: "empty" },
    { name: "failed refresh", delay: 0, exit: 1, state: "daemon-failure" },
]) {
    test(`${scenario.name} shows feedback and becomes usable again`, { skip: !hasQuickshell }, () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tailscale-refresh-"));
        function write(relative, content) {
            const filename = path.join(directory, relative);
            fs.mkdirSync(path.dirname(filename), { recursive: true });
            fs.writeFileSync(filename, content);
        }
        function script(relative, content) {
            write(relative, `#!/bin/sh\n${content}\n`);
            fs.chmodSync(path.join(directory, relative), 0o755);
        }
        try {
            for (const relative of [
                "TailscaleService.qml", "Theme.qml", "modules/lib/tailscale.js",
                "modules/TailscalePage.qml", "modules/PageRow.qml",
                "modules/QuickSettingsPage.qml", "modules/Tooltip.qml",
            ]) {
                write(relative, fs.readFileSync(path.join(source, relative)));
            }
            write("bin/df-tailscale", fs.readFileSync(path.join(repo, "bin/df-tailscale")));
            fs.chmodSync(path.join(directory, "bin/df-tailscale"), 0o755);
            script("bin/tailscale", `printf '%s\\n' "$*" >> "$HOME/calls"\nsleep ${scenario.delay}\nprintf '[]\\n'\nexit ${scenario.exit}`);
            script("bin/pkexec", "echo UNEXPECTED_ELEVATION >&2\nexit 1");
            script("bin/notify-send", "exit 0");
            script("home/.config/quickshell/dotfiles/scripts/tailscale-status.sh", "sleep 10");
            fs.mkdirSync(path.join(directory, "runtime"), { mode: 0o700 });
            write("shell.qml", `import QtQuick
import Quickshell
import qs
import "modules"
ShellRoot {
    property var refreshRow
    property bool passed: true
    function check(condition, message) {
        if (!condition) {
            passed = false;
            console.error("CHECK_FAILED: " + message);
        }
    }
    TailscalePage { id: page; width: 420; height: 300 }
    Component.onCompleted: {
        for (const item of page.contentData) {
            if (item.label === "Refresh")
                refreshRow = item;
        }
        check(refreshRow !== undefined, "Refresh row exists");
        refreshRow.clicked(false);
    }
    Timer {
        interval: 250; running: true
        onTriggered: {
            check(refreshRow.label === "Refreshing…", "refresh feedback remains readable");
            check(refreshRow.busy === true, "refresh spinner is active");
            check(!refreshRow.enabled, "duplicate refresh is disabled");
            check(TailscaleService.profilesLoading === ${scenario.delay > 0.25}, "real process state");
            TailscaleService.loadProfiles();
        }
    }
    Timer {
        interval: 800; running: ${scenario.delay > 0.65}
        onTriggered: {
            check(refreshRow.busy && !refreshRow.enabled, "slow refresh stays busy after minimum feedback time");
        }
    }
    Timer {
        interval: 1400; running: true
        onTriggered: {
            check(TailscaleService.profilesState === "${scenario.state}", "refresh result reaches the page");
            check(refreshRow.label === "Refresh", "feedback ends");
            check(refreshRow.busy === false, "spinner stops");
            check(refreshRow.enabled, "refresh becomes usable again");
            if (passed) console.log("REFRESH_PASS");
            Qt.quit();
        }
    }
}
`);
            const result = spawnSync("quickshell", ["-p", directory, "--no-color"], {
                encoding: "utf8", timeout: 8000,
                env: {
                    ...process.env,
                    QT_QPA_PLATFORM: "offscreen",
                    HOME: path.join(directory, "home"),
                    XDG_RUNTIME_DIR: path.join(directory, "runtime"),
                    PATH: `${path.join(directory, "bin")}:${process.env.PATH}`,
                },
            });
            const output = result.stdout + result.stderr;
            assert.equal(result.status, 0, output);
            assert.doesNotMatch(output, /CHECK_FAILED|UNEXPECTED_ELEVATION/, output);
            assert.match(output, /REFRESH_PASS/, output);
            assert.equal(fs.readFileSync(path.join(directory, "home/calls"), "utf8"), "switch --list --json\n");
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}
