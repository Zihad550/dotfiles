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
    fs.mkdirSync(path.join(directory, "runtime"), { mode: 0o700 });
    fs.copyFileSync(path.join(repo, "quickshell/.config/quickshell/dotfiles/KanataService.qml"),
        path.join(directory, "KanataService.qml"));
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
                root.writeState('echo missing > "$HOME/state"');
                break;
            case 7:
                KanataService.refresh();
                break;
            case 8:
                root.check(!KanataService.installed && !KanataService.active, "missing unit hidden");
                KanataService.toggle();
                root.check(!KanataService.busy, "missing unit cannot toggle");
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
            PATH: `${path.join(directory, "bin")}:${process.env.PATH}`,
        },
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /CHECK_FAILED|TypeError|ReferenceError/, output);
    assert.match(output, /KANATA_PASS/, output);
    assert.equal(fs.readFileSync(path.join(directory, "calls"), "utf8"),
        "start kanata.service\nstop kanata.service\nstart kanata.service\n");
    assert.match(fs.readFileSync(path.join(directory, "notifications"), "utf8"), /Kanata Authorization denied/);
});
