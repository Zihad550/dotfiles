# Kanata layers host verification: milestones 1 to 4

Milestone 1 of issue #155 adds the Layer Indicator and Layer Guide for the
existing Caps Lock / R Navigation layer. Mappings are unchanged. Run these
steps inside the Hyprland session. Automated tests cannot prove real key
timing, Wayland focus, or that Kanata 1.12.0 reports momentary layers.

## 1. Enable Kanata's loopback state server

```bash
set -eu
cd "$HOME/dotfiles"
setup/common/setup-kanata
sudo systemctl restart kanata.service
systemctl show kanata.service --property=ExecStart --value | grep -F -- '-p 127.0.0.1:5829'
ss -ltn | grep -F '127.0.0.1:5829'
kanata --check -c "$HOME/.local/state/kanata/active.kbd"
```

Pass: both `grep` commands print a line, the port is not listed on `0.0.0.0`
or `*`, and the check reports no errors.

## 2. Confirm Kanata reports held layers

```bash
printf '{"RequestCurrentLayerName":{}}\n' | timeout 15 bin/df-kanata-layers
# Within 15 s: hold Caps Lock for a second, release; hold R for a second, release.
```

Pass: the output starts with `{"CurrentLayerName":{"name":"base"}}`, possibly
after a `{"LayerChange":{"new":"base"}}` line that Kanata sends on connect.
Each hold then prints `{"LayerChange":{"new":"navigation"}}`, followed by one
with `"base"` on release. If holds print no `LayerChange` lines, the indicator
cannot work; report that result.

## 3. Indicator and guide

```bash
bin/df-qs-load-check
bin/df-qs-restart dotfiles
```

- [ ] The Bar shows `󰌌 Base` to the left of the Status Cluster.
- [ ] In an editor, hold Caps Lock: the Bar shows `Nav`, and after a short
      moment a keyboard guide appears under the Bar on this monitor. H/J/K/L
      show arrows, Caps Lock and R are marked `held`, and A/S/D/F, J/K/L/;
      and B show their existing hold labels.
- [ ] While held, H/J/K/L move the cursor in the editor. The editor keeps
      focus, and clicking where the guide is reaches the window under it.
- [ ] Release: the Bar shows `Base` and the guide disappears.
- [ ] Tap Caps Lock: Escape is sent, and the guide does not flash. Type fast
      prose containing r: no guide flashes and no `r` is lost.
- [ ] Rapid hold and release cycles leave no guide on screen and no stuck
      modifier.
- [ ] Hold R: same guide and indicator as Caps Lock.
- [ ] Focus another monitor and hold Caps Lock: the guide opens there only.
- [ ] Quick Settings → Kanata chevron → **Layer Guide**: switch Off. Holding
      Caps Lock now changes the indicator only. Switch it back On.
- [ ] Switch the Kanata profile to Laptop and back: the indicator returns to
      `Base`, and holding still shows the guide.
- [ ] Stop Kanata with the Kanata Tile: the Bar shows `Off` within 15 s.
      Start it again: the indicator returns to `Base`.
- [ ] Lock the session while holding nothing, unlock: the indicator is
      correct, and no guide is visible while locked.
- [ ] `bin/df-qs-restart dotfiles` while holding Caps Lock: after the restart,
      the indicator shows `Nav` while Caps Lock is still held.

## 4. Milestone 2: Space → Navigation

```bash
sudo systemctl restart kanata.service
```

- [ ] A Space tap inserts exactly one space. Fast prose and code typing never
      opens the guide, never moves the cursor, and never drops a space.
- [ ] Hold Space: the Bar shows `Nav` and the guide shows Space as `held`.
- [ ] While holding Space: H/J/K/L move the cursor, U deletes backward, ;
      inserts a newline, I/O pages down/up, M/N go to the start/end of the
      line, Y deletes forward, P sends Print Screen (your screenshot binding
      runs), and comma toggles insert/overwrite where the editor supports it.
- [ ] Outside Space, home row mods and B-hold Backspace still work.
- [ ] Caps Lock and R still hold Navigation, and Caps Lock still taps Escape.
- [ ] Release Space: the Bar shows `Base` and the guide disappears, with no
      stuck modifier.
- [ ] Both Kanata profiles: repeat the Space tap and hold checks after
      switching to Laptop, then switch back.

To roll back milestone 2 only, restore `kanata/.config/kanata/keymap.kbd`,
`config.kbd`, `laptop.kbd`, and `modules/lib/kanataLayers.js` from the
milestone 1 commit, then restart Kanata.

## 5. Milestone 3: Symbols

- [ ] Tapping I and E types i and e; fast prose with many i and e loses no
      letters and never opens the guide.
- [ ] Hold I: the Bar shows `Sym` and the guide shows the symbol layer. E
      gives `#`, A gives `=`, H/J give `{`/`}`. Release I: no `i` is typed.
- [ ] Hold E: the same layer opens. I gives `[`. Release E: no `e` is typed.
- [ ] Hold Space, then I: Page Down (Navigation, not Symbols).
- [ ] Caps Lock still taps Escape and holds Navigation.

## 6. Milestone 4: Numbers on the Space layer

- [ ] Hold Space: W/E/R, S/D/F, X/C/V give 7/8/9, 4/5/6, 1/2/3; G gives 0,
      Tab gives `.`, Caps Lock gives `-`.
- [ ] Hold Space, hold D, then L: selection extends right. A quick tap of D
      while Space is held types 5. Holding A/S/F gives Super/Alt/Ctrl.
- [ ] Tapping U types u, holding U types repeated u, and Tab is a normal Tab.

Record each result on issue #155.
