import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader("settings", str(ROOT / "bin/df-settings-control"))
spec = importlib.util.spec_from_loader(loader.name, loader)
settings = importlib.util.module_from_spec(spec)
loader.exec_module(settings)


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = Path(self.directory.name)
        self.state = self.config / "settings.json"
        self.lua = self.config / "hypr-settings.lua"
        for name, value in (("DIRECTORY", self.config), ("STATE", self.state), ("OVERRIDES", self.lua)):
            patcher = patch.object(settings, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_persistent_hyprland_change_uses_nested_lua(self):
        with patch.object(settings, "run", return_value="ok") as run:
            settings.set_preference("decoration.blur.enabled", True)
        self.assertEqual(json.loads(self.state.read_text()), {"decoration.blur.enabled": True})
        self.assertEqual(run.call_args.args[0], ["hyprctl", "eval", "hl.config({ decoration = { blur = { enabled = true } } })\n"])
        self.assertEqual(self.lua.read_text(), run.call_args.args[0][2])

    def test_rejected_eval_does_not_persist(self):
        settings.set_preference("panels.clock", False)
        previous_lua = self.lua.read_text()
        previous_json = self.state.read_text()
        for response in ("Lua error: invalid option", ""):
            with patch.object(settings, "run", return_value=response):
                with self.assertRaises(ValueError):
                    settings.set_preference("general.gaps_in", 10)
            self.assertEqual(self.state.read_text(), previous_json)
            self.assertEqual(self.lua.read_text(), previous_lua)

    def test_failed_command_restores_override(self):
        with patch.object(settings, "run", side_effect=ValueError("Disconnected")):
            with self.assertRaisesRegex(ValueError, "Disconnected"):
                settings.set_preference("general.gaps_out", 20)
        self.assertFalse(self.state.exists())
        self.assertFalse(self.lua.exists())

    def test_failed_save_after_eval_reloads_hyprland(self):
        with patch.object(settings, "run", return_value="ok"):
            settings.set_preference("general.gaps_in", 8)
        previous_lua = self.lua.read_text()
        previous_json = self.state.read_text()
        with patch.object(settings, "run", return_value="ok") as run, \
                patch.object(settings, "atomic_write", side_effect=[None, OSError("disk full"), None]):
            with self.assertRaisesRegex(OSError, "disk full"):
                settings.set_preference("general.gaps_in", 12)
        self.assertEqual(run.call_args.args[0], ["hyprctl", "reload"])
        self.assertEqual(self.state.read_text(), previous_json)
        self.assertEqual(self.lua.read_text(), previous_lua)

    def test_reset_removes_the_override_and_reloads(self):
        with patch.object(settings, "run", return_value="ok"):
            settings.set_preference("general.gaps_in", 8)
            settings.set_preference("panels.clock", False)
        with patch.object(settings, "run", return_value="ok") as run:
            settings.reset_preference("general.gaps_in")
        run.assert_called_once_with(["hyprctl", "reload"])
        self.assertEqual(json.loads(self.state.read_text()), {"panels.clock": False})
        self.assertEqual(self.lua.read_text(), "hl.config({  })\n")
        with patch.object(settings, "run") as run:
            settings.reset_preference("panels.clock")
        run.assert_not_called()
        self.assertEqual(json.loads(self.state.read_text()), {})

    def test_failed_reset_keeps_the_override(self):
        with patch.object(settings, "run", return_value="ok"):
            settings.set_preference("general.gaps_in", 8)
        previous_lua = self.lua.read_text()
        with patch.object(settings, "run", side_effect=ValueError("Disconnected")):
            with self.assertRaises(ValueError):
                settings.reset_preference("general.gaps_in")
        self.assertEqual(json.loads(self.state.read_text()), {"general.gaps_in": 8})
        self.assertEqual(self.lua.read_text(), previous_lua)

    def test_empty_xdg_state_home_uses_the_default(self):
        fresh = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"XDG_STATE_HOME": "", "HOME": str(self.config)}):
            loader.exec_module(fresh)
        self.assertEqual(fresh.STATE, self.config / ".local/state/dotfiles/settings.json")

    def test_panels_are_local_and_preserve_other_preferences(self):
        with patch.object(settings, "run", return_value="ok"):
            settings.set_preference("general.gaps_in", 8)
        with patch.object(settings, "run") as run:
            settings.set_preference("panels.barHeight", 38)
            settings.set_preference("panels.workspaces", False)
        run.assert_not_called()
        self.assertEqual(json.loads(self.state.read_text()), {
            "general.gaps_in": 8, "panels.barHeight": 38, "panels.workspaces": False,
        })
        self.assertNotIn("panels", self.lua.read_text())

    def test_invalid_values_never_write_or_execute(self):
        cases = [
            ("general.gaps_in", -1), ("general.border_size", 2.5),
            ("panels.barHeight", 200), ("panels.clock", "false"),
            ("animations.enabled", 1), ("input.sensitivity", float("nan")),
            ("input.kb_layout", 'us"}); os.execute("bad")'),
            ("input.kb_layout", "us\n"), ("unknown.setting", True),
        ]
        with patch.object(settings, "run") as run:
            for key, value in cases:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    settings.set_preference(key, value)
        run.assert_not_called()
        self.assertFalse(self.state.exists())
        self.assertFalse(self.lua.exists())

    def test_corrupt_preferences_are_not_overwritten(self):
        self.state.write_text('{"panels.clock": "invalid"}')
        with self.assertRaises(ValueError):
            settings.set_preference("panels.barHeight", 30)
        self.assertEqual(self.state.read_text(), '{"panels.clock": "invalid"}')

    def test_snapshot_ignores_invalid_entries(self):
        offline = patch.object(settings, "optional", side_effect=lambda argv, fallback="": fallback)
        self.state.write_text('{"panels.clock": "invalid", "panels.barHeight": 30, "unknown": 1}')
        with offline:
            snapshot = settings.snapshot()
        self.assertEqual(snapshot["values"]["panels.barHeight"], 30)
        self.assertIs(snapshot["values"]["panels.clock"], True)
        self.assertEqual(snapshot["overrides"], ["panels.barHeight"])
        self.assertEqual(snapshot["ignored"], ["panels.clock", "unknown"])
        self.state.write_text("{")
        with offline:
            self.assertEqual(settings.snapshot()["ignored"], ["settings.json"])

    def test_live_snapshot_reads_css_gaps_bools_and_floats(self):
        def output(argv, fallback=""):
            if argv == ["hyprctl", "-j", "monitors"]:
                return '[{"name":"DP-1"}]'
            if argv[:3] == ["hyprctl", "-j", "getoption"]:
                return {
                    "general:gaps_in": '{"css":"12 12 12 12"}',
                    "general:gaps_out": '{"css":"7.6px 8 8 8"}',
                    "animations:enabled": '{"bool":false}',
                    "decoration:dim_inactive": '{"int":0}',
                    "input:sensitivity": '{"float":0.35}',
                    "input:kb_layout": '{"str":"us,bd"}',
                }.get(argv[3], "{}")
            if argv[0].endswith("df-default-app"):
                return '{"roles":[]}'
            return ""

        with patch.object(settings, "optional", side_effect=output):
            snapshot = settings.snapshot()
        self.assertTrue(snapshot["hyprland"])
        self.assertEqual(snapshot["values"]["general.gaps_in"], 12)
        self.assertEqual(snapshot["values"]["general.gaps_out"], 8)
        self.assertIs(snapshot["values"]["animations.enabled"], False)
        self.assertIs(snapshot["values"]["decoration.dim_inactive"], False)
        self.assertEqual(snapshot["values"]["input.sensitivity"], 0.35)
        self.assertEqual(snapshot["values"]["input.kb_layout"], "us,bd")

    def test_generated_lua_reloads_without_a_compositor(self):
        state = {key: item[0] for key, item in settings.SCHEMA.items()}
        self.lua.write_text(settings.lua_config(state))
        result = subprocess.run(["lua", "-e", "hl = { config = function(c) assert(c.input.kb_layout == 'us'); assert(c.panels == nil); assert(c.decoration.blur.enabled == false) end }", str(self.lua)], capture_output=True, text=True, stdin=subprocess.DEVNULL)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_cli_rejects_invalid_arguments(self):
        result = subprocess.run([str(ROOT / "bin/df-settings-control"), "set", "panels.clock", "oops"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Settings:", result.stderr)

    def test_theme_uses_the_existing_theme_helpers_location(self):
        home = self.config / "home"
        theme = home / ".config/theme"
        theme.parent.mkdir(parents=True)
        installed = home / "themes/example"
        installed.mkdir(parents=True)
        (installed / "background").write_text("image")
        theme.symlink_to(installed, target_is_directory=True)
        with patch.object(Path, "home", return_value=home), patch.object(settings, "optional", side_effect=lambda argv, fallback="": fallback):
            snapshot = settings.snapshot()
        self.assertEqual(snapshot["theme"], "example")
        self.assertEqual(snapshot["wallpaper"], str(installed / "background"))

    def test_theme_selection_reuses_the_existing_name_validator(self):
        applied = []

        def run(argv, **kwargs):
            if argv[0].endswith("df-theme-dir"):
                result = subprocess.run(argv, capture_output=True, text=True)
                if result.returncode:
                    raise ValueError("Invalid theme")
                return ""
            applied.append(argv[-1])
            return ""

        with patch.object(settings, "run", side_effect=run), patch("builtins.print"):
            for name in ("example.theme", "example+theme", "_example"):
                with patch.object(settings.sys, "argv", ["df-settings-control", "theme", name]):
                    settings.main()
            for name in ("../example", "Example", "-example"):
                with patch.object(settings.sys, "argv", ["df-settings-control", "theme", name]):
                    with self.assertRaises(ValueError):
                        settings.main()
        self.assertEqual(applied, ["example.theme", "example+theme", "_example"])

    def test_tailscale_domains_list_the_saved_file(self):
        saved = self.config / "tailscale-dns-domains"
        with patch.object(settings, "TAILSCALE_DOMAINS", saved):
            self.assertEqual(settings.tailscale_domains(), [])
            saved.write_text("other.example\n\nwork.example\n")
            self.assertEqual(settings.tailscale_domains(), ["other.example", "work.example"])

    def pkexec(self, code=0, stdout=""):
        """Fake only the elevated call; validation runs the real --check."""
        calls = []
        real = subprocess.run

        def run(argv, **kwargs):
            if argv[0] != "pkexec":
                return real(argv, **kwargs)
            calls.append(argv)
            return subprocess.CompletedProcess(argv, code, stdout, "")

        return patch.object(settings.subprocess, "run", side_effect=run), calls

    def test_tailscale_domain_is_validated_before_the_pkexec_prompt(self):
        patcher, calls = self.pkexec(stdout="Saved\n")
        with patcher:
            with self.assertRaisesRegex(ValueError, "Not a DNS domain"):
                settings.add_tailscale_domain("https://work.example")
            self.assertEqual(calls, [])
            self.assertEqual(settings.add_tailscale_domain(" Work.Example. "), "Saved")
        self.assertEqual(calls, [["pkexec", str(settings.ADD_TAILSCALE_DOMAIN), "work.example"]])

    def test_cancelled_tailscale_authorization_is_reported(self):
        for code in (126, 127):
            patcher, _ = self.pkexec(code)
            with patcher, self.assertRaisesRegex(ValueError, "cancelled"):
                settings.add_tailscale_domain("work.example")
    def test_tailscale_domain_removal_only_offers_saved_domains(self):
        saved = self.config / "tailscale-dns-domains"
        saved.write_text("work.example\n")
        with patch.object(settings, "TAILSCALE_DOMAINS", saved):
            patcher, calls = self.pkexec(stdout="Removed\n")
            with patcher:
                with self.assertRaisesRegex(ValueError, "not a saved"):
                    settings.remove_tailscale_domain("other.example")
                self.assertEqual(calls, [])
                self.assertEqual(settings.remove_tailscale_domain("work.example"), "Removed")
            self.assertEqual(calls, [["pkexec", str(settings.REMOVE_TAILSCALE_DOMAIN), "work.example"]])
            patcher, _ = self.pkexec(126)
            with patcher, self.assertRaisesRegex(ValueError, "not removed"):
                settings.remove_tailscale_domain("work.example")


if __name__ == "__main__":
    unittest.main()
