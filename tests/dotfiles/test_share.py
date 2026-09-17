import contextlib
import importlib.machinery
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader("df_share", str(ROOT / "bin/df-share"))
spec = importlib.util.spec_from_loader(loader.name, loader)
share = importlib.util.module_from_spec(spec)
loader.exec_module(share)


class ShareTests(unittest.TestCase):
    def test_devbox_cannot_launch_share(self):
        with patch.dict(os.environ, {"DOTFILES_PROFILE": "arch-devbox"}), \
                patch("sys.argv", ["df-share", "receive"]), \
                patch.object(share.subprocess, "run") as run, \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(share.main(), 1)
            run.assert_not_called()

    def test_selected_paths_remain_separate_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / "a b.txt", Path(directory) / "c\nd.txt"]
            for path in paths:
                path.touch()
            with patch.object(share, "select_paths", return_value=list(map(str, paths))), \
                    patch.object(share.subprocess, "run") as run:
                share.share("file", [])
                self.assertEqual(run.call_args.args[0][-2:], list(map(str, paths)))
                self.assertIn("--property=Type=exec", run.call_args.args[0])

    def test_cancel_does_not_launch(self):
        with patch.object(share, "select_paths", return_value=[]), \
                patch.object(share.subprocess, "run") as run:
            share.share("folder", [])
            run.assert_not_called()

    def test_unsupported_clipboard_does_not_launch(self):
        with patch.object(share.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, b"", b"")) as run:
            with self.assertRaisesRegex(RuntimeError, "Clipboard images"):
                share.share("clipboard", [])
            self.assertEqual(run.call_count, 1)

    def test_clipboard_file_survives_successful_handoff(self):
        path = None

        def run(command, **kwargs):
            nonlocal path
            if command[0] == "wl-paste":
                return subprocess.CompletedProcess(command, 0, b"hello\n", b"")
            path = Path(command[-1])
            self.assertEqual(path.read_bytes(), b"hello\n")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            return subprocess.CompletedProcess(command, 0)

        try:
            with patch.object(share.subprocess, "run", side_effect=run):
                share.share("clipboard", [])
            self.assertTrue(path.exists())
        finally:
            if path:
                path.unlink(missing_ok=True)

    def test_launch_failure_cleans_clipboard_file(self):
        path = None

        def run(command, **kwargs):
            nonlocal path
            if command[0] == "wl-paste":
                return subprocess.CompletedProcess(command, 0, b"hello", b"")
            path = Path(command[-1])
            raise subprocess.CalledProcessError(1, command)

        with patch.object(share.subprocess, "run", side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                share.share("clipboard", [])
        self.assertFalse(path.exists())

    def test_missing_file_is_not_sent(self):
        with patch.object(share.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "Path does not exist"):
                share.share("file", ["/does-not-exist/localsend"])
            run.assert_not_called()

    def test_setup_is_rerunnable_without_changing_preferences(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            commands = home / "commands"
            commands.mkdir()
            sudo = commands / "sudo"
            sudo.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$HOME/calls\"\n")
            sudo.chmod(0o755)
            preferences = home / ".local/share/org.localsend.localsend_app/settings.json"
            preferences.parent.mkdir(parents=True)
            preferences.write_text('{"alias":"My workstation"}')
            env = dict(os.environ, HOME=str(home), DOTFILES_DIR=str(ROOT),
                       PATH=str(commands) + os.pathsep + os.environ["PATH"])
            for _ in range(2):
                subprocess.run(["bash", str(ROOT / "setup/arch-workstation/setup-packages/setup-localsend")],
                               env=env, check=True)
            extension = home / ".local/share/nautilus-python/extensions/localsend.py"
            self.assertEqual(extension.resolve(), ROOT / "setup/arch-workstation/localsend/localsend.py")
            self.assertEqual(preferences.read_text(), '{"alias":"My workstation"}')
            subprocess.run(["bash", str(ROOT / "setup/arch-workstation/setup-packages/setup-ufw")],
                           env=env, check=True)
            calls = (home / "calls").read_text().splitlines()
            self.assertIn("ufw allow 53317/tcp comment LocalSend", calls)
            self.assertIn("ufw allow 53317/udp comment LocalSend", calls)

    def test_hyprland_profile_gates(self):
        script = r'''
            local enabled = os.getenv("DOTFILES_PROFILE") == "arch-workstation"
            local share, window = false, false
            o = { bind = function(keys, label)
                if label == "Share" then
                    assert(keys == "SUPER + ALT + S")
                    share = true
                end
            end }
            hl = {
                dsp = { global = function() end },
                window_rule = function(rule)
                    if rule.name == "localsend" then window = true end
                end,
                workspace_rule = function() end
            }
            dofile("hypr/.config/hypr/lua/bindings/utilities.lua")
            dofile("hypr/.config/hypr/lua/windows.lua")
            assert(share == enabled)
            assert(window == enabled)
        '''
        for profile in ("arch-devbox", "arch-workstation", ""):
            subprocess.run(["lua", "-"], input=script, text=True, cwd=ROOT,
                           env=dict(os.environ, DOTFILES_PROFILE=profile), check=True)


if __name__ == "__main__":
    unittest.main()
