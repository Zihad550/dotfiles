# Monitor inputs

Switch the LG monitor's physical input from the computer receiving your keyboard:

```sh
df-monitor input vga
df-monitor input hdmi1
df-monitor input toggle
```

In Hyprland, **Super + Ctrl + I** toggles between VGA and HDMI 1 on every machine
profile by reading the current input first. Other inputs or unreadable values
fail without a write. The launcher's Display menu offers the toggle and both
explicit actions. Shortcut and menu failures show a desktop notification.

Input selection uses `ddcutil detect --brief` on every invocation and requires
exactly one DDC-capable LG (`GSM`) display. It uses that display's current number;
it does not save display 1 or reuse the color preset's serial, which was not
found through HDMI. If multiple LG monitors are connected, inspect `ddcutil detect`
and select the intended one explicitly:

```sh
df-monitor input vga --serial SERIAL_FROM_DDCUTIL
```

The default shortcuts and menu entries require a unique LG. Customize their
commands with `--serial` if you have multiple LG monitors. No match or multiple
matches fail without writing any monitor settings.

The commands need Python 3, ddcutil, the i2c-dev module and access to `/dev/i2c-*`.
They do not require Hyprland or the color preset configuration, so the CLI can
also be used on the other computer. See [monitor colors](monitor-colors.md) for
DDC setup instructions.

The input codes are specific to the tested LG setup: VGA is `0x01`, and the
connection called HDMI 1 in the CLI is `0x04` (advertised by the monitor as DVI-2).
Both writes were confirmed to switch the physical input. The standard HDMI code
`0x11` and the advertised DVI-1 code `0x03` did not switch this monitor. The toggle
therefore recognizes `0x01` and `0x04` and switches between those values. These
codes are not a general mapping for other LG models.

The shortcut has been confirmed on arch-devbox; arch-workstation remains to be
tested. DDC access through an inactive input still needs hardware verification.
After a successful DDC write, the CLI reports the request rather than claiming
the visible input was verified. If the inactive computer cannot send DDC
commands, run the return command on the computer connected to the active input,
or use the monitor OSD.
