import fcntl
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
HOST = ROOT / 'bin/df-devvm-update'
DAILY = ROOT / 'setup/devvm/update-daily'


def stub(directory, name, script):
    path = directory / name
    path.write_text('#!/usr/bin/env bash\nset -e\n' + script)
    path.chmod(0o755)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='devvm-update-')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.bin = self.home / 'bin'
        self.bin.mkdir()
        self.calls = self.home / 'calls'
        self.calls.write_text('')
        self.env = dict(os.environ, HOME=str(self.home), CALLS=str(self.calls),
                        PATH=f'{self.bin}:/usr/bin:/bin',
                        XDG_STATE_HOME=str(self.home / 'state'))

    def lines(self):
        return self.calls.read_text().splitlines()


class HostUpdateTest(Fixture):
    def setUp(self):
        super().setUp()
        self.inventory = self.home / 'vms.json'
        self.env['INVENTORY'] = str(self.inventory)
        stub(self.bin, 'devvm', '''if [[ $1 == ls ]]; then cat "$INVENTORY"; exit; fi
stdin=open; read -r -t 0.1 _ || stdin=closed
printf '%s %s %s\\n' "$PWD" "$*" "$stdin" >> "$CALLS"
[[ ! -e "$PWD/fail" ]]
''')
        # The VM's /opt/dotfiles is a folder per VM name; the remote command
        # really runs, against that folder.
        self.vms = self.home / 'vms'
        stub(self.bin, 'ssh', '''host=${@: -2:1} cmd=${@: -1}
stdin=open; read -r -t 0.1 _ || stdin=closed
printf 'ssh %s %s\\n' "$host" "$stdin" >> "$CALLS"
eval "${cmd//\\/opt\\/dotfiles/$VMS/$host}"
''')
        stub(self.bin, 'git', '''printf 'git %s\\n' "$*" >> "$CALLS"
mkdir -p "$2/setup/devvm/hooks"
cp "$RUN_HOOK" "$2/setup/devvm/run-hook"
printf 'printf "hook %%s ran\\\\n" "$0" >> "$CALLS"; [[ ! -e "$DOTFILES_DIR/fail" ]]\\n' > "$2/setup/devvm/hooks/update"
for hook in other apt-upgrade; do cp "$2/setup/devvm/hooks/update" "$2/setup/devvm/hooks/$hook"; done
''')
        self.env.update(VMS=str(self.vms), RUN_HOOK=str(ROOT / 'setup/devvm/run-hook'))

    def vm(self, name, status='Running', state='there', image='base'):
        folder = self.home / name
        if state == 'there':
            folder.mkdir()
        return {'name': f'devvm-{name}', 'status': status, 'image': image,
                'folder': str(folder), 'folder_state': state}

    def run_host(self, *vms, args=()):
        self.inventory.write_text(json.dumps({'version': 1, 'vms': list(vms)}))
        return subprocess.run([str(HOST), *args], env=self.env, text=True, capture_output=True)

    def hook_ran(self, vm, hook='update'):
        return f"hook {self.vms}/{vm['name']}/setup/devvm/hooks/{hook} ran"

    def test_shell_vms_run_both_hooks_after_their_tools_update(self):
        vm = self.vm('mamacrm', 'Stopped', image='docker+shell+mamacrm')
        result = self.run_host(vm)
        self.assertEqual(result.returncode, 0, result.stderr)
        pull = f"git -C {self.vms}/{vm['name']} pull -q --ff-only"
        self.assertEqual(self.lines(), [
            f"{vm['folder']} tools update --here --no-input closed",
            f"{vm['folder']} host --ssh-config --here --no-input closed",
            f"ssh {vm['name']} closed",
            # The old image has no run-hook: the first pull fetches it, and
            # run-hook pulls again before each hook.
            pull, pull, self.hook_ran(vm), pull, self.hook_ran(vm, 'apt-upgrade'),
            f"{vm['folder']} stop --here --no-input closed",
        ])
        self.assertIn('--> hook apt-upgrade', result.stdout)

    def test_hook_runs_only_that_hook_in_shell_vms(self):
        shell, base = self.vm('dotfiles', image='shell'), self.vm('portfolio', 'Stopped')
        result = self.run_host(shell, base, args=('--hook', 'other'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('devvm-portfolio: skipped, no shell layer', result.stdout)
        self.assertNotIn(f"{base['folder']} ", self.calls.read_text())
        self.assertNotIn('tools update', self.calls.read_text())
        self.assertIn(self.hook_ran(shell, 'other'), self.lines())
        for args in (('--hook',), ('--hook', '../x'), ('--hook', 'a', 'b'), ('--full', 'x')):
            self.assertEqual(self.run_host(shell, args=args).returncode, 64, args)

    def test_a_failed_hook_is_reported_and_the_vm_still_stops(self):
        broken, healthy = self.vm('broken', 'Stopped', image='shell'), self.vm('healthy', image='shell')
        (self.vms / broken['name']).mkdir(parents=True)
        (self.vms / broken['name'] / 'fail').touch()
        result = self.run_host(broken, healthy)
        self.assertEqual(result.returncode, 1)
        self.assertIn('hook update failed', result.stderr)
        self.assertIn('devvm-broken: hooks failed', result.stderr)
        # One failed hook doesn't skip the next.
        self.assertIn(self.hook_ran(broken, 'apt-upgrade'), self.lines())
        self.assertIn(f"{broken['folder']} stop --here --no-input closed", self.lines())
        self.assertIn(self.hook_ran(healthy), self.lines())

    def test_an_unknown_hook_fails_inside_the_vm(self):
        vm = self.vm('dotfiles', image='shell')
        result = self.run_host(vm, args=('--hook', 'nope'))
        self.assertEqual(result.returncode, 1)
        self.assertIn('run-hook: no hook named nope', result.stderr)

    def test_updates_each_vm_and_stops_only_the_ones_that_were_stopped(self):
        running, stopped = self.vm('running'), self.vm('stopped with space', 'Stopped')
        result = self.run_host(running, stopped)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lines(), [
            f"{running['folder']} tools update --here --no-input closed",
            f"{stopped['folder']} tools update --here --no-input closed",
            f"{stopped['folder']} stop --here --no-input closed",
        ])
        self.assertNotIn(' update --force', self.calls.read_text())

    def test_full_rebuilds_base_once_then_remakes_each_vm(self):
        first, second = self.vm('first'), self.vm('second')
        result = self.run_host(first, second, args=('--full',))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lines(), [
            f"{Path.cwd()} rebuild base --force --no-input closed",
            f"{first['folder']} update --force --here --no-input closed",
            f"{second['folder']} update --force --here --no-input closed",
        ])

    def test_a_failed_rebuild_updates_no_vm(self):
        vm = self.vm('first')
        stub(self.bin, 'devvm', '''if [[ $1 == ls ]]; then cat "$INVENTORY"; exit; fi
printf '%s\\n' "$*" >> "$CALLS"
[[ $1 != rebuild ]]
''')
        result = self.run_host(vm, args=('--full',))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.lines(), ['rebuild base --force --no-input'])

    def test_rejects_unknown_arguments(self):
        bad = subprocess.run([str(HOST), '--force'], env=self.env, text=True, capture_output=True)
        self.assertEqual(bad.returncode, 64)

    def test_failures_are_reported_without_stopping_the_other_vms(self):
        gone = self.vm('gone', state='missing')
        broken = self.vm('broken', 'Stopped')
        (Path(broken['folder']) / 'fail').touch()
        healthy = self.vm('healthy')
        result = self.run_host(gone, broken, healthy)
        self.assertEqual(result.returncode, 1)
        self.assertIn('devvm-gone: skipped', result.stderr)
        self.assertIn('devvm adopt', result.stderr)
        self.assertEqual(self.lines(), [
            f"{broken['folder']} tools update --here --no-input closed",
            f"{healthy['folder']} tools update --here --no-input closed",
        ])


class DailyUpdateTest(Fixture):
    def setUp(self):
        super().setUp()
        self.dotfiles = self.home / 'dotfiles'
        (self.dotfiles / 'setup/devvm/hooks').mkdir(parents=True)
        for script in ('setup/devvm/run-hook', 'setup/devvm/hooks/update'):
            shutil.copy(ROOT / script, self.dotfiles / script)
        stub(self.dotfiles / 'setup/devvm', 'setup-skills', '''printf 'setup-skills %s\\n' "$*" >> "$CALLS"
[[ ! -e "$HOME/fail-skills" ]]
''')
        stub(self.bin, 'git', '''printf 'git %s\\n' "$*" >> "$CALLS"
[[ ! -e "$HOME/fail-git" ]]
''')
        self.clock = self.home / 'clock'
        self.clock.write_text('2026-11-14')
        stub(self.bin, 'date', '[[ $1 == +%F ]] && cat "$CLOCK" || echo now\n')
        self.env.update(DOTFILES_DIR=str(self.dotfiles), SKILLS_DIR=str(self.home / 'skills'),
                        CLOCK=str(self.clock))

    def run_daily(self):
        return subprocess.run(['bash', str(DAILY)], env=self.env, text=True, capture_output=True)

    def test_runs_once_per_day_pulling_both_repos_before_refreshing_skills(self):
        for _ in range(2):
            self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.lines(), [
            f'git -C {self.dotfiles} pull -q --ff-only',
            f'git -C {self.home}/skills pull -q --ff-only',
            'setup-skills ',
        ])
        self.clock.write_text('2026-11-15')
        self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(len(self.lines()), 6)

    def test_a_failed_pull_still_refreshes_skills_and_claims_the_day(self):
        (self.home / 'fail-git').touch()
        self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.lines().count('setup-skills '), 1)

    def test_a_failed_refresh_retries_on_the_next_shell(self):
        (self.home / 'fail-skills').touch()
        self.assertEqual(self.run_daily().returncode, 1)
        (self.home / 'fail-skills').unlink()
        self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.lines().count('setup-skills '), 2)

    def test_a_running_update_makes_other_shells_skip(self):
        state = self.home / 'state/dotfiles/devvm'
        state.mkdir(parents=True)
        with (state / 'update-daily.lock').open('w') as held:
            fcntl.flock(held, fcntl.LOCK_EX)
            self.assertEqual(self.run_daily().returncode, 0)
        self.assertEqual(self.lines(), [])


class AptUpgradeHookTest(Fixture):
    def test_upgrades_without_prompts_keeping_config_files(self):
        stub(self.bin, 'sudo', 'printf "sudo %s\\n" "$*" >> "$CALLS"\n')
        result = subprocess.run(['bash', str(ROOT / 'setup/devvm/hooks/apt-upgrade')],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        apt = 'sudo DEBIAN_FRONTEND=noninteractive apt-get -q -o DPkg::Lock::Timeout=300'
        self.assertEqual(self.lines(), [
            f'{apt} update',
            f'{apt} -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade',
        ])


if __name__ == '__main__':
    unittest.main()
