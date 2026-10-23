import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
LG = "Display 3\n   I2C bus: /dev/i2c-7\n   Monitor: GSM:LG FULL HD:hdmi-serial\n"
OTHER = "Display 1\n   I2C bus: /dev/i2c-5\n   Monitor: DEL:DELL U3011:dell\n"
FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
path = Path(os.environ["INPUT_TEST_LOG"])
calls = json.loads(path.read_text())
calls.append([Path(sys.argv[0]).name, *sys.argv[1:]])
path.write_text(json.dumps(calls))
if Path(sys.argv[0]).name == "ddcutil":
    if "detect" in sys.argv:
        print(os.environ["INPUT_TEST_DETECT"])
    elif "getvcp" in sys.argv:
        print(os.environ["INPUT_TEST_VALUE"])
    if os.environ.get("INPUT_TEST_FAIL") in sys.argv:
        print("DDC unavailable", file=sys.stderr)
        sys.exit(1)
'''


class MonitorInputTests(unittest.TestCase):
    def invoke(self, source, detected=OTHER + LG, value="VCP 60 SNC x04", fail="", options=()):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ("ddcutil", "notify-send"):
                tool = folder / name
                tool.write_text(FAKE)
                tool.chmod(0o755)
            log = folder / "calls.json"
            log.write_text("[]")
            env = {**os.environ, "PATH": f"{folder}:/usr/bin:/bin", "XDG_RUNTIME_DIR": directory,
                   "INPUT_TEST_LOG": str(log), "INPUT_TEST_DETECT": detected,
                   "INPUT_TEST_VALUE": value, "INPUT_TEST_FAIL": fail,
                   "DF_MONITOR_PRESETS": "/does/not/exist"}
            result = subprocess.run([str(ROOT / "bin/df-monitor"), "input", source, *options],
                                    env=env, capture_output=True, text=True, timeout=15)
            return result, json.loads(log.read_text())

    def test_toggle_both_directions_uses_detected_lg_not_display_one(self):
        for current, target in (("x04", "0x01"), ("x01", "0x04")):
            with self.subTest(current=current):
                result, calls = self.invoke("toggle", value=f"VCP 60 SNC {current}")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(calls[-1], ["ddcutil", "--display", "3", "setvcp", "60", target])
                self.assertIn(["ddcutil", "--display", "3", "--terse", "getvcp", "60"], calls)

    def test_explicit_commands_do_not_need_current_input(self):
        for source, target in (("vga", "0x01"), ("hdmi1", "0x04")):
            result, calls = self.invoke(source)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(calls[-1][-3:], ["setvcp", "60", target])
            self.assertFalse(any("getvcp" in call for call in calls))

    def test_no_lg_invalid_display_or_ambiguous_lg_cannot_write(self):
        invalid = LG.replace("Display 3", "Invalid display")
        for detected in (OTHER, invalid, LG + LG.replace("3", "4")):
            result, calls = self.invoke("toggle", detected=detected)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any("setvcp" in call or "getvcp" in call for call in calls))

    def test_serial_can_disambiguate_two_lgs(self):
        other_lg = LG.replace("Display 3", "Display 4").replace("hdmi-serial", "other")
        result, calls = self.invoke("vga", detected=LG + other_lg, options=("--serial", "hdmi-serial"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[-1][1:3], ["--display", "3"])

    def test_unknown_or_malformed_input_does_not_write(self):
        for value in ("VCP 60 SNC x11", "VCP 60 SNC x0f", "VCP 60 C 17 255", "VCP 60 SNC invalid", "garbage"):
            result, calls = self.invoke("toggle", value=value)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any("setvcp" in call for call in calls))

    def test_failures_notify_only_when_requested(self):
        for failure in ("detect", "getvcp", "setvcp"):
            for notify in (False, True):
                result, calls = self.invoke("toggle", fail=failure, options=("--notify",) if notify else ())
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(any(call[0] == "notify-send" for call in calls), notify)
                self.assertIn("DDC unavailable", result.stderr)


if __name__ == "__main__":
    unittest.main()
