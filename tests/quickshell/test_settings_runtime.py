import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which("quickshell"), "Quickshell is not installed")
class SettingsRuntimeTests(unittest.TestCase):
    def test_first_save_updates_live_preferences_and_every_page_loads(self):
        with tempfile.TemporaryDirectory(prefix="settings-runtime-") as temporary:
            directory = Path(temporary)
            shell = directory / "shell"
            shutil.copytree(ROOT / "quickshell/.config/quickshell/dotfiles", shell)
            home = directory / "home"
            home.mkdir()
            (home / "dotfiles").symlink_to(ROOT, target_is_directory=True)
            runtime = directory / "runtime"
            runtime.mkdir(mode=0o700)
            config = directory / "config"
            config.mkdir()
            state = directory / "state"
            state.mkdir()
            fake_bin = directory / "bin"
            fake_bin.mkdir()
            hyprctl = fake_bin / "hyprctl"
            hyprctl.write_text("#!/bin/sh\nexit 1\n")
            hyprctl.chmod(0o755)
            (shell / "shell.qml").write_text('''
import QtQuick
import Quickshell
import Quickshell.Io
import qs
import qs.settings
import qs.launcher as Launcher
import qs.lock as Lock

ShellRoot {
    property int step: 0
    property string testFont: Qt.fontFamilies().find(family => family !== Theme.defaultFontFamily)
    Lock.Theme { id: lockTheme }
    SettingsApp {
        id: app
        Component.onCompleted: open("panels")
    }
    Process {
        id: externalChange
        command: [app.backend, "set", "panels.workspaces", "false"]
    }
    Timer {
        running: true
        repeat: true
        interval: 100
        onTriggered: {
            if (!app.loaded || app.busy) return;
            if (step === 0) {
                app.setValue("panels.barHeight", 34);
                step = 1;
            } else if (step === 1 && app.snapshot.values["panels.barHeight"] === 34
                && DesktopPreferences.value("panels.barHeight", 26) === 34) {
                app.setValue("panels.clock24h", true);
                step = 2;
            } else if (step === 2 && app.snapshot.values["panels.clock24h"] === true
                && app.snapshot.overrides.includes("panels.clock24h")
                && DesktopPreferences.value("panels.clock24h", false)) {
                externalChange.running = true;
                step = 3;
            } else if (step === 3 && !externalChange.running
                && DesktopPreferences.value("panels.workspaces", true) === false) {
                app.apply(["reset", "panels.workspaces"]);
                step = 4;
            } else if (step === 4 && !app.snapshot.overrides.includes("panels.workspaces")
                && !("panels.workspaces" in DesktopPreferences.values)) {
                app.page = "appearance";
                app.setValue("appearance.fontFamily", testFont);
                step = 5;
            } else if (step === 5 && Theme.fontFamily === testFont
                && Launcher.Theme.fontFamily === testFont && lockTheme.fontFamily === testFont
                && app.snapshot.values["appearance.fontFamily"] === testFont) {
                app.apply(["reset", "appearance.fontFamily"]);
                step = 6;
            } else if (step === 6 && Theme.fontFamily === Theme.defaultFontFamily
                && Launcher.Theme.fontFamily === Launcher.Theme.defaultFontFamily
                && lockTheme.fontFamily === lockTheme.defaultFontFamily) {
                step = 7;
            } else if (step >= 7) {
                const pages = ["windows", "input", "displays", "defaults", "tailscale", "appearance", "panels"];
                if (step - 7 < pages.length) {
                    app.open(pages[step - 7]);
                    step++;
                } else if (step - 7 === pages.length) {
                    // No real domains exist here; inject one so its Remove row is built.
                    app.snapshot = Object.assign({}, app.snapshot, { tailscaleDomains: ["work.example"] });
                    app.page = "tailscale";
                    step++;
                } else {
                    DesktopPreferences.values = { "panels.barHeight": 0, "appearance.fontFamily": " Invalid" };
                    if (Theme.barHeight === 26 && Theme.fontFamily === Theme.defaultFontFamily)
                        console.log("SETTINGS RUNTIME PASS");
                    Qt.quit();
                }
            }
        }
    }
}
''')
            result = subprocess.run(
                ["quickshell", "-p", str(shell), "--no-color"],
                env={
                    **os.environ,
                    "HOME": str(home),
                    "PATH": str(fake_bin) + os.pathsep + os.environ["PATH"],
                    "XDG_CONFIG_HOME": str(config),
                    "XDG_STATE_HOME": str(state),
                    "XDG_RUNTIME_DIR": str(runtime),
                    "QT_QPA_PLATFORM": "offscreen",
                    "QT_QUICK_BACKEND": "software",
                    "DBUS_SESSION_BUS_ADDRESS": "unix:path=" + str(directory / "no-bus"),
                    "WAYLAND_DISPLAY": "",
                }, capture_output=True, text=True, timeout=15,
            )
            output = result.stdout + result.stderr
            self.assertEqual(result.returncode, 0, output)
            self.assertIn("SETTINGS RUNTIME PASS", output)
            for failure in ("ReferenceError", "TypeError", "Failed to load configuration", "Cannot assign", "is not defined"):
                self.assertNotIn(failure, output)
            preferences = json.loads((state / "dotfiles/settings.json").read_text())
            self.assertEqual(preferences, {"panels.barHeight": 34, "panels.clock24h": True})


if __name__ == "__main__":
    unittest.main()
