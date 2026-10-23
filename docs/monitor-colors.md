# Monitor colors

Run these commands inside the Hyprland session:

```sh
df-monitor status
df-monitor day
df-monitor night
```

`status` reads the active displays, color preset and RGB values without changing colors.
`day` and `night` choose a backend from the active displays on each invocation:

- When every active display has a tested preset, use DDC/CI color controls and
  stop `hyprsunset.service` so its scheduled profiles cannot add another filter.
- When a laptop panel or an unconfigured display is active, restore configured
  monitors to their day color settings, start hyprsunset, and use its global filter
  (identity for day, 4000 K for night). Its existing scheduled profiles continue.

Hyprsunset currently applies the same color matrix to every output. Mixed setups
therefore use software warmth for all displays. See its
[implementation](https://github.com/hyprwm/hyprsunset/blob/main/src/Hyprsunset.cpp).

This is a manual color CLI. Run it again after connecting or enabling a different
display. It does not add hotplug handling or a hardware day/night schedule, change
brightness, or replace the existing laptop backlight controls. Hardware mode stops
hyprsunset for the current session; it does not disable the service for future
logins. `systemctl --user start hyprsunset.service` returns to its existing schedule;
run `df-monitor day` first to restore the LG's colors.

## Presets

`hypr/.config/hypr/monitor-presets.json` matches the full make, model and serial
reported by `hyprctl monitors -j`. DDC commands target the serial rather than a
display number, which can change after reconnecting. The LG's advertised DDC model
is inaccurate, so presets rely on tested behavior. The physical OSD's **Warm**
setting was confirmed to report color preset `0x05` (advertised as 6500 K).
**Custom**, reported as User 1, is preset `0x0B`.

The LG with serial `203NTFA3R371` uses these settings:

| Mode | Color preset | RGB |
|---|---|---|
| Day (original) | Custom (`0x0B`) | 50 / 59 / 63 |
| Night | Factory Warm (`0x05`) | Unchanged |

Night selects the monitor's factory preset without rewriting its custom RGB
values. Day selects Custom before restoring the original RGB values. Preset
numbers in JSON are decimal (`11` for Custom and `5` for Warm). A `rgb` array is
optional and supported only with Custom preset `11`.

No color settings are guessed for other monitors. To add one, test its controls
and save its normal color preset and RGB values. Commands fail if a configured monitor
cannot be read or written; they do not silently stack software warmth on an
unknown hardware state. Failed color writes attempt to restore the preceding RGB
values and color preset. DDC failures can also prevent restoration; errors are reported.

An independently launched hyprsunset must be stopped before hardware mode can be
used. The CLI refuses hardware writes if a software filter remains after stopping
the user service. Displays sharing a configured serial are also rejected,
including disabled outputs and displays without presets.

The CLI reads `~/.config/hypr/monitor-presets.json`, falling back to the bundled
file when it is not installed. `DF_MONITOR_PRESETS` selects an alternate file.

## Dependencies

Requires Python 3, `hyprctl`, the systemd user session, and `hyprsunset.service`.
DDC monitors also need `ddcutil`, the `i2c-dev` kernel module, and permission to
access their `/dev/i2c-*` device. Arch's ddcutil package supplies udev rules; do not
run the CLI with sudo, because it needs the graphical user's session.

```sh
sudo pacman -S --needed ddcutil
sudo modprobe i2c-dev
```

To load the interface at boot, add `i2c-dev` to a file in
`/etc/modules-load.d/`, for example `/etc/modules-load.d/ddcutil.conf`.
