import json
import os
from pathlib import Path
import pty
import shlex
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'bin/df-devvm-auto'
HOOK = ROOT / 'zsh/.config/zsh/devvm.zsh'


class DevvmAutoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='devvm-auto-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.project = self.home / 'project with spaces'
        self.child = self.project / 'nested worktree'
        self.child.mkdir(parents=True)
        (self.child / '.git').write_text('gitdir: ../primary/.git/worktrees/feature\n')
        self.bin = self.home / 'bin'
        self.bin.mkdir()
        self.calls = self.home / 'calls'
        self.inventory = self.home / 'vms.json'
        self.set_inventory(self.project)
        self.env = dict(os.environ, HOME=str(self.home),
                        XDG_CONFIG_HOME=str(self.home / 'config'),
                        XDG_DATA_HOME=str(self.home / 'data'),
                        PATH=f'{self.bin}:{ROOT / "bin"}:/usr/bin:/bin',
                        INVENTORY=str(self.inventory), CALLS=str(self.calls),
                        DEVVM_AUTO_ENTER='1', RETURN_TO='', ZDOTDIR=str(self.home))
        for name in ('DEVVM_ZSH', 'DF_DEVVM_AUTO_ROOT', 'DF_DEVVM_AUTO_RETURN'):
            self.env.pop(name, None)
        self.stub('devvm', '''printf 'devvm %s\n' "$*" >> "$CALLS"
if [[ "$*" == 'ls --json' ]]; then cat "$INVENTORY"
elif [[ "$*" == 'host --here --ssh-config --no-input' ]]; then exit 0
else echo 'unexpected command' >&2; exit 99; fi
''')
        self.stub('ssh', r'''printf 'ssh %s\n' "$*" >> "$CALLS"
if [[ ${*: -1} == 'bash -s' ]]; then cat >/dev/null; fi
if [[ ${*: -1} == 'if [ -f '* && -n $RETURN_TO ]]; then
    printf '%s\0' "$RETURN_TO"
fi
''')
        self.stub('code', 'printf "code %s\\n" "$*" >> "$CALLS"\n')

    def stub(self, name, text):
        p = self.bin / name
        p.write_text('#!/usr/bin/env bash\nset -e\n' + text)
        p.chmod(0o755)

    def set_inventory(self, *roots):
        self.inventory.write_text(json.dumps({'version': 1, 'vms': [
            {'name': f'devvm-test-{i}', 'folder': str(root),
             'status': 'Stopped', 'folder_state': 'there'}
            for i, root in enumerate(roots)
        ]}))

    def run_helper(self, mode, folder, *args):
        return subprocess.run([str(SCRIPT), mode, str(folder), *map(str, args)],
                              env=self.env, capture_output=True, text=True)

    def run_zsh(self, code, *, tty=True, env=None, interactive=True):
        command = ['zsh', '-df' + ('i' if interactive else ''), '-c', code]
        if not tty:
            result = subprocess.run(command, env=env or self.env, capture_output=True,
                                    text=True, timeout=8)
            return result.returncode, result.stdout + result.stderr
        master, slave = pty.openpty()
        try:
            result = subprocess.run(command, env=env or self.env, stdin=slave,
                                    stdout=slave, stderr=slave, timeout=8)
            os.close(slave)
            slave = None
            output = b''
            while True:
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                output += chunk
            return result.returncode, output.decode(errors='replace')
        finally:
            os.close(master)
            if slave is not None:
                os.close(slave)

    def test_parent_vm_wins_across_git_boundaries_and_prefix_is_not_an_ancestor(self):
        result = self.run_helper('resolve', self.child)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), str(self.project))
        self.set_inventory(self.project, self.child)
        self.assertEqual(self.run_helper('resolve', self.child).stdout.strip(), str(self.child))
        sibling = self.home / 'project with spaces-other'
        sibling.mkdir()
        self.assertNotEqual(self.run_helper('resolve', sibling).returncode, 0)
        self.assertNotIn('host ', self.calls.read_text())

    def test_entry_only_starts_existing_vm_and_returns_directory_separately(self):
        result_file = self.home / 'result'
        self.env['RETURN_TO'] = str(self.home)
        result = self.run_helper('enter', self.child, result_file)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result_file.read_bytes(), os.fsencode(self.home) + b'\0')
        calls = self.calls.read_text()
        self.assertIn('host --here --ssh-config --no-input', calls)
        self.assertIn('ForwardAgent=no', calls)
        self.assertIn('DF_DEVVM_AUTO_ROOT=', calls)
        self.set_inventory()
        self.calls.unlink()
        self.assertNotEqual(self.run_helper('enter', self.child, result_file).returncode, 0)
        self.assertNotIn('host ', self.calls.read_text())

    def test_interactive_hook_enters_once_and_resumes_host_at_returned_directory(self):
        self.env['RETURN_TO'] = str(self.home)
        code = f'source {shlex.quote(str(HOOK))}; cd {shlex.quote(str(self.child))}; print -r -- "HOST:$PWD"'
        status, output = self.run_zsh(code)
        self.assertEqual(status, 0, output)
        self.assertIn(f'HOST:{self.home}\r\n', output)
        self.assertEqual(self.calls.read_text().count('host --here'), 1)

    def test_returning_outside_root_allows_the_next_backend_visit(self):
        self.env['RETURN_TO'] = str(self.home)
        code = (f'source {shlex.quote(str(HOOK))}; '
                f'cd {shlex.quote(str(self.child))}; '
                f'cd {shlex.quote(str(self.child))}')
        status, output = self.run_zsh(code)
        self.assertEqual(status, 0, output)
        self.assertEqual(self.calls.read_text().count('host --here'), 2)

    def test_exit_does_not_reenter_until_leaving_the_project(self):
        code = (f'source {shlex.quote(str(HOOK))}; cd {shlex.quote(str(self.child))}; '
                f'_df_devvm_auto; cd {shlex.quote(str(self.project))}; '
                f'cd {shlex.quote(str(self.home))}; cd {shlex.quote(str(self.child))}')
        status, output = self.run_zsh(code)
        self.assertEqual(status, 0, output)
        self.assertEqual(self.calls.read_text().count('host --here'), 2)

    def test_opt_outs_and_noninteractive_shells_do_not_query_inventory(self):
        code = f'source {shlex.quote(str(HOOK))}; cd {shlex.quote(str(self.child))}'
        for overrides, tty, interactive in [({'DEVVM_AUTO_ENTER': '0'}, True, True),
                                            ({'DEVVM_ZSH': '1'}, True, True),
                                            ({}, False, True), ({}, True, False)]:
            with self.subTest(overrides=overrides, tty=tty, interactive=interactive):
                self.run_zsh(code, tty=tty, interactive=interactive,
                             env=dict(self.env, **overrides))
                self.assertFalse(self.calls.exists())
        (self.project / '.devvm-no-auto').touch()
        self.run_zsh(code)
        self.assertFalse(self.calls.exists())
        (self.project / '.devvm-no-auto').unlink()
        marker = self.home / 'config/devvm/no-auto-enter'
        marker.parent.mkdir(parents=True)
        marker.touch()
        self.run_zsh(code)
        self.assertFalse(self.calls.exists())

    def test_guest_leaving_root_exits_without_nested_vm_lookup(self):
        result_file = self.home / 'return'
        env = dict(self.env, DF_DEVVM_AUTO_ROOT=str(self.project),
                   DF_DEVVM_AUTO_RETURN=str(result_file))
        code = f'source {shlex.quote(str(HOOK))}; cd {shlex.quote(str(self.home))}; print SHOULD_NOT_RUN'
        status, output = self.run_zsh(code, env=env)
        self.assertEqual(status, 0, output)
        self.assertNotIn('SHOULD_NOT_RUN', output)
        self.assertEqual(result_file.read_bytes(), os.fsencode(self.home) + b'\0')
        self.assertFalse(self.calls.exists())

    def check_old_guest(self, shell):
        self.env['TEST_GUEST_SHELL'] = shell
        self.stub('ssh', r'''if [[ $TEST_GUEST_SHELL == bash ]]; then
    command() {
        if [[ "$*" == '-v zsh' ]]; then return 1; fi
        builtin command "$@"
    }
    export -f command
fi
case "${*: -1}" in
    'bash -s') exec bash -s ;;
    *) exec bash -c "${*: -1}" ;;
esac
''')
        (self.home / '.zshrc').write_text('print -r -- EXISTING_RC_LOADED\n')
        (self.home / '.bashrc').write_text('echo EXISTING_RC_LOADED\n')
        result_file = self.home / f'{self.home.name}.result'
        master, slave = pty.openpty()
        try:
            proc = subprocess.Popen([str(SCRIPT), 'enter', str(self.child), str(result_file)],
                                    env=self.env, stdin=slave, stdout=slave, stderr=slave)
            os.write(master, f'cd {shlex.quote(str(self.home))}\n'.encode())
            status = proc.wait(timeout=8)
            os.close(slave)
            slave = None
            output = b''
            while True:
                try:
                    output += os.read(master, 4096)
                except OSError:
                    break
            self.assertEqual(status, 0, output)
            self.assertIn(b'EXISTING_RC_LOADED', output)
            self.assertNotIn(b'recursion limit', output)
            self.assertIn(b'(devvm)', output)
            self.assertEqual(result_file.read_bytes(), os.fsencode(self.home) + b'\0')
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            os.close(master)
            if slave is not None:
                os.close(slave)

    def test_old_zsh_guest_preserves_startup_without_zshenv(self):
        self.check_old_guest('zsh')

    def test_old_bash_guest_has_vm_prompt_and_returns_to_host(self):
        self.check_old_guest('bash')

    def test_editor_uses_existing_vm_and_requested_subfolder(self):
        result = self.run_helper('code', self.child)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'code --remote ssh-remote+devvm-test-0 {self.child}', self.calls.read_text())


if __name__ == '__main__':
    unittest.main()
