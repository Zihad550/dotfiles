import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which('stow'), 'GNU Stow is required')
class PortableInstallTests(unittest.TestCase):
    def test_links_portable_configuration_without_a_desktop_checkout(self):
        with tempfile.TemporaryDirectory(prefix='portable-install-') as directory:
            home = Path(directory)
            env = dict(os.environ, HOME=str(home), DOTFILES=str(ROOT), DOTFILES_DIR=str(ROOT),
                       XDG_CONFIG_HOME=str(home / '.config'), XDG_DATA_HOME=str(home / '.local/share'))
            result = subprocess.run(['bash', str(ROOT / 'scripts/stow/stow-base')], cwd=home,
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for source, target in [
                ('zsh/.config/zsh/.zshrc', '.config/zsh/.zshrc'),
                ('herdr/.config/herdr/config.toml', '.config/herdr/config.toml'),
                ('lazygit/.config/lazygit/config.yml', '.config/lazygit/config.yml'),
                ('claude/.claude/settings.json', '.claude/settings.json'),
            ]:
                self.assertEqual((home / target).resolve(), ROOT / source)
            theme = home / '.config/theme/lazygit.yml'
            theme.parent.mkdir()
            theme.write_text('local colors')
            config = home / '.config/lazygit/config.yml'
            config.unlink()
            config.symlink_to(theme)
            rerun = subprocess.run(['bash', str(ROOT / 'scripts/stow/stow-base')], cwd=home,
                                   env=env, text=True, capture_output=True)
            self.assertEqual(rerun.returncode, 0, rerun.stderr)
            self.assertEqual(config.resolve(), theme)
            for desktop_config in ['hypr', 'quickshell', 'kanata', 'voxtype', 'dotfiles']:
                self.assertFalse((home / '.config' / desktop_config).exists(), desktop_config)


if __name__ == '__main__':
    unittest.main()
