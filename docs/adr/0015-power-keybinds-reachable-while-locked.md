# Shutdown and restart are reachable from a locked screen, unconfirmed

`SUPER+CTRL+SHIFT+S` and `SUPER+CTRL+SHIFT+R` now carry `locked = true` again
and run through `bin/df-power`, which asks the Launcher for a confirmation when
the session is unlocked and runs the command directly when hyprlock is on
screen. This reverses the decision `hypr/.config/hypr/lua/bindings/system.lua`
used to document, which dropped `locked` from these binds and left the physical
power button as the only way to power off a locked machine.

## Why

**The confirmation and the lock screen are mutually exclusive, so one of them
has to give.** The Launcher is a `WlrLayer.Overlay` surface with
`keyboardFocus: OnDemand`; hyprlock sits above it with an exclusive keyboard
grab. A confirmation raised while locked is an invisible question waiting on a
Return nobody can see to press. That is why `locked` was dropped in the first
place, and nothing about it has changed — what changed is which side we give up.

**The confirmation guards a case the lock screen already rules out.** It exists
to catch a fat-finger while you are working at the keyboard. Deliberately
typing a three-modifier chord at a lock screen is not that. Skipping it when
locked removes the prompt exactly where it protects nothing.

**It grants an attacker nothing the hardware doesn't.** Anyone standing at a
locked machine can already hold the power button and hard-cut it. Making
`shutdown now` reachable replaces that with the graceful path — strictly better
for the filesystem, and no new capability. It does not unlock anything, expose
a session, or survive to the next boot.

**Logout is excluded for the opposite reason.** `SUPER+CTRL+M` destroys every
unsaved buffer in the running session, and unlike shutdown it has no "the power
button already does this" defence — there is no hardware gesture that discards
your work and leaves the machine up. Lock while locked is a no-op. Both stay
Launcher-only, bound without `locked`.

**Lock state is `pidof hyprlock`, not `loginctl`'s `LockedHint`.** `LockedHint`
is the correct-looking answer and the wrong one here: hyprlock does not always
come up via `loginctl lock-session` on this machine, and the hint reads `no`
while the lock screen is on display. The old idle daemon's lock action already
answers the same question the same way.

## Consequences

- Someone with physical access to the locked machine can power it off or
  restart it. That is the accepted trade, not an oversight.
- No feedback when the locked path fires — nothing can draw above hyprlock. A
  `logger -t df-power` line is the only record of why the machine went away.
- The shutdown and restart commands now exist in two places: `launcher/lib/power.js`
  (authoritative) and `bin/df-power`. `tests/launcher/power.test.js` pins the
  second to the first by parsing the script's case arms, so a reformat of those
  lines fails the test rather than silently pinning nothing.
- Two of the four power binds route through a script and two dispatch inline.
  The shapes differ because the actions differ; completing the pattern by
  giving logout a direct branch would reverse this decision's exclusion of it.
- `SystemMenu.qml` and `rofi/.config/rofi/scripts/power_menu` still disagree
  with `power.js` about these commands (`systemctl poweroff`/`reboot`,
  `uwsm stop`). That divergence predates this change and is left alone —
  reconciling three lists is its own decision, not a side effect of this one.
- The locked branch itself is unpinned. There is no shell-test harness in this
  repo and one `if pidof hyprlock` did not justify introducing bats plus an
  injection seam; it is verified by hand.

> The lock-state signal chosen here — `pidof hyprlock` — is superseded by
> `docs/adr/0017-lock-state-is-a-file-not-a-process-probe.md`. The rest of this
> decision stands.

> If the lock itself is what broke, the recovery path is
> `docs/session-lock-break-glass.md`.
