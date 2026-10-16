# Input auto-suspend

Opt-in fix for microphones that record a loud power-up spike after PipeWire
wakes them. WirePlumber suspends an idle input after 5 seconds; on some
codecs, such as the Ryzen HD Audio controller, the next recording then starts
with 2–3 seconds of clipped audio, so dictation loses the first words.

## Run

```sh
cd ~/dotfiles
bash setup/oneoff/input-no-suspend/setup-input-no-suspend
```

A `gum` picker lists every ALSA input, with inputs already kept awake
preselected. The selection replaces the whole rule in
`~/.config/wireplumber/wireplumber.conf.d/51-dotfiles-input-no-suspend.conf`,
which sets `session.suspend-timeout-seconds = 0` for each chosen `node.name`.
Deselecting everything deletes the file. Rules for inputs that are not
present, such as an unplugged USB mic, are kept. Commas in descriptions show
as ` - ` because gum splits preselections on commas. Bluetooth and other non-ALSA inputs
are not listed because the rule uses `monitor.alsa.rules`.

The change applies when WirePlumber restarts; the script offers to do it.
A kept-awake input stays open but nothing reads it until an app records, so
the cost is a little power, not a privacy change.

## Verify

```sh
pactl list sources short
```

Chosen inputs show `IDLE` or `RUNNING` instead of `SUSPENDED` after a minute
unused.

Node names include the card's PCI address, so rerun the picker after hardware
changes.
