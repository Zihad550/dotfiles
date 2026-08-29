# Window focus on Herdr task completion is caused by the OS notification layer, not Herdr

Asked "how to disable Herdr auto window focus when a task is done." Herdr has
no window-raise/focus setting anywhere: not in `herdr --default-config`, not
in any `herdr <group>` CLI help, not in the upstream config reference or
`configuration.mdx`. The behavior traces to
`herdr/.config/herdr/config.toml`'s `[ui.toast] delivery = "system"` — that
setting "asks the OS notification service directly," and on a supported,
detected terminal the notification "can activate the terminal app" on
interaction. Under Hyprland, the notification daemon reacts to that desktop
notification by raising/focusing the window — Herdr itself never asks for
focus. Decision: leave `delivery = "system"` as is. The cause sits in the
notification daemon, which this repo doesn't configure at all (no
mako/dunst/swaync config anywhere in the tree), so there's nothing here to
change.

## Why

**The raise happens one layer past anything Herdr controls.** `"herdr"` or
`"off"` would stop it, but only by giving up real desktop notifications
(sound, visibility while Herdr isn't focused) to work around a default the
notification daemon owns, not Herdr. That's the wrong layer to fix at: it
trades away a wanted feature instead of touching the thing actually
deciding to raise the window.

**No Herdr setting controls the raise directly.** This was confirmed against
`herdr --default-config` (the full default `config.toml`), every `herdr
<group>` help text (`notification`, `integration`, `session`), and the
upstream `docs/configuration.mdx` + `config-reference.json` — none expose a
`focus`/`raise`/`urgency` key. Re-deriving this by re-reading the same
sources is the mistake this ADR exists to prevent.

## Consequences

- No config change. `herdr/.config/herdr/config.toml` keeps
  `[ui.toast] delivery = "system"`.
- If the raise-on-done behavior needs fixing later, the actual lever is
  whatever notification daemon owns Hyprland's notifications (e.g. a
  no-focus/urgency rule there) — not this repo's Herdr config. That daemon
  isn't stowed in this repo today.
- If Herdr ever ships a dedicated focus/urgency toggle, or this repo starts
  managing a notification daemon config, this ADR is the place to record it.
