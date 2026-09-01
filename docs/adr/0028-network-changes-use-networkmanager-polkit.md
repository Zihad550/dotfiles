# Network changes use NetworkManager's polkit authorization

The Network Page changes connection profiles through NetworkManager as the
logged-in user and relies on the system polkit agent when administrator
authorization is required. It installs no passwordless sudo rule, global DNS
writer, or relaxed polkit policy; canceling authentication leaves the profile
unchanged. This deliberately adapts Omarchy's DNS backend so the Page can
preserve this repository's resolver and Tailscale split-DNS ownership.
