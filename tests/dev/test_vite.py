import importlib.machinery
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader("df_vite", str(ROOT / "bin/df-vite"))
spec = importlib.util.spec_from_loader(loader.name, loader)
vite = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = vite
loader.exec_module(vite)


class DetectionTests(unittest.TestCase):
    def test_dev_commands_and_unrelated_processes(self):
        for command in (["node", "/project/node_modules/vite/bin/vite.js"],
                        ["bun", "/project/node_modules/.bin/vite", "--host"],
                        ["node", "/project/node_modules/.bin/vite", "dev"],
                        ["node", "--inspect", "/project/node_modules/vite/bin/vite.js"],
                        ["bun", "run", "/project/node_modules/.bin/vite"]):
            with self.subTest(command=command):
                self.assertTrue(vite.is_vite_dev(command))
        for command in (["npm", "exec", "vite"], ["node", "server.js"],
                        ["node", "vite.js", "build"], ["node", "vite.js", "preview"],
                        ["node", "server.js", "vite"],
                        ["node", "--require", "vite.js", "server.js"],
                        ["node", "--eval", "vite"], ["python3", "vite.js"], []):
            with self.subTest(command=command):
                self.assertFalse(vite.is_vite_dev(command))

    def test_directory_cannot_inject_picker_rows(self):
        row = vite.Server(123, "1", (5173,), "/project\n\x1b[31m").row()
        self.assertNotIn("\n", row)
        self.assertNotIn("\x1b", row)

    def test_refresh_with_empty_list_keeps_picker_open(self):
        responses = [subprocess.CompletedProcess([], 1, "r\n"),
                     subprocess.CompletedProcess([], 130, "")]
        with patch.object(sys, "argv", ["df-vite"]), \
                patch.object(sys.stdin, "isatty", return_value=True), \
                patch.object(vite.shutil, "which", return_value="/usr/bin/fzf"), \
                patch.object(vite, "servers", return_value=[]), \
                patch.object(vite.subprocess, "run", side_effect=responses) as picker:
            self.assertEqual(vite.main(), 0)
        self.assertEqual(picker.call_count, 2)


@unittest.skipUnless(shutil.which("node"), "node is required for live process checks")
class ProcessTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="df-vite-test-")
        self.addCleanup(self.directory.cleanup)

    def start_server(self, filename="vite.js", arguments=()):
        script = Path(self.directory.name) / filename
        script.write_text(
            "const net = require('node:net');\n"
            "const server = net.createServer();\n"
            "server.listen(0, '127.0.0.1', () => console.log(server.address().port));\n"
        )
        process = subprocess.Popen(["node", str(script), *arguments],
                                   cwd=self.directory.name, stdout=subprocess.PIPE, text=True)
        self.addCleanup(self.cleanup_process, process)
        port = int(process.stdout.readline())
        return process, port

    @staticmethod
    def cleanup_process(process):
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=5)
        process.stdout.close()

    def test_discover_and_stop_only_selected_server(self):
        selected, port = self.start_server()
        other, other_port = self.start_server()
        unrelated, _ = self.start_server("server.js", arguments=("vite",))
        running = {server.pid: server for server in vite.servers()}
        self.assertEqual(running[selected.pid].ports, (port,))
        self.assertEqual(running[other.pid].ports, (other_port,))
        self.assertEqual(running[selected.pid].directory, self.directory.name)
        self.assertNotIn(unrelated.pid, running)
        self.assertIn("Stopped", vite.stop_server(running[selected.pid]))
        selected.wait(timeout=5)
        self.assertIsNone(other.poll())
        self.assertIsNone(unrelated.poll())
        self.assertNotIn(selected.pid, {server.pid for server in vite.servers()})

    def test_preview_listener_is_excluded(self):
        process, _ = self.start_server(arguments=("preview",))
        self.assertNotIn(process.pid, {server.pid for server in vite.servers()})

    def test_stale_identity_and_exited_server_are_not_signalled(self):
        process, _ = self.start_server()
        current = next(server for server in vite.servers() if server.pid == process.pid)
        stale = vite.Server(current.pid, "wrong-start-time", current.ports, current.directory)
        self.assertIn("changed", vite.stop_server(stale))
        self.assertIsNone(process.poll())
        process.terminate()
        process.wait(timeout=5)
        self.assertIn("already exited", vite.stop_server(current))

    def test_picker_d_stops_selected_server_and_refreshes(self):
        process, _ = self.start_server()
        server = next(server for server in vite.servers() if server.pid == process.pid)
        responses = [subprocess.CompletedProcess([], 0, "d\n" + server.row() + "\n"),
                     subprocess.CompletedProcess([], 130, "")]
        with patch.object(sys, "argv", ["df-vite"]), \
                patch.object(sys.stdin, "isatty", return_value=True), \
                patch.object(vite.subprocess, "run", side_effect=responses) as picker:
            self.assertEqual(vite.main(), 0)
        self.assertEqual(picker.call_count, 2)
        self.assertNotIn(server.row(), picker.call_args.kwargs["input"])
        process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
