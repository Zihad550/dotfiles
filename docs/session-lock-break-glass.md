# Break-glass: recovering from a Session Lock failure

The Session Lock and the Idle Ladder are Quickshell QML in a config of their
own, and the daemons they replaced — `hyprlock` and `hypridle` — are removed
from the package list in the same change (`docs/session-lifecycle-spec.md`,
Implementation Decisions). This is the path back if that turns out to have been
optimistic.

**Read it somewhere else.** If the lock is broken you are at a text console with
no browser, so the copy that matters is the one on another device:

    https://github.com/Zihad550/dotfiles/blob/main/docs/session-lock-break-glass.md

On the machine itself it is `docs/session-lock-break-glass.md` in this repo:

    less ~/dotfiles/docs/session-lock-break-glass.md

Every command below has been run on an Arch + Hyprland box; the two that end
the session are marked, with what was checked instead. See **Verification** at
the end.

## When to reach for this

Three symptoms, and nothing else:

1. **The session never locks on idle.** You walk away, come back, and the
   session is exactly as you left it — no dim, no lock.
2. **The machine suspends without locking.** It comes back to your desktop
   rather than to a password field. Treat the session as exposed.
3. **The lock refuses a correct password.** The field takes input and rejects
   it, or reports a lockout you did not earn.

Anything else — a wrong colour, a lock that is slow, a screen that stays black
after unlock — is a bug to file, not a reason to reinstall two daemons.

## 0. Get a shell

**`Ctrl+Alt+F3`**, then log in. That is the escape. It works while the lock
surface is up, because the lock holds the Wayland session, not the console.

`F3` rather than `F2` because the graphical session already occupies a console
of its own and switching to it gets you the lock screen again. Which one it
holds depends on the greeter — under SDDM it is `tty2`, with the greeter on
`tty1` — so do not memorise a number, read it:

    loginctl list-sessions          # the TTY column of your `user` session

`Ctrl+Alt+F<n>` for that `n` goes back to the graphical session. `F4`–`F6` are
free consoles too if `F3` is occupied.

Three things bite immediately in that shell:

- **`hyprctl` will not talk to the compositor** — the console shell is not the
  graphical session, so it has no `HYPRLAND_INSTANCE_SIGNATURE`. Export one:

      export HYPRLAND_INSTANCE_SIGNATURE=$(ls -t /run/user/$UID/hypr | head -1)
      hyprctl monitors

- **`qs -c <config> …` will claim there is nothing running.** Every
  instance-addressing subcommand — `kill`, `ipc`, `log` — matches on the display
  connection as well as the config, so with no `WAYLAND_DISPLAY` it prints
  `No running instances` while the instance is alive and untouched. That is a
  silent no-op, not an answer. Export one:

      export WAYLAND_DISPLAY=$(ls /run/user/$UID/wayland-* | grep -v '\.lock$' | head -1 | xargs basename)

  `qs list --all` is the exception: it enumerates every instance regardless, so
  use it to see the truth and to confirm a `kill` actually took.

- **`systemctl --user` works as-is.** The user manager is shared with the
  graphical session, so units enable and restart from here normally.

## 1. Stop the broken lock

    qs list --all
    qs -c lock kill

`qs -c lock kill` prints `No running instances` and exits 0 when there is
nothing to kill, so it is safe to run first and ask questions after — but read
the `WAYLAND_DISPLAY` note above before believing it, because an unset one
prints exactly the same thing over a live instance. `qs list --all` is what
confirms the kill took.

It routinely does not take: the instance logs `Exiting due to IPC request` and
then stalls in shutdown, and the `kill` call blocks waiting for an exit that
never comes. `SIGTERM` to that pid ends it immediately, and is safe — every
transition is on disk before it happens, so the next instance adopts the truth
and Stranded Lock recovery takes back a lock the compositor still holds.
`df-qs-restart lock` escalates that way on its own.

What the lock last published about itself — and, once its call site moves, what
`df-power` reads (`docs/adr/0017-lock-state-is-a-file-not-a-process-probe.md`):

    cat /run/user/$UID/df-lock-state     # unlocked | requested | secure

`requested` left standing is a lock that was asked for and never became Secure.
A missing file means the lock config never started; `qs -c lock log` says why.

If the screens stay covered after that, the compositor is holding a lock whose
client is gone — a Stranded Lock. Nothing at the console clears it; end the
session and log in again:

    loginctl terminate-user "$USER"      # ends the graphical session

Everything unsaved in that session is lost. It is the last step, not the first.

## 2. If a correct password is rejected

The lock tallies failed attempts in its own faillock directory, deliberately
not the system-wide one (`setup/arch-workstation/setup-packages/setup-lock-pam`,
and `docs/adr/0017-lock-state-is-a-file-not-a-process-probe.md` for why the
lock's signals are kept apart). Read the tally and clear it:

    faillock --dir /var/lib/df-lock/faillock --user "$USER"
    faillock --dir /var/lib/df-lock/faillock --user "$USER" --reset

**No `sudo`.** The tally file is owned by the user who authenticates against
it, which is what makes this work when sudo itself is what got degraded.

If the tally is empty and the password is still refused, the service is missing
or wrong. Check it exists, then rewrite it:

    cat /etc/pam.d/df-lock
    ~/dotfiles/setup/arch-workstation/setup-packages/setup-lock-pam

A missing `/etc/pam.d/df-lock` rejects every password, including the right one.

## 3. If the machine suspended without locking

The lock holds a logind delay inhibitor from the moment it starts and drops it
once the session is Secure
(`docs/adr/0016-lock-holds-its-own-sleep-inhibitor.md`). Two things break that,
and they look the same from the outside.

**The inhibitor was never held.** Ask logind who is holding one:

    systemd-inhibit --list | grep 'df lock'

Nothing listed means the lock config is not running, or `gdbus` is missing and
its sleep monitor died. `qs -c lock log` says which.

**The window was too short.** The lock gives up after its own budget and lets
the machine sleep, because logind suspends at the end of its window either way.
A notification says so on the screen the session is unlocked into. Check the
window logind is actually using:

    busctl get-property org.freedesktop.login1 /org/freedesktop/login1 \
        org.freedesktop.login1.Manager InhibitDelayMaxUSec

Expect `15000000`. `5000000` is logind's default, which means the drop-in is
missing or logind has not reloaded it since:

    cat /etc/systemd/logind.conf.d/20-inhibit-delay.conf
    ~/dotfiles/setup/arch-workstation/setup-packages/setup-sleep-inhibit

The drop-in applies at the next reboot; restarting `systemd-logind` in a live
graphical session is not worth it.

Until either is fixed, suspend manually only after the lock is up — the
`SUPER + CTRL + S` keybind after locking, not instead of it.

## 4. Put the old daemons back

Only after 1, 2 and 3. This reverts the design decision, so it is a retreat, not
a fix — file the bug on the way past.

**Reinstall the packages.** Both are in `extra`:

    sudo pacman -S --needed --noconfirm hyprlock hypridle

**Revert the change that removed them.** Find it and revert it whole, rather
than restoring config files by hand — the call sites moved too, and a config
without them locks nothing:

    cd ~/dotfiles
    git log --oneline -- hypr/.config/hypr/hypridle.conf
    # the removal commit, and the lock commit too if the call sites moved
    git revert --no-commit <sha>...
    git status                            # confirm before continuing

What has to come back, so you can check the revert covered it:

- `hypr/.config/hypr/hypridle.conf` — the Idle Ladder as hypridle config, and
  its `lock_cmd`.
- `hypr/.config/hypr/hyprlock.conf` — the lock's appearance, plus the per-theme
  generated `hyprlock.conf` and the `themes/templates/hyprlock.conf.tpl` that
  rendered it.
- The `["hyprlock"]` command vector at the three call sites:
  `quickshell/.config/quickshell/launcher/lib/power.js`,
  `quickshell/.config/quickshell/launcher/modules/SystemMenu.qml` and
  `quickshell/.config/quickshell/dotfiles/modules/QuickSettings.qml`.
- The `pidof hyprlock` check in `bin/df-power`, which is how the power keybinds
  stay reachable from a locked screen
  (`docs/adr/0015-power-keybinds-reachable-while-locked.md`).
- `hyprlock` and `hypridle` in
  `setup/arch-workstation/setup-packages/setup-hyprland`.
- The two-occurrence `font_family` substitution in `bin/df-font-set`, which is
  the only thing that put the chosen font into the lock's config.

**Restow, so the working tree reaches `~/.config`:**

    stow -R -d ~/dotfiles -t ~ hypr quickshell

**Re-enable the idle daemon's unit.** The unit file ships with the package at
`/usr/lib/systemd/user/hypridle.service`, so it only exists again after the
reinstall above:

    systemctl --user daemon-reload
    systemctl --user enable --now hypridle.service
    systemctl --user is-enabled hypridle.service    # expect: enabled

**Stop the Quickshell lock from competing:**

    qs -c lock kill

Then log out and back in. Confirm the lock works before you walk away from it:

    hyprlock            # from the graphical session, not the console

## 5. On the devbox after a rollback

The live Session Lock uses the shared timing data plus the devbox's one-field
`suspend: null` override; it has no daemon-specific drop-in. If you reverted to
the old daemons in section 4, restore that old override as well, or the daemon
will suspend a machine you reach over the network:

    ~/dotfiles/setup/common/setup-hypridle-no-suspend \
        ~/dotfiles/setup/arch-devbox/hypridle.conf
    systemctl --user status hypridle.service

The restored script writes `~/.config/systemd/user/hypridle.service.d/override.conf`,
then reloads and restarts the restored unit itself. That drop-in belongs only to
this rollback path; the live Idle Ladder has no daemon unit to rewrite.

## Verification

Run on Arch Linux, `hyprlock 0.9.6-2` / `hypridle 0.1.8-1`, Hyprland 0.56.2,
2026-08-29, while both daemons were still installed — which is the point of
writing this before the removal rather than after.

Run and confirmed: the `HYPRLAND_INSTANCE_SIGNATURE` export followed by
`hyprctl monitors`; `qs list --all`; `qs -c lock kill` against a config with no
instance; both `faillock` invocations, unprivileged; `pacman -Si hyprlock
hypridle` and `pacman -Sp hyprlock hypridle`, resolving both from `extra`;
`stow` against `hypr` in simulation mode; `systemctl --user daemon-reload` and
`systemctl --user is-enabled hypridle.service`; the unit file present in
`pacman -Ql hypridle`; `/dev/tty1`–`/dev/tty6` and `chvt` present;
`hyprlock --help` and `hypridle --help`; `loginctl list-sessions`, which is
what showed the graphical session on `tty2` here and so ruled out
`Ctrl+Alt+F2` as the escape.

The suspend section was verified separately on 2026-08-30, against the running
lock config: `systemd-inhibit --list`, which listed the lock's own delay
inhibitor as `df lock`; and the `busctl get-property` above, which returned
`5000000` — logind's default, because the drop-in had not been installed on this
box yet, which is the state that section exists to name. `cat` of the drop-in
and the `setup-sleep-inhibit` rerun were not executed for the same reason: the
second one mutates the box.

Checked but not executed, because running them ends the session or mutates the
box: `sudo pacman -S --needed --noconfirm hyprlock hypridle` (package names and
repo resolved as above; the flags are pacman's own), `loginctl terminate-user`
(verb confirmed in `loginctl --help`), `stow -R` (dry run only), the
`setup-lock-pam` rerun, and the console switch itself.

`tests/lock/wiring.test.js` asserts that this file still names the three
symptoms, states the TTY escape, names the unit and the packages, is pointed at
from every lock ADR, and cites no repo path that has since moved.
