# SDDM does not own the Desktop Keyring

The Desktop Keyring belongs to the logged-in session, not the Greeter. SDDM's
`pam_gnome_keyring` auth and password hooks are removed, while setup keeps a
passwordless default keyring and enables `gcr-ssh-agent.service` for SSH
credentials after login. This mirrors Omarchy's SDDM boundary and avoids
turning Greeter authentication into a second, conflicting keyring owner.

Existing keyring files are preserved rather than replaced, so rerunning setup
cannot discard application credentials.
