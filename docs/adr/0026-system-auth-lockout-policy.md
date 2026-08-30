# System authentication uses Omarchy's lockout policy

The Arch boxes use one system authentication policy for the Greeter, TTY
login, and sudo. The policy allows ten consecutive failures and unlocks after
120 seconds. The Session Lock remains separate because it authenticates an
already-running session and keeps its own persistent tally under
`/var/lib/df-lock/faillock`.

## Implementation

`setup/arch-hyprland/setup-packages/setup-sudo-tries` updates the package-owned
`/etc/pam.d/system-auth` and `/etc/pam.d/sddm-autologin` files to the expected
Arch PAM shape. It validates both structures first, stages every result, and
only then installs them. SDDM keeps one `authsucc` line after `pam_permit`; its
login-time `preauth` line is removed as in Omarchy's reference setup.

The script updates `deny` and `unlock_time` in `/etc/security/faillock.conf`
without changing other local settings. Before any installation it stores the
original files, including the sudoers drop-in, in a timestamped directory under
`/var/lib/dotfiles/auth-backups/`. A failed installation restores those files.

The policy runs after the shared Greeter setup has installed SDDM and before
the box's post-install steps. It does not restart SDDM, log out the user, or
alter the Session Lock service.
