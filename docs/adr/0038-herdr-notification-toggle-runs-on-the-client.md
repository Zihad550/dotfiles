# The Herdr notification toggle runs on the client's machine, bound in Hyprland

`prefix+comma` toggled notifications for local sessions but did nothing under
`herdr --remote`. In Herdr 0.9.1 the attached client decides whether a popup
or sound plays, using its own local `[ui.toast] delivery` and
`[ui.sound] enabled` (`src/client/shell/notification_policy.rs`). A
`[[keys.command]]` key, though, runs on the server: with
`--remote-keybindings server` it executes remotely, and with `local` the
client drops custom commands entirely (`src/client/shell/config.rs`). So no
Herdr key can edit the client's config. Decision: `SUPER+ALT+COMMA` in
Hyprland runs `df-herdr-toggle-notifications` on the client's machine.
`prefix+comma` stays for local sessions.

## Why

**Reloading a server makes its clients re-read their own config.**
`server reload-config` sends `ReloadSoundConfig` to every attached client
(`src/server/headless.rs`), and each one reloads its local `config.toml`. So
after editing the local file, the helper reloads every running local session
and, for each `herdr --remote <target> [--session <name>]` client process on
the machine, that remote session over `ssh -o BatchMode=yes`. If a remote
can't be reached, the helper reports it. Pressing `prefix+alt+r` in that
window also reloads the client's config.

**Rejected alternatives.** Herdr has no built-in toggle action to bind. The
settings menu works but takes several keystrokes. Sending
`prefix+alt+r` to the focused window with `hyprctl sendshortcut` depends on
focus and timing. Dropping `--remote-keybindings server` doesn't help: the
client ignores local custom commands while attached remotely.
