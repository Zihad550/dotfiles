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
SCRIPT = ROOT / "bin/df-devvm-audit"
loader = importlib.machinery.SourceFileLoader("devvm_audit", str(SCRIPT))
spec = importlib.util.spec_from_loader(loader.name, loader)
audit = importlib.util.module_from_spec(spec)
loader.exec_module(audit)


class DevvmAuditTests(unittest.TestCase):
    def test_finds_secrets_without_reporting_values_or_following_directory_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            token = "sk-ant-api03-" + "A" * 40
            (root / "session.jsonl").write_text(json.dumps({"output": token, "path": ".env.production"}))
            (root / "auth.json").write_text('{"access_token":"sensitive-value"}')
            (root / "linked").symlink_to(root / "session.jsonl")
            (root / "linked-dir").symlink_to(root, target_is_directory=True)
            (root / "session.db").write_bytes(b"SQLite format 3\0")
            (root / "settings.json").write_text('{"hooks":{},"mcpServers":{}}')
            os.mkfifo(root / "pipe")
            report = audit.scan([root])
            serialized = json.dumps(report)
            self.assertNotIn(token, serialized)
            self.assertNotIn("sensitive-value", serialized)
            categories = report["summary"]["categories"]
            self.assertIn("provider-token", categories)
            self.assertIn("credential-file", categories)
            self.assertIn("credential-assignment", categories)
            self.assertIn("sensitive-file-reference", categories)
            self.assertIn("executable-setting", categories)
            self.assertEqual(report["summary"]["uninspected"], 3)
            self.assertEqual(report["recommendation"], "REVIEW BEFORE COPYING")

    def test_toml_and_escaped_transcripts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config.toml").write_text('[mcp_servers.helper]\ncommand = "sh"\n')
            (root / "session.jsonl").write_text(json.dumps({"output": '{"password":"example-password"}'}))
            report = audit.scan([root])
            self.assertEqual(report["summary"]["categories"]["executable-setting"], 1)
            self.assertEqual(report["summary"]["categories"]["credential-assignment"], 1)

    def test_detects_token_across_chunk_boundary_and_reports_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.jsonl"
            path.write_bytes(b" " * (audit.CHUNK - 5) + b"sk-ant-api03-" + b"A" * 40)
            findings, reason = audit.inspect_file(path)
            self.assertIn("provider-token", findings)
            self.assertIsNone(reason)
            with patch.object(audit, "LIMIT", 16):
                _, reason = audit.inspect_file(path)
                self.assertIsNotNone(reason)

    def test_agent_only_receives_aggregate_counts(self):
        report = {"summary": {"entries": 2, "categories": {"private-key": 1}},
                  "files": [{"path": "/private/project/SECRET"}]}
        with patch.object(audit.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, "Review first", "")
            self.assertEqual(audit.agent_advice(report, "claude"), "Review first")
            args, kwargs = run.call_args
            self.assertEqual(args[0], [str(ROOT / "bin/df-harness"), "claude"])
            self.assertEqual(json.loads(kwargs["input"]), report["summary"])
            self.assertNotIn("SECRET", json.dumps(kwargs))
            run.return_value = subprocess.CompletedProcess([], 1, "", "secret error")
            with self.assertRaisesRegex(RuntimeError, "agent failed"):
                audit.agent_advice(report, "claude")

    def test_cli_local_mode_and_missing_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "session.jsonl").write_text('{"message":"fix the tests"}')
            result = subprocess.run([str(SCRIPT), "--agent", "none", "--root", directory, "--json"],
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["summary"]["entries"], 1)
            self.assertIn("NO INDICATORS", report["recommendation"])
            result = subprocess.run([str(SCRIPT), "--agent", "none", "--root", str(root / "missing"), "--json"],
                                    text=True, capture_output=True)
            self.assertIn("NO DATA", json.loads(result.stdout)["recommendation"])

    def test_claude_audit_uses_opus_alias_through_harness(self):
        with tempfile.TemporaryDirectory() as directory:
            mock = Path(directory) / "claude"
            mock.write_text("#!/usr/bin/env python3\nimport json, sys\nprint(json.dumps(sys.argv[1:]))\n")
            mock.chmod(0o755)
            with patch.dict(os.environ, {"PATH": f"{directory}:{os.environ['PATH']}",
                                         "DF_HARNESS_MODEL": "sonnet"}):
                args = json.loads(audit.agent_advice({"summary": {"entries": 0}}, "claude"))
            self.assertIn("--model=opus", args)
            self.assertNotIn("--model=sonnet", args)


if __name__ == "__main__":
    unittest.main()
