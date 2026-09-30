import os
from pathlib import Path
import subprocess
import tempfile
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[2]
with (ROOT / "worktrunk/.config/worktrunk/config.toml").open("rb") as config:
    COMMAND = tomllib.load(config)["commit"]["generation"]["command"]


class CommitMessageTests(unittest.TestCase):
    def generate(self, message="fix: reject missing commit output", status=0):
        with tempfile.TemporaryDirectory() as directory:
            mock = Path(directory) / "codex"
            mock.write_text("""#!/usr/bin/env python3
import os
from pathlib import Path
import sys

args = sys.argv[1:]
assert sys.stdin.read() == 'test prompt\\n'
instructions = next(arg.split('=', 1)[1] for arg in args if arg.startswith('model_instructions_file='))
assert 'commit message' in Path(instructions.strip('"')).read_text()
assert args[args.index('-m') + 1] == 'gpt-6-luna'
print('{"type":"thread.started"}')
if '--output-last-message' in args:
    Path(args[args.index('--output-last-message') + 1]).write_text(os.environ['TEST_MESSAGE'])
else:
    print('{"type":"item.completed","item":{"type":"agent_message","text":"null"}}')
sys.exit(int(os.environ['TEST_STATUS']))
""")
            mock.chmod(0o755)
            result = subprocess.run(
                COMMAND, shell=True, input="test prompt\n", text=True,
                capture_output=True,
                env={**os.environ, "PATH": f"{directory}:{ROOT / 'bin'}:{os.environ['PATH']}",
                     "TMPDIR": directory, "TEST_MESSAGE": message, "TEST_STATUS": str(status)},
            )
            self.assertEqual(sorted(path.name for path in Path(directory).iterdir()), ["codex"])
            return result

    def test_success_prints_only_final_message(self):
        message = "fix: reject missing commit output\n\nPreserve generator errors.\n"
        result = self.generate(message)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, message)

    def test_codex_failure_prints_no_message(self):
        result = self.generate(status=7)
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_invalid_messages_fail_without_output(self):
        for message in ["", " \n\t", "null", " null\n"]:
            with self.subTest(message=message):
                result = self.generate(message)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
