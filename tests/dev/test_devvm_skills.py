import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'setup/devvm/setup-skills'


class DevvmSkillsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='devvm-skills-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.bin = self.home / 'bin'
        self.bin.mkdir()
        self.calls = self.home / 'calls'
        self.env = dict(os.environ, HOME=str(self.home), DOTFILES_DIR=str(ROOT),
                        PATH=f'{self.bin}:/usr/bin:/bin',
                        XDG_DATA_HOME=str(self.home / 'data'),
                        XDG_CONFIG_HOME=str(self.home / 'config'),
                        CALLS=str(self.calls))
        (self.home / '.config/zsh-devvm').mkdir(parents=True)
        (self.home / '.config/zsh-devvm/.zshrc').write_text('# existing shell\n')
        self.stub('mise', '''printf 'mise %s\n' "$*" >> "$CALLS"
[[ ! -e "$HOME/fail" ]] || exit 1
''')
        self.stub('skills', '''printf 'skills %s\n' "$*" >> "$CALLS"
for agent in claude codex; do
    printf 'installed\n' > "$HOME/.$agent/skills/from-cli"
done
''')
        self.stub('git', 'mkdir -p "${@: -1}/.git"\n')
        self.stub('curl', '\n'.join([
            'while (($#)); do',
            '  if [[ "$1" == -o ]]; then printf "fixture skill\\n" > "$2"; exit 0; fi',
            '  shift',
            'done',
            'exit 1',
        ]) + '\n')
        self.stub('claude', 'echo unexpected-plugin-call >> "$CALLS"; exit 1\n')

    def stub(self, name, script):
        path = self.bin / name
        path.write_text('#!/usr/bin/env bash\nset -e\n' + script)
        path.chmod(0o755)

    def run_setup(self, *args):
        return subprocess.run(['bash', str(SCRIPT), *args], env=self.env,
                              text=True, capture_output=True)

    def test_installs_locally_and_reconnects_after_devvm_restores_store_link(self):
        store = self.home / 'readonly-store'
        store.mkdir()
        (store / 'host-skill').write_text('unchanged')
        for agent in ('claude', 'codex'):
            target = self.home / f'.{agent}/skills'
            target.parent.mkdir()
            target.symlink_to(store)
        result = self.run_setup('--ensure')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text()
        self.assertLess(calls.index('mise use -g node@24'), calls.index('mise use -g npm:skills'))
        self.assertIn(f'skills add {self.home}/dev/src/github.com/Zihad550/skills ', calls)
        self.assertNotIn('unexpected-plugin-call', calls)
        self.assertTrue(all('--copy' in line for line in calls.splitlines() if line.startswith('skills ')))
        self.assertIn('--ensure', (self.home / '.bashrc.d/00-dotfiles-skills.sh').read_text())
        zshrc = self.home / '.config/zsh-devvm/.zshrc'
        self.assertEqual(zshrc.read_text().count('--ensure'), 1)
        self.assertEqual(list(store.iterdir()), [store / 'host-skill'])
        for agent in ('claude', 'codex'):
            target = self.home / f'.{agent}/skills'
            self.assertEqual((target / 'from-cli').read_text(), 'installed\n')
            target.unlink()
            target.symlink_to(store)
        result = subprocess.run(['bash', str(self.home / '.bashrc.d/00-dotfiles-skills.sh')],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls.read_text(), calls)
        self.assertEqual(zshrc.read_text().count('--ensure'), 1)
        self.assertTrue((self.home / '.claude/skills/from-cli').exists())
        self.assertEqual(self.run_setup().returncode, 0)
        self.assertGreater(len(self.calls.read_text()), len(calls))

    def test_failure_retries_and_keeps_existing_vm_skills(self):
        target = self.home / '.codex/skills'
        target.mkdir(parents=True)
        (target / 'existing').write_text('keep')
        (self.home / 'fail').touch()
        self.assertNotEqual(self.run_setup('--ensure').returncode, 0)
        self.assertFalse((self.home / 'data/dotfiles/devvm-skills/installed').exists())
        self.assertEqual((target / 'existing').read_text(), 'keep')
        (self.home / 'fail').unlink()
        result = self.run_setup('--ensure')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.home / 'data/dotfiles/devvm-skills/installed').exists())


if __name__ == '__main__':
    unittest.main()
