# Pinned Omarchy Network Page provenance

This slice uses Omarchy `4.0.0.alpha` at commit
`83881e979b35468c3e7d60b171e319ede61a88fd`.

## Upstream source paths

- `bin/omarchy-network-status` → `bin/df-network-status`
- `bin/omarchy-cmd-present` → existing `bin/df-cmd-present`
- `bin/omarchy-network-band` → `bin/df-network-band`
- `bin/omarchy-network-speedtest` → `bin/df-network-speedtest`
- `bin/omarchy-network-qr` → `bin/df-network-qr`
- `bin/omarchy-network-password` → `bin/df-network-password`
- `shell/plugins/panels/network/Model.js` →
  `quickshell/.config/quickshell/dotfiles/modules/lib/network.js`
- `shell/plugins/panels/network/Panel.qml` →
  `quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml`
- `shell/plugins/panels/speedtest/Panel.qml` and `shell/Ui/SpeedTestOverlay.qml` →
  `quickshell/.config/quickshell/dotfiles/modules/SpeedTestOverlay.qml`
- `shell/plugins/panels/wifiqr/Panel.qml` →
  `quickshell/.config/quickshell/dotfiles/modules/WifiShareOverlay.qml`
- `bin/omarchy-dns` → per-profile NetworkManager behavior in `bin/df-network-dns`

The status helper changes only the two command-presence calls from
`omarchy-cmd-present` to the repository's existing `df-cmd-present`. Its
current SHA-256 pin is
`cd1bbd6ed810d4a7130124b02df4b0a0b79e908983c07bbc78a48f2078619203`.

The existing `df-cmd-present` helper has SHA-256
`99aeaaf98adfba9aff39f4452464c082ca91f1f761aede9208c0d239c272e6ff`.

The upstream `bin/omarchy-network-band` at that revision hashes to
`89349eb91c7064060d108ba68abdecf887716e2b2da33c9b7682551d3fe95e79`.
The repository-owned helper adapts it for explicit multi-adapter targeting.
Its current SHA-256 pin is
`aa75f25c8f6b7e1325def940f9ae7103688b9429256f3a825508cb075062f834`.

The repository-owned speed-test helper requires an explicit interface and
passes that interface to every Fast.com request. This prevents a route change
from moving traffic to a different adapter while a test is running. Its
current SHA-256 pin is
`24a7c226183e599bfff7979b347c875ee2f2e61d9041576983c77487c9da01b9`.

The repository-owned QR and password helpers adapt the pinned upstream names
to `df-network-qr` and `df-network-password`. Their current SHA-256 pins are
`351ca7f133fbe6faa8df08b028d2a335a7d39409ff3f6358098c6d82fa4e50a1` and
`1360cb9533f4dcc71f8a253952b4424ba2941971f23eb360225362e172f9b0f2`.
QR sharing is optional: `qrencode` is not part of the core package install;
when it is absent, the Network Page leaves all other controls available and
disables only the QR action.

The upstream plugin manifest and plugin host are not part of this port. Runtime
and setup use only the repository-owned files, so they do not read the ignored
upstream checkout.

## Local adaptations

- The status helper is exposed as `df-network-status`, while its process and
  output contract remain unchanged. It calls the existing `df-cmd-present`
  helper instead of adding an upstream-prefixed duplicate.
- The band helper is exposed as `df-network-band`. It accepts an explicit
  interface, prefers the route-selected Wi-Fi device by default, then falls
  back to NetworkManager autoconnect priority. Band changes restore the
  previous profile setting and reconnect it when reassociation fails.
- `df-network-dns` is a repository-owned NetworkManager seam. It reads the
  profile backing the requested Default Route interface, changes only that
  profile, and reconnects it through NetworkManager. Automatic clears the
  profile override; stock and Custom providers set per-profile IPv4/IPv6 DNS.
  Failed authorization or reconnection leaves the saved profile unchanged or
  restores its captured settings. It writes no resolver file, sudo rule, or
  polkit policy and does not touch Tailscale split DNS.
- `df-network-wired` is a repository-owned NetworkManager seam. It delegates
  disconnect and policy-based reconnect to `nmcli`, while explicit profile
  activation is used only after the Page presents a multiple-profile choice.
- `network.js` keeps the route/status, formatting, traffic-delta, ping-sample,
  failure, route-availability, wired-profile, Wi-Fi target, band, DNS, and
  action-state helpers as plain state functions that Node tests and QML can
  use.
- `NetworkPage.qml` uses the repository's `QuickSettingsPage`, `PageRow`,
  `Theme`, and `df-network-status --verbose` process contract. It renders the
  selected route, wired action/profile states, Wi-Fi adapter target, and band
  reassociation states. `NetworkQuickSettings.qml` and `WiredTile.qml` are
  active in the Quick Settings composition, and both transport chevrons route
  to this same Page.
- `WifiShareOverlay.qml` renders the helper's matrix in a full-screen,
  exclusive layer. It passes the selected connected adapter explicitly,
  fetches a password only after reveal, and writes it to `wl-copy` only after
  an explicit copy action. Canceled process output cannot repopulate the
  overlay.
- Omarchy's panel controller, plugin registry, `KeyboardPanel`, IPC target,
  shared UI framework, and DNS or privileged helpers are not imported.
