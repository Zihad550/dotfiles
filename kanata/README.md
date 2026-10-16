# Kanata profiles

Open Quick Settings and click the arrow on the Kanata tile to select a profile.
The main part of the tile still starts or stops Kanata.

- **Default** keeps the original per-key hold times.
- **Laptop** adds 10 ms to every hold time. Tap timing and mappings stay the same.

Selection persists in `~/.local/state/kanata/active.kbd`. Switching validates the
config and restarts Kanata if it is running; choosing a profile while stopped
leaves it stopped. If the restart fails, or Kanata exits within a second of it,
the previous selection is restored. Kanata is then started again only if it is
not still running the old profile (a cancelled authorization changes nothing).
Recovery failures are reported.

For an existing installation, run
`setup/common/setup-kanata` once to update the system
service to use the saved selection. Restart Kanata afterward if already running.
New installations use Default initially.

The same selection is available from the terminal:

```sh
df-kanata-profile current
df-kanata-profile default
df-kanata-profile laptop
```

Both configs include `keymap.kbd`, so key mappings are shared. Profile names here
are keyboard presets, independent of the `DOTFILES_PROFILE` setup target.
