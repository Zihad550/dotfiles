# The Greeter uses pinned Omarchy Boot Branding

The Arch targets use SDDM with the Omarchy Greeter and its minimal Hyprland
Wayland compositor configuration. The exact source is vendored at Omarchy
`4.0.0.alpha`, commit
`83881e979b35468c3e7d60b171e319ede61a88fd`; setup never needs the ignored
upstream checkout to be present.

## Why

The Greeter is visible before login, so it cannot consume the user's Theme.
Pinned Boot Branding gives both Arch machines the same tested login surface
without adding privileged writes to the normal theme switcher. Keeping the
source in the repository also makes a refresh reviewable and a recovery run
available when the upstream checkout is absent.

## Boundary and recovery

Only the SDDM theme, its Wayland configuration, and the small Hyprland config
are copied into system paths. `setup-greeter` validates assets, metadata, PNG
decoding, QML imports when available, and the Hyprland config before enabling
SDDM. It then selects one existing non-root account and an installed
Omarchy-compatible Wayland session. It prefers `omarchy.desktop`, then
`hyprland-uwsm.desktop`, then `hyprland.desktop`. A non-comment `/etc/crypttab` entry
enables the managed persistent autologin drop-in. Setup also enables it when
the running root is encrypted through `cryptdevice=` or `rd.luks.*`, which
covers systems that do not use `/etc/crypttab`. An absent or empty crypttab on
an unencrypted-root machine removes that drop-in. `df-greeter-refresh`
reapplies the pin;
`df-greeter-reset` removes these overrides and lets SDDM use its stock behavior.
Neither command restarts SDDM.

The Desktop Keyring remains session-owned. SDDM's GNOME Keyring auth and
password hooks remain removed, and no Greeter change adds GDM or moves keyring
ownership back into authentication.

The account resolver prefers `GREETER_USER`, then a non-root `SUDO_USER`, then
the invoking non-root account. It rejects root, missing accounts, and an
ambiguous multi-user system. It does not port Omarchy's first-owner or one-shot
autologin provisioning because this repository configures existing accounts.

The former stock-theme decision is retained for history in
[ADR 0020](0020-greeter-stays-stock-themed.md), now marked superseded.
