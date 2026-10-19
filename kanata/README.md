# Kanata

## Profiles

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

## Layer Indicator and Layer Guide

The Bar shows the layer Kanata has confirmed: `Base`, `Nav`, `Off` when
`kanata.service` is stopped, `No state` when live state is unavailable, and
`Layer?` for a layer the guide does not describe. Click the layer button on the
Bar to open the Layer Guide, then select Base, Navigation or Symbols to see
what each physical key produces. Layer holds only update the indicator; they
do not open or change the guide. Click the button again, click outside, or
press Escape to close it.

Kanata serves this state on `127.0.0.1:5829` (see
`docs/adr/0040-kanata-layer-state-over-loopback-tcp.md`). Rerun
`setup/common/setup-kanata` and restart Kanata once to enable it on an
existing installation.

The guide data lives in
`quickshell/.config/quickshell/dotfiles/modules/lib/kanataLayers.js`. When you
change `keymap.kbd`, update it too. `tests/dotfiles/kanataLayers.test.js`
fails while they disagree.

### Learning milestones (issue #155)

`layers.html` is the design reference. Its Original and Miryoku pages are
frozen drafts; only the Space → Navigation page evolves. Each milestone is
enabled only after the previous one passes its host check:

1. **Baseline and state visibility** (enabled): the Layer Indicator and Layer
   Guide for the existing Caps Lock and R Navigation hold.
2. **Space → Navigation** (enabled): tap Space for a space, hold it for
   Navigation. H/J/K/L are arrows, U is Backspace, ; is Enter, I/O are
   PgDn/PgUp, M/N are Home/End, Y is Delete, P is Print Screen and comma is
   Insert. Y, P, N, M and comma differ from issue #155's table by user
   decision. Caps Lock and R still hold Navigation.
3. **Symbols** (enabled): hold I or E for the custom page's symbols. Taps still
   type i and e.
4. **Numbers** (enabled, by user decision on the Navigation layer instead of
   a U hold): while Space is held, the left hand is a numpad. W/E/R, S/D/F and
   X/C/V are 7/8/9, 4/5/6 and 1/2/3, G is 0, Tab is `.` and Caps Lock is `-`.
   Holding A/S/D/F there still gives Super/Alt/Shift/Ctrl, with the Base hold
   times, so Space, hold D, then L selects text. U and Tab are plain keys.

Space, I and E wait `layer-hold-time` (200 ms, Laptop 210 ms) before becoming a
hold. Each layer pins the other layer's trigger keys to plain keys, so the
layer held first decides the next key: Space then E is 8, E then Space is a
space.

To roll back a milestone, restore `keymap.kbd` and `kanataLayers.js` from the
last verified commit, check it with
`kanata --check -c ~/.local/state/kanata/active.kbd`, and run
`sudo systemctl restart kanata.service`.
