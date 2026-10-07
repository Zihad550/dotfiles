# Quick Settings speaker channels

Quick Settings exposes L/R controls for an output's front-left and front-right
channels. AudioService owns channel selection and volume for every panel and
for the media keys. L and R share one volume level. The slider assigns that
level to every enabled channel, and a disabled channel stays at zero while
remembering the shared level. Re-enabling either channel uses the current level,
including zero. With both channels disabled, the slider still changes the
remembered level without making either channel audible.
Selection is remembered per output for the lifetime of the shell.

## Backend writes and confirmation

Output volume is written as a complete channel vector through
`pactl set-sink-volume`, with the output name captured when the request is made.
Writes are serialized, and rapid slider requests coalesce per output.
A successful command is followed by `pactl -f json list sinks` to confirm the
actual channel volumes. A requested zero must read back as exactly zero.
A rejected write rolls back the channel selection and appears in the tooltip.
Channel writes follow the PulseAudio channel map, including reversed stereo
order. Volume changes wait for the output's first confirmed channel map and
volume snapshot. Subscription events refresh volume after external changes.

This avoids relying on QuickShell's local volume value as proof of a backend
write. A device-backed reproduction on QuickShell 0.3.1 reported `[0, 0]` in QML
while its route still contained nonzero volumes. The route omitted `volumeStep`,
which hits the direct-write failure tracked in
[upstream issue #807](https://github.com/quickshell-mirror/quickshell/issues/807).
The user's wired device was unavailable in the debugging environment, so that
specific device's route could not be checked.

Hardware-route volume and software channel volume can differ. The controls
therefore display the PulseAudio interface's confirmed channel values rather
than the device-route values exposed by the QuickShell node.

## Verification

Run:

```sh
node --test tests/dotfiles/audio.test.js tests/dotfiles/audioBackend.test.js \
  tests/dotfiles/quickSettings.test.js tests/dotfiles/backlight.test.js
```

The QML backend test runs the real controls and Process objects against a fake
`pactl`, with stale hardware values, reversed channel order, rapid slider
changes, output switches, multiple panels, and a rejected backend write.
It requires QuickShell and subprocess execution; it skips only when QuickShell
is not installed. A private PipeWire device-route reproduction also confirmed
actual backend silence after raising the left channel and disabling it.
