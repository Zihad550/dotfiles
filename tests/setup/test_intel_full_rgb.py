import importlib.machinery
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True  # the helper lives in a tracked dir with no .gitignore
ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader(
    "intel_full_rgb", str(ROOT / "setup/oneoff/intel-full-rgb/intel-full-rgb")
)
spec = importlib.util.spec_from_loader(loader.name, loader)
rgb = importlib.util.module_from_spec(spec)
loader.exec_module(rgb)


def dump(value=0, connector=211, prop=217):
    return f"""Connector 99 (HDMI-A-1)
    100 Broadcast RGB:
        enums: Automatic=0 Full=1 Limited 16:235=2
        value: 0
Connector {connector} (DP-1)
    90 EDID:
        value: 0
    {prop} Broadcast RGB:
        flags: enum
        enums: Automatic=0 Full=1 Limited 16:235=2
        value: {value}
Connector 301 (DP-2)
    302 Broadcast RGB:
        enums: Automatic=0 Full=1 Limited 16:235=2
        value: 0
"""


class FullRgbTests(unittest.TestCase):
    def test_only_target_property_with_changed_ids(self):
        self.assertEqual(rgb.broadcast_rgb(dump()), (211, 217, 0))
        self.assertEqual(rgb.broadcast_rgb(dump(1, 456, 789)), (456, 789, 1))

    def test_missing_property_does_not_use_other_connector(self):
        with self.assertRaises(RuntimeError):
            rgb.broadcast_rgb(dump().replace("217 Broadcast RGB:", "217 Something else:"))

    def test_missing_target(self):
        with self.assertRaises(RuntimeError):
            rgb.broadcast_rgb(dump().replace("(DP-1)", "(DP-3)"))

    def test_unexpected_enum(self):
        with self.assertRaises(RuntimeError):
            rgb.broadcast_rgb(dump().replace("Full=1", "Full=3"))

    def test_set_and_verify(self):
        with patch.object(rgb, "find_device", return_value=Path("/dev/dri/card7")), \
                patch.object(rgb, "proptest", side_effect=[dump(), "", dump(1)]) as run:
            rgb.apply()
            self.assertEqual(run.call_args_list[1].args, (211, "connector", 217, 1))

    def test_already_full_does_not_write(self):
        with patch.object(rgb, "find_device", return_value=Path("/dev/dri/card7")), \
                patch.object(rgb, "proptest", return_value=dump(1)) as run:
            rgb.apply()
            self.assertEqual([call.args for call in run.call_args_list], [()] * 2)

    def test_readback_failure(self):
        with patch.object(rgb, "find_device", return_value=Path("/dev/dri/card7")), \
                patch.object(rgb, "proptest", side_effect=[dump(), "", dump()]):
            with self.assertRaisesRegex(RuntimeError, "did not read back"):
                rgb.apply()

    def test_permission_error_is_diagnostic(self):
        result = subprocess.CompletedProcess([], 243, "", "Permission denied")
        with patch.object(rgb.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "243.*Permission denied"):
                rgb.proptest(211, "connector", 217, 1)

    def test_readiness_retry_and_deadline(self):
        with patch.object(rgb, "find_device", side_effect=RuntimeError("not ready")), \
                patch.object(rgb.time, "monotonic", side_effect=[0, 1, 15]), \
                patch.object(rgb.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "after 15s"):
                rgb.apply()
            sleep.assert_called_once_with(0.5)

    def test_disconnected_port_skips_without_waiting(self):
        with patch.object(rgb, "find_device", side_effect=rgb.Disconnected("off")), \
                patch.object(rgb, "proptest") as run, \
                patch.object(rgb.time, "sleep") as sleep:
            with self.assertRaises(rgb.Disconnected):
                rgb.apply()
            run.assert_not_called()
            sleep.assert_not_called()

    def test_discovery_requires_one_i915_card_with_connected_port(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            drm, dev = root / "drm", root / "dev"
            drm.mkdir()
            dev.mkdir()

            def card(number, driver, status="connected", port="DP-1"):
                device = drm / f"card{number}" / "device"
                device.mkdir(parents=True)
                (device / "driver").symlink_to(root / driver)
                connector = drm / f"card{number}-{port}"
                connector.mkdir()
                (connector / "status").write_text(status)
                (dev / f"card{number}").touch()

            def find():
                with patch.object(rgb, "DRM", drm), patch.object(rgb, "DEV", dev):
                    return rgb.find_device()

            card(0, "amdgpu")
            card(7, "i915", port="DP-2")
            with self.assertRaises(FileNotFoundError):
                find()
            card_dp1 = drm / "card7-DP-1"
            card_dp1.mkdir()
            (card_dp1 / "status").write_text("disconnected")
            with self.assertRaisesRegex(rgb.Disconnected, "disconnected"):
                find()
            (card_dp1 / "status").write_text("unknown")
            with self.assertRaisesRegex(RuntimeError, "status is unknown"):
                find()
            (card_dp1 / "status").write_text("connected")
            self.assertEqual(find(), dev / "card7")
            card(8, "i915")
            with self.assertRaisesRegex(RuntimeError, "found 2"):
                find()


class InstallerTests(unittest.TestCase):
    def test_install_update_and_rollback_preserve_earlier_attempt(self):
        installer = ROOT / "setup/oneoff/intel-full-rgb/setup-intel-full-rgb"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            commands = root / "bin"
            commands.mkdir()
            sudo = commands / "sudo"
            sudo.write_text("""#!/usr/bin/python3
import os
from pathlib import Path
import subprocess
import sys
args = sys.argv[1:]
with open(os.environ['TRACE'], 'a') as trace:
    trace.write(' '.join(args) + '\\n')
if args[0] in ('systemctl', 'udevadm', 'pacman'):
    sys.exit(0)
prefixes = ('/usr/local/', '/etc/', '/var/lib/')
args = [os.environ['FAKE_ROOT'] + arg if arg.startswith(prefixes) else arg
        for arg in args]
sys.exit(subprocess.run(args).returncode)
""")
            sudo.chmod(0o755)
            env = {**os.environ, "PATH": f"{commands}:{os.environ['PATH']}",
                   "FAKE_ROOT": tmp, "TRACE": str(root / "trace")}
            helper = root / "usr/local/bin/intel-full-rgb"
            rule = root / "etc/udev/rules.d/80-i915-full-rgb.rules"
            unit = root / "etc/systemd/system/intel-full-rgb.service"
            for path in (helper, rule, unit):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(f"original {path.name}")

            def run(*args):
                subprocess.run(["bash", str(installer), *args], env=env,
                               check=True, capture_output=True, text=True)

            run("--uninstall")
            self.assertEqual(helper.read_text(), "original intel-full-rgb")
            run()
            self.assertFalse(rule.exists())
            self.assertIn("def apply", helper.read_text())
            run()
            run("--uninstall")
            for path in (helper, rule, unit):
                self.assertEqual(path.read_text(), f"original {path.name}")
            run("--uninstall")
            helper.unlink()
            rule.unlink()
            unit.unlink()
            run()
            run("--uninstall")
            self.assertFalse(any(path.exists() for path in (helper, rule, unit)))
            trace = (root / "trace").read_text()
            self.assertNotIn("systemctl start", trace)
            self.assertNotIn("systemctl enable --now", trace)


if __name__ == "__main__":
    unittest.main()
