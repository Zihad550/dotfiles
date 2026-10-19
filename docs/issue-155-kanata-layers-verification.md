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
- [ ] In an editor, hold Caps Lock: the Bar shows `Nav` without opening a guide.
      H/J/K/L still move the cursor. Release: the Bar shows `Base`.
- [ ] Click the layer button: a guide opens under that Bar. Select Base,
      Navigation, Symbols, Media and Mouse to inspect their key outputs and hold labels.
- [ ] Holding or releasing a layer does not open the guide or change its
      selected tab. Quick taps and fast prose never flash a guide.
- [ ] Click the button again, click outside, and press Escape: each closes it.
- [ ] On another monitor, click its layer button: the guide opens there only.
      Opening Quick Settings closes the guide, and vice versa.
- [ ] Switch the Kanata profile to Laptop and back: the indicator returns to
      `Base`, and holds still leave the guide closed.
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
- [ ] Hold Space: the Bar shows `Nav` without opening the guide. In the
      guide’s Navigation tab, Space is marked `held`.
- [ ] While holding Space: H/J/K/L move the cursor, U deletes backward, ;
      inserts a newline, I/O pages down/up, M/N go to the start/end of the
      line, Y deletes forward, P sends Print Screen (your screenshot binding
      runs), and comma toggles insert/overwrite where the editor supports it.
- [ ] Outside Space, home row mods and B-hold Backspace still work.
- [ ] Caps Lock and R still hold Navigation, and Caps Lock still taps Escape.
- [ ] Release Space: the Bar shows `Base`, with no stuck modifier. An open
      guide stays on its selected tab.
- [ ] Both Kanata profiles: repeat the Space tap and hold checks after
      switching to Laptop, then switch back.

To roll back milestone 2 only, restore `kanata/.config/kanata/keymap.kbd`,
`config.kbd`, `laptop.kbd`, and `modules/lib/kanataLayers.js` from the
milestone 1 commit, then restart Kanata.

## 5. Miryoku Symbols

- [ ] I and E are plain letters. Tapping Enter sends Enter.
- [ ] Hold Enter: the Bar shows Sym without opening the guide.
- [ ] Q/W/E/R/T output `{ & * ( }`; A/S/D/F/G output `: $ % ^ +`;
      Z/X/C/V/B output `~ ! @ # |`.
- [ ] Caps Lock/Space/Tab output `(`/`)`/`_`; J/K/L/; are Shift/Ctrl/Alt/Super.
- [ ] Hold Space, then I: Page Down (Navigation, not Symbols).

## 6. Milestone 4: Numbers on the Space layer

- [ ] Hold Space: W/E/R, S/D/F, X/C/V give 7/8/9, 4/5/6, 1/2/3; G gives 0,
      Tab gives `.`, Caps Lock gives `-`.
- [ ] Hold Space, hold D, then L: selection extends right. A quick tap of D
      while Space is held types 5. Holding A/S/F gives Super/Alt/Ctrl.
- [ ] Tapping U types u, holding U types repeated u, and Tab is a normal Tab.

Record each result on issue #155.

## 7. Miryoku Media and Mouse

- [ ] Tap Escape/Tab: send Escape/Tab. Hold Escape/Tab: Media/Mouse indicator, no guide opens.
- [ ] Media J/K/L/;: previous track, volume down, volume up, next track.
- [ ] Media Enter/Backspace/Delete: stop, play-pause, mute.
- [ ] Mouse J/K/L/;: pointer left/down/up/right; M/,/./ slash scroll likewise.
- [ ] Mouse Enter/Backspace/Delete: right/left/middle buttons. Drag by holding
      Backspace while using the pointer keys; releasing ends the drag.
- [ ] Mouse Y/U/I/O/P: Redo/Paste/Copy/Cut/Undo.
- [ ] Media/Mouse A/S/D/F: direct Super/Alt/Ctrl/Shift.
- [ ] M remains a plain letter in Base; Escape never stacks another layer.
- [ ] Release the activation key: Base returns, with no stuck button or modifier.
- [ ] Layer trigger keys never stack layers. Navigation + M still sends Home.
- [ ] Browse Symbols/Media/Mouse using the layer button; holds never open it.
- [ ] Repeat with both Default and Laptop profiles.
