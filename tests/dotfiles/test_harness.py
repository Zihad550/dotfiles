import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class HarnessTests(unittest.TestCase):
    def run_harness(self, args=(), prompt="hello\n", backend="codex", reply="reply", status=0, missing=False, overrides=None):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            mock = folder / backend
            mock.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
Path(os.environ['CALLS']).write_text(json.dumps({'args': args, 'prompt': sys.stdin.read(), 'thinking': os.environ.get('MAX_THINKING_TOKENS')}))
print('progress' if 'exec' in args else os.environ['REPLY'])
if '--output-last-message' in args and os.environ['MISSING'] != '1':
    Path(args[args.index('--output-last-message') + 1]).write_text(os.environ['REPLY'])
sys.exit(int(os.environ['STATUS']))
''')
            mock.chmod(0o755)
            calls = folder / 'calls'
            env = {**os.environ, 'PATH': f"{folder}:/usr/bin:/bin", 'TMPDIR': directory,
                   'CALLS': str(calls), 'REPLY': reply, 'STATUS': str(status),
                   'MISSING': '1' if missing else '0', 'DF_HARNESS_MODEL': '',
                   'DF_HARNESS_REASONING': '', 'DF_HARNESS_INSTRUCTIONS': ''}
            env.update(overrides or {})
            result = subprocess.run([str(ROOT / 'bin/df-harness'), *args], input=prompt,
                                    text=True, capture_output=True, env=env)
            recorded = json.loads(calls.read_text()) if calls.exists() else None
            self.assertFalse(any(path.is_dir() for path in folder.iterdir()))
            return result, recorded

    def test_arguments_and_stdin(self):
        for args, prompt, expected in [((), 'hello\n', 'hello\n'),
                                       (('codex', 'hello', 'world'), '', 'hello world\n'),
                                       (('--', 'claude'), '', 'claude\n')]:
            with self.subTest(args=args):
                result, calls = self.run_harness(args, prompt)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, 'reply\n')
                self.assertEqual(calls['prompt'], expected)
                self.assertIn('model_reasoning_effort=none', calls['args'])
                self.assertIn('gpt-6-luna', calls['args'])
                self.assertIn('--skip-git-repo-check', calls['args'])

    def test_claude_defaults_and_multiline_reply(self):
        result, calls = self.run_harness(('claude',), backend='claude', reply='first\nsecond')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'first\nsecond\n')
        self.assertIn('--model=sonnet', calls['args'])
        self.assertIn('--tools=', calls['args'])
        self.assertIn('--no-session-persistence', calls['args'])
        self.assertEqual(calls['thinking'], '0')

    def test_overrides(self):
        for backend in ['codex', 'claude']:
            with self.subTest(backend=backend):
                result, calls = self.run_harness((backend,), backend=backend,
                    overrides={'DF_HARNESS_MODEL': 'custom', 'DF_HARNESS_REASONING': 'high',
                               'DF_HARNESS_INSTRUCTIONS': 'Custom instructions'})
                self.assertEqual(result.returncode, 0, result.stderr)
                if backend == 'codex':
                    self.assertIn('custom', calls['args'])
                    self.assertIn('model_reasoning_effort=high', calls['args'])
                else:
                    self.assertIn('--model=custom', calls['args'])
                    self.assertIn('--system-prompt=Custom instructions', calls['args'])

    def test_empty_input(self):
        result, calls = self.run_harness(prompt=' \n\t')
        self.assertEqual(result.returncode, 2)
        self.assertIsNone(calls)

    def test_missing_output(self):
        result, _ = self.run_harness(missing=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')

    def test_failure_and_invalid_replies(self):
        for backend in ['codex', 'claude']:
            for reply, status in [('reply', 7), ('', 0), (' \n\t', 0), ('null', 0)]:
                with self.subTest(backend=backend, reply=reply, status=status):
                    result, _ = self.run_harness((backend,), backend=backend, reply=reply, status=status)
                    self.assertEqual(result.returncode, status or 1)
                    self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
