# Migrate an existing machine to the session-owned keyring

This migrates an existing Arch Workstation machine to the current setup:

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
test -x setup/arch-workstation/keyring
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
~/dotfiles/setup/arch-workstation/keyring
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
    if grep -nE '^(-)?(auth|password).*pam_gnome_keyring\.so' /etc/pam.d/sddm; then
        echo "Unexpected pam_gnome_keyring auth/password hook remains" >&2
        exit 1
    fi
    echo "SDDM PAM keyring auth/password hooks removed"
fi
```

The `session ... pam_gnome_keyring.so auto_start` hook may remain. It starts the
Secret Service daemon but does not give it the Greeter password.

## 6. Enable the session SSH agent

```bash
systemctl --user enable --now gcr-ssh-agent.service
```

If the unit is not found, rerun the Hyprland package/setup step that installs
the desktop layer, then repeat this command:

```bash
~/dotfiles/setup/arch-workstation/setup-packages/setup-hyprland
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

## 8. Migrate secrets from an old Login keyring

This step applies when login shows an "Authentication required" prompt saying
that the `Login` keyring did not get unlocked. That prompt does not mean the
new default keyring failed. An application requested a secret that still lives
in the old encrypted `Login` keyring. SDDM no longer passes the login password
to that keyring, so it must be unlocked manually until its required secrets
have been moved.

Do not delete `login.keyring` to silence the prompt. It may contain application
credentials that have not been copied elsewhere.

1. Open **Passwords and Keys** (`seahorse`).
2. Under **Passwords**, find both **Login** and **Default keyring**.
3. Unlock **Login** with the password that previously unlocked it. This is
   normally the account password in use when the keyring was created, which
   may be an older password.
4. Inspect the items in **Login**. For each credential you still need, move or
   copy it to **Default keyring**. Seahorse versions differ: drag the item onto
   **Default keyring** when supported; otherwise note which application owns
   it, delete only that individual item, and let the application save it again
   into the current default keyring.
5. Close and reopen each affected application. Confirm that it still has its
   credential and does not request the **Login** keyring.
6. Log out and log back in. Confirm that the Login-keyring prompt no longer
   appears.
7. Keep the backup and `login.keyring` for several login cycles. Remove the old
   keyring through Seahorse only after every affected application has been
   tested. Removing it is optional; an unused old keyring does not need to be
   deleted.

If the old password is unknown, restore access application by application.
Sign in again or recreate each credential so it is stored in **Default
keyring**. The encrypted contents of `login.keyring` cannot be migrated without
its password.

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
