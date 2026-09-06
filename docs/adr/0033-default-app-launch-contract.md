# Default app launches activate a desktop entry and add nothing else

The Role Launcher behind `SUPER+B` and `SUPER+F` activates the selected
application's Desktop Entry ID through `uwsm-app -- <id>.desktop` and adds no
flags, no `systemd-run` wrapper, no `--new-window`, and no post-launch focus
step. It passes only action-specific arguments, such as a URL. Omarchy's browser
launcher, the obvious model, is deliberately not copied.

## Why

**Omarchy's Exec parsing breaks the browser we actually use.**
`omarchy-launch-browser:10` extracts only the first whitespace-delimited token of
a desktop entry's `Exec=` line. That works for its native packages, but this
repo's workstation browser is Flatpak Zen
(`hypr/.config/hypr/lua/bindings/apps.lua:8`,
`setup/arch-workstation/post-install:10`), whose first token is
`/usr/bin/flatpak` — the required `run app.zen_browser.zen` arguments are
silently dropped. `uwsm app` accepts a Desktop Entry ID as its first argument and
expands `Exec=` per the freedesktop spec, so the correct command line comes from
the application's own package instead of from parsing we maintain.

**Omarchy's `systemd-run` wrapper solves a problem we don't have.** `uwsm app`
defaults to `--scope` (`/usr/share/uwsm/modules/uwsm/main.py:3701`), and
`systemd-run --user --scope` blocks for the lifetime of the launched
application. Every other Omarchy launcher therefore ends in
`exec setsid uwsm-app -- …`; the browser launcher cannot, because it still has to
resolve the URL argument and call `omarchy-hyprland-focus-app` afterwards
(`omarchy-launch-browser:23-33`). The wrapper buys it an immediate return, a
collision-free unit name, `--collect` cleanup and silenced output — not cgroup
placement, slice membership or clean logout, which `uwsm-app` already provides.
With no post-launch step of our own we can `exec`, matching `bin/df-launch-app:5`
and `bin/df-launch-tui:10`, and none of it is needed.

**No generic focus behavior.** Activating a desktop entry lets the application
decide whether to reuse an existing window. A launcher-level focus step would
override that decision for every application uniformly, which is a per-
application question, not a role-level one.

## Consequences

- Per-application flags leave the launcher. Ozone and Wayland settings belong to
  the session environment or each application's own configuration file; browser
  profiles become named presets in `quickshell/.config/quickshell/launcher/modules/OtherMenu.qml`,
  where two Zen profiles already live.
- `SUPER+B` stops carrying Zen's `-P dev` profile. That invocation moves into
  `OtherMenu.qml` beside the `008` and `webdev` entries.
- Terminal-based candidates cannot be activated this way and keep explicit
  command arrays in the Default App Registry, launched through
  `bin/df-launch-tui`.
- An App Candidate is only offered when its desktop entry or command actually
  resolves, since a missing entry now fails at activation rather than degrading
  to a partial command line.
