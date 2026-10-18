const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const hasQuickshell = spawnSync("quickshell", ["--version"]).status === 0;

test("Kanata tracks service state, serializes toggles and reports failures", { skip: !hasQuickshell }, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanata-toggle-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, "bin"));
    fs.mkdirSync(path.join(directory, "dotfiles/bin"), { recursive: true });
    fs.mkdirSync(path.join(directory, "runtime"), { mode: 0o700 });
    fs.mkdirSync(path.join(directory, "modules/lib"), { recursive: true });
    fs.copyFileSync(path.join(repo, "quickshell/.config/quickshell/dotfiles/KanataService.qml"),
        path.join(directory, "KanataService.qml"));
    fs.copyFileSync(path.join(repo, "quickshell/.config/quickshell/dotfiles/modules/lib/kanataLayers.js"),
        path.join(directory, "modules/lib/kanataLayers.js"));
    fs.writeFileSync(path.join(directory, "state"), "inactive");
    fs.writeFileSync(path.join(directory, "bin/systemctl"), `#!/bin/sh
case "$1" in
    show)
        state=$(cat "$HOME/state")
        if [ "$state" = missing ]; then
            printf 'LoadState=not-found\\nActiveState=inactive\\n'
        else
            printf 'LoadState=loaded\\nActiveState=%s\\n' "$state"
        fi
        ;;
    start|stop)
        printf '%s\\n' "$*" >> "$HOME/calls"
        sleep 0.1
        if [ -f "$HOME/fail" ]; then
            echo 'Authorization denied' >&2
            exit 1
        fi
        if [ "$1" = start ]; then echo active; else echo inactive; fi > "$HOME/state"
        ;;
    *) exit 2 ;;
esac
`, { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "dotfiles/bin/df-kanata-profile"),
        `#!/bin/sh
if [ "$1" = current ]; then
    if [ -f "$HOME/bad-profile" ]; then echo 'Unknown active Kanata config' >&2; exit 1; fi
    if [ -f "$HOME/profile" ]; then cat "$HOME/profile"; else echo default; fi
elif [ -f "$HOME/fail-profile" ]; then
    echo 'Profile switch failed' >&2
    exit 1
else
    echo "$1" > "$HOME/profile"
fi
`, { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "bin/notify-send"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/notifications"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(directory, "shell.qml"), `import QtQuick
import Quickshell
import Quickshell.Io
import qs

ShellRoot {
    id: root
    readonly property var service: KanataService
    property int step: 0
    function check(condition, message): void {
        if (!condition) {
            console.error("CHECK_FAILED " + message);
            Qt.quit();
        }
    }
    function writeState(value: string): void {
        changeState.command = ["sh", "-c", value];
        changeState.running = true;
    }
    Process { id: changeState }
    Timer {
        interval: 30
        repeat: true
        running: true
        onTriggered: {
            if (KanataService.busy || changeState.running)
                return;
            switch (root.step++) {
            case 0:
                root.check(KanataService.installed && !KanataService.active, "initial state");
                KanataService.toggle();
                KanataService.toggle();
                root.check(KanataService.busy, "toggle is busy");
                break;
            case 1:
                root.check(KanataService.active, "start confirmed");
                KanataService.toggle();
                break;
            case 2:
                root.check(!KanataService.active, "stop confirmed");
                root.writeState('touch "$HOME/fail"');
                break;
            case 3:
                KanataService.toggle();
                break;
            case 4:
                root.check(!KanataService.active, "failed start stays inactive");
                root.writeState('echo active > "$HOME/state"');
                break;
            case 5:
                KanataService.refresh();
                break;
            case 6:
                root.check(KanataService.active, "external start is reflected");
                KanataService.selectProfile("laptop");
                KanataService.selectProfile("default");
                root.check(KanataService.busy, "profile switch is busy");
                break;
            case 7:
                root.check(KanataService.profile === "laptop", "profile switch confirmed");
                root.writeState('touch "$HOME/fail-profile"');
                break;
            case 8:
                KanataService.selectProfile("default");
                break;
            case 9:
                root.check(KanataService.profile === "laptop", "failed switch keeps profile");
                root.writeState('touch "$HOME/bad-profile"');
                break;
            case 10:
            case 11:
                KanataService.refresh();
                break;
            case 12:
                root.check(KanataService.profile === "laptop", "unreadable profile keeps last known");
                root.writeState('echo missing > "$HOME/state"');
                break;
            case 13:
                KanataService.refresh();
                break;
            case 14:
                root.check(!KanataService.installed && !KanataService.active, "missing unit hidden");
                KanataService.toggle();
                root.check(!KanataService.busy, "missing unit cannot toggle");
                root.writeState('echo active > "$HOME/state"; rm "$HOME/fail" "$HOME/bad-profile"; mv "$HOME/dotfiles/bin/df-kanata-profile" "$HOME/helper"');
                break;
            case 15:
                KanataService.refresh();
                break;
            case 16:
                root.check(KanataService.installed && KanataService.active, "missing helper keeps service state");
                root.check(KanataService.profileError.length > 0, "missing helper is reported");
                KanataService.toggle();
                break;
            case 17:
                root.check(!KanataService.active, "missing helper does not block toggles");
                root.writeState('mv "$HOME/helper" "$HOME/dotfiles/bin/df-kanata-profile"');
                break;
            case 18:
                KanataService.refresh();
                break;
            case 19:
                root.check(KanataService.profileError === "", "profile loading recovers");
                console.log("KANATA_PASS");
                Qt.quit();
            }
        }
    }
}
`);
    const result = spawnSync("quickshell", ["-p", directory, "--no-color"], {
        encoding: "utf8", timeout: 8000,
        env: {
            ...process.env,
            QT_QPA_PLATFORM: "offscreen",
            HOME: directory,
            XDG_RUNTIME_DIR: path.join(directory, "runtime"),
            PATH: `${path.join(directory, "bin")}:/usr/bin:/bin`,
        },
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /CHECK_FAILED|TypeError|ReferenceError/, output);
    assert.match(output, /KANATA_PASS/, output);
    assert.equal(fs.readFileSync(path.join(directory, "calls"), "utf8"),
        "start kanata.service\nstop kanata.service\nstart kanata.service\nstop kanata.service\n");
    const notifications = fs.readFileSync(path.join(directory, "notifications"), "utf8");
    assert.match(notifications, /Kanata Authorization denied/);
    assert.match(notifications, /Kanata Profile switch failed/);
    assert.equal(notifications.match(/Kanata Unknown active Kanata config/g)?.length, 1, notifications);
});
