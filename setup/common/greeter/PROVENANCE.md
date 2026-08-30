# Pinned Omarchy Greeter provenance

The vendored Greeter is copied from Omarchy `4.0.0.alpha` at commit
`83881e979b35468c3e7d60b171e319ede61a88fd`.

## Upstream source paths

- `default/sddm/omarchy/Main.qml`
- `default/sddm/omarchy/{bullet,entry,entry-failed,lock,lock-failed,logo}.png`
- `default/sddm/omarchy/{metadata.desktop,theme.conf}`
- `default/sddm/hyprland.lua`
- `etc/sddm.conf.d/10-wayland.conf`
- `etc/sddm.conf.d/10-theme.conf`

Those files are copied into this directory so setup and recovery do not depend
on the ignored `resources/omarchy` checkout. `tests/greeter/wiring.test.js`
pins their SHA-256 digests to make an upstream refresh explicit.

## Local adaptations

- The files are installed into Arch's `/usr/share/sddm` and
  `/etc/sddm.conf.d` paths with root ownership.
- Package installation names the official Arch Qt6 runtime dependencies and
  `ttf-jetbrains-mono-nerd`; no source code is changed.
- `validate`, `df-greeter-refresh`, and `df-greeter-reset` are repository-owned
  safety and recovery wrappers around the pinned files.
