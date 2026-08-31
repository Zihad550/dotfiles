# Greeter recovery and host verification

Boot Branding is the system-owned artwork and colors shared by Plymouth and the
Greeter. It does not follow the logged-in Desktop Theme. SDDM is the only
Greeter and uses one selected account. The Session Lock covers an existing
session and keeps its own PAM service and failure tally.

On a machine with an effective `/etc/crypttab` entry, setup enables SDDM
autologin because the disk passphrase is the boot authentication boundary.
Other machines keep password authentication in SDDM. System login, TTY, and
sudo allow ten failures and unlock after 120 seconds. Session Lock failures do
not consume those attempts.

## Recovery

Return SDDM to its package-provided theme and compositor configuration. This
does not stop or restart the running SDDM service.

```bash
df-greeter-reset
```

Pass: `/etc/sddm.conf.d/10-theme.conf`,
`/etc/sddm.conf.d/10-wayland.conf`, `/usr/share/sddm/hyprland.lua`, and
`/usr/share/sddm/themes/omarchy` are absent. SDDM uses its stock Greeter on its
next start.

Restore the previous boot configuration from the newest persistent backup.
The manifest records whether each path existed before setup. This restores the
saved GRUB, mkinitcpio, Plymouth, initramfs, and UKI files without rebuilding
them from the broken configuration.

```bash
backup=$(sudo find /var/lib/dotfiles/greeter-backups -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)
test -n "$backup" && sudo test -f "$backup/manifest"
while read -r state relative; do
  sudo rm -rf -- "/$relative"
  if [ "$state" = present ]; then
    sudo mkdir -p -- "$(dirname "/$relative")"
    sudo cp -a --no-preserve=ownership "$backup/$relative" "/$relative"
  fi
done < <(sudo cat "$backup/manifest")
```

Pass: every `present` path in the selected `manifest` matches its copy under
that backup, and every `absent` path is absent. Keep the backup until the
machine has booted successfully.

## Manual verification

These checks are not verified by the automated suite. Run them on a graphical
host. A headless container is never visual proof.

Check the theme without ending the current session when the host supports SDDM
test mode.

```bash
sddm-greeter-qt6 --test-mode --theme /usr/share/sddm/themes/omarchy
```

Pass: a test Greeter window opens with the pinned logo, background, password
field, and no QML or image errors. If the command cannot connect to the host's
display, record test mode as unsupported rather than passing it by inspection.

Verify the encrypted-root prompt and Plymouth presentation on the first reboot.

```bash
sudo reboot
```

Pass: the encrypted-root prompt accepts the disk passphrase, uses the pinned
Plymouth artwork, proceeds without hanging, and SDDM appears with the pinned
Greeter. On an unencrypted machine, record the encrypted-root check as not
applicable.

Verify SDDM after logout.

```bash
loginctl terminate-user "$USER"
```

Pass: the session ends, SDDM appears, the selected account and Omarchy session
are remembered, and password login starts a working session. On a machine where
crypttab-based autologin is active, SDDM starts that session automatically.

Verify custom branding, then restore the pinned default. Replace `<logo.png>`
with a readable, non-symlink PNG.

```bash
df-boot-branding-set '#20242b' '#f4f4f5' <logo.png>
sddm-greeter-qt6 --test-mode --theme /usr/share/sddm/themes/omarchy
df-boot-branding-reset
sddm-greeter-qt6 --test-mode --theme /usr/share/sddm/themes/omarchy
```

Pass: the first test window uses the supplied colors and logo in the Greeter,
the command rebuilds Plymouth with the same assets, and the second test window
shows the pinned defaults after reset.

Verify stock Greeter recovery and setup reapplication. Each `loginctl` command
ends the current graphical session.

```bash
df-greeter-reset
loginctl terminate-user "$USER"
```

Pass: after the session ends, SDDM uses its stock Greeter. Log in again, open a
terminal in this repository, and reapply setup.

```bash
repo=$(git rev-parse --show-toplevel)
DOTFILES_DIR="$repo" "$repo/setup/common/setup-greeter"
loginctl terminate-user "$USER"
```

Pass: setup completes without rebooting, logging out, restarting SDDM, or
switching virtual terminals. The second logout shows the pinned Greeter again.
Run this block from the repository checkout so `git rev-parse` selects the
right setup files.
