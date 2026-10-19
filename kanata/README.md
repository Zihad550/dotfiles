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

The Bar shows the layer Kanata has confirmed: `Base`, `Nav`, `Sym`, `Media`, `Mouse`, `Off` when
`kanata.service` is stopped, `No state` when live state is unavailable, and
`Layer?` for a layer the guide does not describe. Click the layer button on the
Bar to open the Layer Guide, then select Base, Navigation, Symbols, Media or Mouse to see
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
   decision. Space is the only Navigation trigger; R is a plain letter and
   Caps Lock sends Escape on tap and hold.
3. **Symbols** (enabled): hold Enter for Miryoku’s left-hand symbols.
   Tapping Enter still sends Enter; I and E are plain letters. The right home row supplies direct modifiers.
4. **Numbers** (enabled, by user decision on the Navigation layer instead of
   a U hold): while Space is held, the left hand is a numpad. W/E/R, S/D/F and
   X/C/V are 7/8/9, 4/5/6 and 1/2/3, G is 0, Tab is `.` and Caps Lock is `-`.
   Holding A/S/D/F there still gives Super/Alt/Shift/Ctrl, with the Base hold
   times, so Space, hold D, then L selects text. U remains a plain key; Tab now holds Mouse.

### Miryoku Media, Mouse and Symbols

These layers follow [Miryoku’s layer tables](https://github.com/manna-harbour/miryoku_babel#layer-tables),
adapted to this regular keyboard. Navigation and its numpad stay as above.

| Layer | Hold | Controls |
| --- | --- | --- |
| Media | Escape (tap Escape) | J previous, K volume down, L volume up, ; next |
| Mouse | Tab (tap Tab) | J/K/L/; move left/down/up/right; M/,/./ slash scroll the same directions |
| Symbols | Enter (tap Enter) | Q/W/E/R/T: `{ & * ( }`; A/S/D/F/G: `: $ % ^ +`; Z/X/C/V/B: `~ ! @ # \|` |

On Media, Enter stops playback, Backspace plays/pauses, and Delete mutes.
On Mouse, those keys hold right, left and middle mouse buttons; holding a
button while moving allows dragging. Y/U/I/O/P give Redo/Paste/Copy/Cut/Undo.
Mouse movement accelerates from 1 to 15 pixels per 10 ms over one second;
scrolling repeats one notch every 50 ms. Media and Mouse use direct
Super/Alt/Ctrl/Shift on A/S/D/F. Miryoku’s firmware RGB, external-power,
output-selection and Bluetooth slots are unused on Media.

On Symbols, Escape and Caps Lock produce `(`, Space produces `)`, and Tab
produces `_`. J/K/L/; are direct Shift/Ctrl/Alt/Super. Enter is the held key;
I and U are unused there. Other unused Miryoku slots
produce no action; keys outside those positions retain their existing actions.

Browse each layer using the Bar’s layer button. Holds update the indicator
without opening the guide. Restart Kanata after updating the keymap.

Space, Enter, Escape and Tab wait `layer-hold-time` (200 ms, Laptop 210 ms) before becoming a
hold. Each layer pins the other layer's trigger keys to plain keys, so the
layer held first decides the next key: Space then Enter sends Enter; Enter
then Space produces `)`.

To roll back a milestone, restore `keymap.kbd` and `kanataLayers.js` from the
last verified commit, check it with
`kanata --check -c ~/.local/state/kanata/active.kbd`, and run
`sudo systemctl restart kanata.service`.
