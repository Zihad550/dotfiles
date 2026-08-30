# Migrate an existing machine to the session-owned keyring

This migrates an existing Arch Hyprland machine to the current setup:

- SDDM remains only the Greeter; it does not own the Desktop Keyring through
  PAM.
- The logged-in session owns the passwordless default keyring.
- `gcr-ssh-agent.service` serves SSH keys after login.
- Existing keyring files are preserved. The migration does not import or
  delete secrets automatically.

Run these steps from a local terminal or a trusted SSH session with a working
break-glass login path. The Greeter change takes effect after reboot.

## 1. Update the dotfiles

Use the actual checkout path if it is not `~/dotfiles`:

```bash
cd ~/dotfiles
git pull --ff-only
```

Confirm that the expected scripts exist:

```bash
test -x setup/arch-hyprland/keyring
test -x setup/common/setup-greeter
```

## 2. Back up the current keyring and SDDM PAM file

Do not delete `~/.local/share/keyrings`. Back it up before changing the
Greeter or keyring setup:

```bash
backup_stamp="$(date +%Y%m%d-%H%M%S)"
keyring_backup="$HOME/keyrings-before-dotfiles-migration-$backup_stamp.tar.gz"

if [[ -d "$HOME/.local/share/keyrings" ]]; then
    tar -C "$HOME/.local/share" -czf "$keyring_backup" keyrings
    echo "Keyring backup: $keyring_backup"
else
    echo "No existing keyring directory found; setup will create it."
fi
```

Back up SDDM's PAM file if it already exists:

```bash
pam_backup="/tmp/sddm-pam-before-keyring-migration-$backup_stamp"
if [[ -f /etc/pam.d/sddm ]]; then
    sudo cp -a /etc/pam.d/sddm "$pam_backup"
    echo "SDDM PAM backup: $pam_backup"
fi
```

## 3. Install the required packages

```bash
sudo pacman -S --needed sddm gnome-keyring libsecret seahorse
```

`gdm` is not required for the keyring. Do not remove `gnome-keyring` or
`libsecret`; they are the session's Secret Service stack.

## 4. Create missing keyring defaults safely

Run the repository script unconditionally. Its current contract is
non-destructive: it creates only missing files and preserves an existing
`Default_keyring.keyring` and `default` file.

```bash
~/dotfiles/setup/arch-hyprland/keyring
```

Inspect the result:

```bash
ls -la ~/.local/share/keyrings
cat ~/.local/share/keyrings/default 2>/dev/null || true
```

If an existing `default` file points to another keyring, it is intentionally
left unchanged. Do not rename or delete that keyring during this migration.

## 5. Apply the SDDM boundary

This installs and enables SDDM, disables and removes GDM when present, and
removes SDDM's `pam_gnome_keyring` auth/password hooks:

```bash
~/dotfiles/setup/common/setup-greeter
```

The PAM cleanup is idempotent. Verify it before rebooting:

```bash
if [[ -f /etc/pam.d/sddm ]]; then
    if grep -n 'pam_gnome_keyring' /etc/pam.d/sddm; then
        echo "Unexpected pam_gnome_keyring hook remains" >&2
        exit 1
    fi
    echo "SDDM PAM keyring hooks removed"
fi
```

## 6. Enable the session SSH agent

```bash
systemctl --user enable --now gcr-ssh-agent.service
```

If the unit is not found, rerun the Hyprland package/setup step that installs
the desktop layer, then repeat this command:

```bash
~/dotfiles/setup/arch-hyprland/setup-packages/setup-hyprland
```

## 7. Reboot and verify the new session

```bash
sudo reboot
```

After logging in, verify the Greeter and session agent:

```bash
systemctl is-active sddm.service
systemctl is-enabled sddm.service
systemctl --user is-active gcr-ssh-agent.service
systemctl --user is-enabled gcr-ssh-agent.service
```

Verify the keyring files and SSH identities:

```bash
ls -la ~/.local/share/keyrings
ssh-add -L
```

Open Seahorse and confirm that the existing credentials you need are still
visible. Test a Git operation that uses one of those credentials. If an old
encrypted `Login` keyring contains credentials, unlock it with its existing
password and move only the required items to the default keyring; keep the
backup and old keyring until the applications have been verified.

## Rollback

If the new Greeter does not start, switch to a TTY with `Ctrl+Alt+F3` or use
the trusted SSH session saved before migration:

```bash
sudo pacman -S --needed gdm
sudo systemctl disable --now sddm.service
sudo systemctl enable --force gdm.service
sudo reboot
```

Restore the PAM backup only if you need to return to the previous SDDM PAM
configuration:

```bash
sudo cp -a /tmp/sddm-pam-before-keyring-migration-YYYYMMDD-HHMMSS /etc/pam.d/sddm
```

Replace the timestamp with the exact path printed in step 2.

Do not restore the keyring archive over a working migrated keyring until all
applications have been closed and you have decided that a full rollback is
necessary. The archive is a recovery copy, not a routine cleanup step.
