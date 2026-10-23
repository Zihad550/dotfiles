import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
LG = {"name": "DP-1", "make": "LG Electronics", "model": "LG FULL HD", "serial": "203NTFA3R371"}
LAPTOP = {"name": "eDP-1", "make": "BOE", "model": "panel", "serial": ""}

FAKE = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
tool = Path(sys.argv[0]).name
args = sys.argv[1:]
state_path = Path(os.environ['MONITOR_TEST_STATE'])
state = json.loads(state_path.read_text())
state['calls'].append([tool, *args])
status = 0
if tool == 'hyprctl':
    if args[0] == 'monitors':
        print(os.environ['MONITOR_TEST_DISPLAYS'])
    elif args[1:] == ['profile']:
        status = 0 if os.environ.get('MONITOR_TEST_UNMANAGED') == '1' else 1
    else:
        print('ok')
elif tool == 'systemctl':
    if 'show' in args:
        print('active')
elif tool == 'ddcutil':
    if 'getvcp' in args:
        code = args[-1]
        if os.environ.get('MONITOR_TEST_READ_FAILURE') == '1':
            status = 1
        if code == '14':
            print(f"VCP 14 SNC x{state['preset']:02x}")
        else:
            value = 'invalid' if os.environ.get('MONITOR_TEST_BAD_NUMBER') == '1' else state['rgb'][code]
            print('VCP', code, 'C', value, 100)
    elif 'setvcp' in args:
        code, value = args[-2:]
        if os.environ.get('MONITOR_TEST_FAIL') == code and (not state.get('failed') or os.environ.get('MONITOR_TEST_RESTORE_FAILURE') == '1'):
            state['failed'] = True
            status = 1
            print('simulated DDC failure', file=sys.stderr)
        elif code == '14':
            state['preset'] = int(value)
        else:
            state['rgb'][code] = int(value)
state_path.write_text(json.dumps(state))
sys.exit(status)
'''


class MonitorTests(unittest.TestCase):
    def invoke(self, command, monitors, rgb=None, fail=None, unmanaged=False,
               fail_restore=False, fail_read=False, bad_number=False, preset=11):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ("ddcutil", "hyprctl", "systemctl"):
                tool = folder / name
                tool.write_text(FAKE)
                tool.chmod(0o755)
            state = folder / "state.json"
            state.write_text(json.dumps({"calls": [], "preset": preset, "rgb": rgb or {"16": 50, "18": 59, "1A": 63}}))
            env = {**os.environ, "PATH": f"{folder}:/usr/bin:/bin", "XDG_RUNTIME_DIR": directory,
                   "DF_MONITOR_PRESETS": str(ROOT / "hypr/.config/hypr/monitor-presets.json"),
                   "MONITOR_TEST_STATE": str(state), "MONITOR_TEST_DISPLAYS": json.dumps(monitors),
                   "MONITOR_TEST_FAIL": fail or "", "MONITOR_TEST_UNMANAGED": "1" if unmanaged else "0",
                   "MONITOR_TEST_RESTORE_FAILURE": "1" if fail_restore else "0",
                   "MONITOR_TEST_READ_FAILURE": "1" if fail_read else "0",
                   "MONITOR_TEST_BAD_NUMBER": "1" if bad_number else "0"}
            result = subprocess.run([str(ROOT / "bin/df-monitor"), command], env=env,
                                    text=True, capture_output=True, timeout=15)
            return result, json.loads(state.read_text())

    def test_lg_night_uses_serial_and_stops_scheduled_software_filter(self):
        result, state = self.invoke("night", [LG])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state["preset"], 5)
        self.assertEqual(state["rgb"], {"16": 50, "18": 59, "1A": 63})
        calls = state["calls"]
        stop = calls.index(["systemctl", "--user", "stop", "hyprsunset.service"])
        write = next(i for i, call in enumerate(calls) if "setvcp" in call)
        self.assertLess(stop, write)
        self.assertIn(["hyprctl", "hyprsunset", "identity"], calls)
        self.assertTrue(all(call[1:3] == ["--sn", LG["serial"]] for call in calls if call[0] == "ddcutil"))
        self.assertFalse(any("setvcp" in call and call[-2] != "14" for call in calls))

    def test_mixed_setup_restores_hardware_before_global_warmth(self):
        result, state = self.invoke("night", [LG, LAPTOP], {"16": 50, "18": 50, "1A": 35}, preset=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state["rgb"], {"16": 50, "18": 59, "1A": 63})
        self.assertEqual(state["preset"], 11)
        calls = state["calls"]
        last_write = max(i for i, call in enumerate(calls) if "setvcp" in call)
        start = calls.index(["systemctl", "--user", "start", "hyprsunset.service"])
        self.assertLess(last_write, start)
        self.assertIn(["hyprctl", "hyprsunset", "temperature", "4000"], calls)

    def test_laptop_only_needs_no_ddc(self):
        result, state = self.invoke("night", [LAPTOP])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call[0] == "ddcutil" for call in state["calls"]))

    def test_unknown_lg_serial_does_not_receive_another_monitors_presets(self):
        result, state = self.invoke("day", [{**LG, "serial": "another-monitor"}])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call[0] == "ddcutil" for call in state["calls"]))
        self.assertIn(["hyprctl", "hyprsunset", "identity"], state["calls"])

    def test_failed_write_restores_prior_rgb_and_restarts_software_service(self):
        result, state = self.invoke("night", [LG], fail="14", preset=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(state["rgb"], {"16": 50, "18": 59, "1A": 63})
        self.assertEqual(state["preset"], 5)
        self.assertEqual(state["calls"][-1], ["systemctl", "--user", "start", "hyprsunset.service"])

    def test_status_is_read_only(self):
        result, state = self.invoke("status", [LG])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Selected backend: monitor presets", result.stdout)
        self.assertFalse(any("setvcp" in call or call[0] == "systemctl" or "hyprsunset" in call for call in state["calls"]))

    def test_disabled_laptop_does_not_force_global_filter(self):
        result, _ = self.invoke("night", [LG, {**LAPTOP, "disabled": True}])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("monitor presets", result.stdout)

    def test_duplicate_serials_fail_without_writes(self):
        result, state = self.invoke("night", [LG, {**LG, "name": "HDMI-A-1"}])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("setvcp" in call for call in state["calls"]))

    def test_unconfigured_or_disabled_serial_collision_fails_without_writes(self):
        for disabled in (False, True):
            with self.subTest(disabled=disabled):
                other = {**LAPTOP, "serial": LG["serial"], "disabled": disabled}
                result, state = self.invoke("night", [LG, other])
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any("setvcp" in call for call in state["calls"]))

    def test_unmanaged_software_filter_blocks_hardware_writes(self):
        result, state = self.invoke("night", [LG], unmanaged=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside its user service", result.stderr)
        self.assertFalse(any("setvcp" in call for call in state["calls"]))

    def test_failed_restoration_leaves_software_service_stopped(self):
        result, state = self.invoke("night", [LG], fail="14", fail_restore=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Color restoration failed", result.stderr)
        self.assertNotIn(["systemctl", "--user", "start", "hyprsunset.service"], state["calls"])

    def test_preflight_read_errors_do_not_change_service_or_colors(self):
        for options in ({"fail_read": True}, {"bad_number": True}):
            with self.subTest(options=options):
                result, state = self.invoke("night", [LG], **options)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call[0] == "systemctl" or "setvcp" in call for call in state["calls"]))

    def test_day_restores_custom_rgb_from_factory_warm(self):
        result, state = self.invoke("day", [LG], rgb={"16": 50, "18": 50, "1A": 35}, preset=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state["preset"], 11)
        self.assertEqual(state["rgb"], {"16": 50, "18": 59, "1A": 63})
        writes = [call[-2:] for call in state["calls"] if "setvcp" in call]
        self.assertEqual(writes[0], ["14", "11"])

    def test_status_reads_factory_warm_without_changing_it(self):
        result, state = self.invoke("status", [LG], preset=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("preset 0x05", result.stdout)
        self.assertEqual(state["preset"], 5)
        self.assertFalse(any("setvcp" in call for call in state["calls"]))


if __name__ == "__main__":
    unittest.main()
