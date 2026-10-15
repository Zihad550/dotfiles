# Intel DisplayPort Full RGB

Opt-in workaround for washed-out colors on Intel DisplayPort output, for any
Arch box whose greeter is SDDM. It targets
only a connected **DP-1** on the machine's single **i915** card. Other ports
and drivers are left alone. Card numbers, connector IDs, and Broadcast RGB
property IDs are discovered each boot.

More than one i915 card is an error rather than a guess: `proptest -M i915`
opens the first i915 device and silently ignores `-D`, so the helper cannot
aim it at a particular card. A disconnected DP-1 is logged and skipped at once
so it does not delay the login screen.

The [ArchWiki workaround](https://wiki.archlinux.org/title/Intel_graphics#Washed_out_colors)
uses a module-add udev rule. Here a root systemd oneshot runs from the real
root filesystem, waits up to 15 seconds for the connector and property, then
sets Full=1 and reads it back. It works even when i915 loaded in the initramfs.
It runs after Plymouth quits and before SDDM (including its Wayland greeter)
and tty1's getty. Plymouth's quit service is pulled in explicitly so its DRM
ownership ends first. Dependencies use Wants, so a failure is logged without
preventing the desktop from starting. See also
[systemd's display-manager alias](https://man.archlinux.org/man/systemd.special.7.en#display-manager.service).

## Enable

```sh
cd ~/dotfiles
bash setup/oneoff/intel-full-rgb/setup-intel-full-rgb
```

This installs `libdrm` (provides proptest) and Python, copies the root-owned
helper and system unit, and enables the unit for subsequent graphical boots.
It deliberately does not start the helper inside the running desktop. Reboot
when ready. No initramfs regeneration, driver changes, or Hyprland edits are
needed. No box's `init` calls the installer: this is a workaround for a particular
monitor and port, not a default.

Rerunning updates the files without overwriting the first backups in
`/var/lib/dotfiles/intel-full-rgb/`. An existing
`/usr/local/bin/intel-full-rgb`, `/etc/systemd/system/intel-full-rgb.service`,
and `/etc/udev/rules.d/80-i915-full-rgb.rules` are reported and backed up first; the old
udev rule is removed and udev rules reloaded to avoid competing writers.
No udev event is triggered against the live desktop.

## Verify after reboot

```sh
systemctl status intel-full-rgb.service
journalctl -b -u intel-full-rgb.service
sudo proptest -M i915
```

Inspect the complete **DP-1** connector block: Broadcast RGB should have
`value: 1`. A grep of the first RGB property alone can show a different
monitor. Confirm contrast visually, then repeat after a second reboot.

The journal reports the device, connector ID and property ID on success.
More than one i915 card, missing properties or device nodes, permission errors, and readback failures produce a failed unit with
diagnostics. The unit's 25-second outer timeout must stay above the helper's
`READY_TIMEOUT`. Exit 243/EACCES usually
means another compositor still holds DRM master; inspect boot ordering with
`systemd-analyze critical-chain sddm.service`.

## Roll back

```sh
bash ~/dotfiles/setup/oneoff/intel-full-rgb/setup-intel-full-rgb --uninstall
```

This disables the unit, removes managed files, restores any saved files,
reloads systemd/udev, and consumes the backups. Repeated uninstall does nothing.
A pre-existing system unit is restored but must be re-enabled manually if
needed. A restored earlier udev rule will resume its earlier behavior; remove
that restored rule if the goal is to retire that attempt too. Reboot to reset
the current DRM property; stopping the oneshot does not change the live range.
Packages are retained because other software may use them.

## Limits and local checks

This sets a boot-time KMS property; it does not enforce it on hotplug, resume,
GPU reset, or against a compositor that overwrites it later. Test these paths
on the hardware if needed. Starting another compositor manually on a different
TTY before this unit finishes is outside the SDDM boot ordering guarantee.
Changing port, driver, or adding another Intel GPU requires revisiting this workaround.

```sh
python3 tests/setup/test_intel_full_rgb.py
shellcheck -x --source-path=SCRIPTDIR setup/oneoff/intel-full-rgb/setup-intel-full-rgb
systemd-analyze --generators=no verify setup/oneoff/intel-full-rgb/intel-full-rgb.service
```

Tests cover discovery, changed IDs, other ports, multiple i915 cards,
disconnected-port skipping, initialization retries, permission failures, no-op operation, and readback.
They do not establish real DRM writes or persistence across reboot.
