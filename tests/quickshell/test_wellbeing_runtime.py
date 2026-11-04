import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("quickshell"), "Quickshell is not installed")
class WellbeingRuntimeTests(unittest.TestCase):
    def run_shell(self, directory, body):
        shell = directory / "shell"
        if not shell.exists():
            shutil.copytree(ROOT / "quickshell/.config/quickshell/dotfiles", shell)
        (shell / "shell.qml").write_text('''
import QtQuick
import Quickshell
import Quickshell.Io
import qs.wellbeing
ShellRoot {
    WellbeingApp { id: app; locked: false }
    WellbeingWindow { id: view; app: app; visible: false }
    Timer { interval: 4000; running: true; onTriggered: Qt.quit() }
    Process { id: fileOperation }
    property int step: 0
    Timer {
        interval: 100
        repeat: true
        running: true
        onTriggered: {
''' + body + '''
        }
    }
}
''')
        runtime = directory / "runtime"
        runtime.mkdir(mode=0o700, exist_ok=True)
        result = subprocess.run(
            ["quickshell", "-p", str(shell), "--no-color"],
            env={**os.environ, "HOME": str(directory), "XDG_STATE_HOME": str(directory / "state"),
                 "XDG_CONFIG_HOME": str(directory / "config"), "XDG_RUNTIME_DIR": str(runtime),
                 "QT_QPA_PLATFORM": "offscreen", "QT_QUICK_BACKEND": "software",
                 "DBUS_SESSION_BUS_ADDRESS": "unix:path=" + str(directory / "no-bus"), "WAYLAND_DISPLAY": ""},
            capture_output=True, text=True, timeout=10,
        )
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 0, output)
        self.assertIn("WELLBEING PASS", output)
        for error in ("ReferenceError", "TypeError", "Error:", "Binding loop", "Failed to load configuration", "Cannot assign", "is not defined"):
            self.assertNotIn(error, output)

    def test_focus_lock_pause_window_and_restart(self):
        with tempfile.TemporaryDirectory(prefix="wellbeing-runtime-") as temporary:
            directory = Path(temporary)
            self.run_shell(directory, '''
            if (app.error) { console.log("ERROR " + app.error); Qt.quit(); }
            if (!app.ready) return;
            if (step === 0) {
                app.focusedApp = "test.editor";
                app.open();
                step++;
            } else if (step === 1) {
                app.focusedApp = "test.browser";
                step++;
            } else if (step === 2) {
                app.locked = true;
                step++;
            } else if (step === 3) {
                app.sample();
                const totals = Object.values(app.store.days)[0];
                if (!(totals["test.editor"] > 0 && totals["test.browser"] > 0))
                    throw new Error("Focus intervals were not recorded");
                app.focusedApp = "test.locked";
                app.inputIdle = true;
                app.locked = false;
                step++;
            } else if (step === 4) {
                app.sample();
                if (Object.values(app.store.days)[0]["test.locked"])
                    throw new Error("Idle or locked time was recorded");
                app.togglePause();
                step++;
            } else {
                console.log("WELLBEING PASS");
                Qt.quit();
            }
''')
            history = directory / "state/df-wellbeing/usage.json"
            first = json.loads(history.read_text())
            self.assertTrue(first["paused"])
            self.run_shell(directory, '''
            if (app.error) { console.log("ERROR " + app.error); Qt.quit(); }
            if (!app.ready) return;
            if (!app.store.paused || Object.keys(app.store.days).length !== 1)
                throw new Error("History was not restored");
            console.log("WELLBEING PASS");
            Qt.quit();
''')
            self.assertEqual(json.loads(history.read_text()), first)

    def test_dashboard_history_and_filters(self):
        with tempfile.TemporaryDirectory(prefix="wellbeing-analytics-") as temporary:
            self.run_shell(Path(temporary), '''
            if (!app.ready) return;
            if (step === 0) {
                app.store = { version: 1, paused: true, days: {
                    "2026-10-25": {"test.editor": 60000},
                    "2026-10-27": {"test.editor": 120000, "test.browser": 60000},
                    "2026-10-28": {"test.browser": 180000}
                }};
                app.now = new Date(2026, 9, 28).getTime();
                view.period = "custom";
                view.startDate = "2026-10-27";
                view.endDate = "2026-10-28";
                step++;
            } else if (step === 1) {
                if (view.summary.total !== 360000 || view.summary.previous !== 60000)
                    throw new Error("Dashboard totals do not match history");
                view.page = "history";
                view.query = "editor";
                step++;
            } else if (step === 2) {
                if (view.summary.total !== 120000 || view.summary.history.length !== 2)
                    throw new Error("History search did not filter totals and rows");
                view.period = "365";
                view.page = "dashboard";
                step++;
            } else if (step === 3) {
                if (view.days.length !== 365 || view.summary.trend.length > 31)
                    throw new Error("Annual trend has invalid buckets");
                view.startDate = "bad";
                view.period = "custom";
                step++;
            } else {
                if (view.days.length || view.summary.total)
                    throw new Error("Invalid custom dates were accepted");
                console.log("WELLBEING PASS");
                Qt.quit();
            }
''')

    def test_application_labels_render_markup_as_plain_text(self):
        with tempfile.TemporaryDirectory(prefix="wellbeing-labels-") as temporary:
            self.run_shell(Path(temporary), '''
            if (!app.ready) return;
            const application = "<b>application</b>";
            function checkLabels(item) {
                let matches = 0;
                if (item.text === application) {
                    if (item.textFormat !== Text.PlainText)
                        throw new Error("Application markup was not treated as plain text");
                    matches++;
                }
                for (const child of item.children || [])
                    matches += checkLabels(child);
                return matches;
            }
            if (step === 0) {
                const totals = {};
                totals[application] = 60000;
                const days = {};
                days[view.endDate] = totals;
                app.store = { version: 1, paused: true, days: days };
                view.visible = true;
                step++;
            } else if (step === 1) {
                if (checkLabels(view.contentItem) !== 1)
                    throw new Error("Dashboard application label was not checked");
                view.page = "history";
                step++;
            } else {
                if (checkLabels(view.contentItem) !== 2)
                    throw new Error("History application name and ID were not checked");
                console.log("WELLBEING PASS");
                Qt.quit();
            }
''')

    def test_failed_save_retries_unchanged_paused_history(self):
        with tempfile.TemporaryDirectory(prefix="wellbeing-save-retry-") as temporary:
            directory = Path(temporary)
            self.run_shell(directory, '''
            if (!app.ready || fileOperation.running) return;
            if (step === 0) {
                app.store = { version: 1, paused: true, days: {"2026-10-28": {"editor": 120000}} };
                fileOperation.command = ["mkdir", app.stateDir + "/usage.json"];
                fileOperation.running = true;
                step++;
            } else if (step === 1) {
                app.dirty = true;
                app.save();
                step++;
            } else if (step === 2) {
                if (!app.error || !app.historyReady) return;
                fileOperation.command = ["rmdir", app.stateDir + "/usage.json"];
                fileOperation.running = true;
                step++;
            } else if (step === 3) {
                app.save();
                step++;
            } else {
                if (app.error) return;
                if (app.store.days["2026-10-28"].editor !== 120000 || !app.store.paused)
                    throw new Error("Reload replaced unsaved history");
                console.log("WELLBEING PASS");
                Qt.quit();
            }
''')
            saved = json.loads((directory / "state/df-wellbeing/usage.json").read_text())
            self.assertEqual(saved, {"version": 1, "paused": True, "days": {"2026-10-28": {"editor": 120000}}})

    def test_invalid_history_is_preserved(self):
        with tempfile.TemporaryDirectory(prefix="wellbeing-runtime-") as temporary:
            directory = Path(temporary)
            history = directory / "state/df-wellbeing/usage.json"
            history.parent.mkdir(parents=True)
            history.write_text("corrupt history")
            self.run_shell(directory, '''
            if (!app.error) return;
            if (app.ready) throw new Error("Invalid history enabled writes");
            app.save();
            console.log("WELLBEING PASS");
            Qt.quit();
''')
            self.assertEqual(history.read_text(), "corrupt history")


if __name__ == "__main__":
    unittest.main()
