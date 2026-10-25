# Local DNS policy

DNS setup and Tailscale domain forwarding are separate operations.

| Target | Default DNS |
| --- | --- |
| Arch devbox | `1.0.0.3`, strict authenticated DNS over TLS |
| Ubuntu LXC devbox | Same as Arch devbox |
| Arch workstation | Router/DHCP-supplied DNS |

## Base setup

Run the wrapper belonging to this machine:

```sh
# Choose ONE:
setup/arch-devbox/setup-dns
setup/arch-workstation/setup-dns
setup/ubuntu-lxc-devbox/setup-dns
```

Setup configures the default resolver and disables Tailscale's automatic DNS
configuration if tailscaled is active. It does not add forwarding domains or
install the forwarding service. Subsequent Tailscale joins on supported
`DOTFILES_PROFILE` values also use `--accept-dns=false`.

Both Arch installers run their DNS wrapper automatically. Run the LXC wrapper
separately after its existing `init`; it installs `systemd-resolved` and creates
`/etc/.pve-ignore.resolv.conf` so Proxmox leaves the resolver file under local
ownership on reboot. See [Tailscale's Proxmox guidance](https://tailscale.com/docs/reference/troubleshooting/containers/proxmox).

The shared setup enables resolved, installs the default policy at
`/etc/systemd/resolved.conf.d/10-dns-override.conf`, configures NetworkManager
when installed, and points `/etc/resolv.conf` at
`/run/systemd/resolve/stub-resolv.conf`. NetworkManager is reloaded rather than
restarted; tailscaled is not restarted. Existing forwarding choices survive
rerunning base setup.

If the earlier dnsmasq proposal was applied, remove its two exact files first:
`/etc/NetworkManager/conf.d/90-local-dnsmasq.conf` and
`/etc/NetworkManager/dnsmasq.d/90-work-tailscale.conf`. Retain unrelated custom
configuration and audit `NetworkManager --print-config` for competing plugins.

## Add a Tailscale DNS domain

```sh
df-tailscale-dns
```

This Gum command prompts for a domain, for example `example.ts.net`. Enter a
plain domain without a scheme, port or wildcard. Cancel or leave it blank to
make no changes. Gum must be installed and the checkout's `bin` commands on
PATH; alternatively run `~/dotfiles/bin/df-tailscale-dns`.

The command validates and normalizes the domain before requesting sudo, saves
it in `/etc/dotfiles/tailscale-dns-domains`, and applies forwarding to
`100.100.100.100`. Repeat the command to add more domains. The Settings app's **Tailscale DNS** page
(`df-settings tailscale`) lists the saved domains and adds one through the same
installer, asking for your password through polkit. Earlier choices are
preserved, duplicates are ignored, and concurrent additions are serialized.

Only this command installs the forwarding helper, systemd service and refresh
timer. The helper sets `DefaultRoute=no` and `DNSOverTLS=no` on `tailscale0`,
then sets the saved domains as routing-only suffixes (`~domain`). Each domain
and its subdomains use Tailscale DNS; the default resolver stays unchanged.
There is no automatic search suffix or tailnet reverse DNS configuration.

The service reapplies the saved list after resolved starts, tailscaled starts,
and the interface appears. A 30-second refresh timer also handles containers
without udev device events. When Tailscale is stopped the list remains saved;
forwarding is applied when its interface becomes available. Failed service
applications retry every three seconds and report errors in the journal.
NetworkManager leaves `tailscale0` unmanaged to preserve this local ownership.

Tailscale documents that its local MagicDNS resolver remains available with
DNS acceptance disabled, provided MagicDNS is enabled on the tailnet:
[resolv.conf and MagicDNS](https://tailscale.com/docs/reference/faq/dns-resolv-conf).
Resolved selects the most-specific matching domain:
[resolver routing](https://www.freedesktop.org/software/systemd/man/latest/systemd-resolved.html).

## Verify

After adding the example domain:

```sh
readlink -f /etc/resolv.conf
resolvectl status
resolvectl query --cache=no host.example.ts.net
resolvectl query --cache=no example.com
journalctl -u dotfiles-tailscale-dns.service -b --no-pager
```

Expect the stub symlink, the saved routing domains and `100.100.100.100` on
`tailscale0`, with `DefaultRoute=no` and `DNSOverTLS=no`. The work query must
report `tailscale0`; the ordinary query must not. Before any domains are added,
no Tailscale DNS route is expected.

On devbox, global DNS should list only `1.0.0.3#family.cloudflare-dns.com`,
`~.` and strict DoT; TCP 853 must be reachable. Workstation uplink DNS should
match DHCP. If DHCP supplies Pi-hole, uncached ordinary queries should appear
in its log. Cloudflare Family filters malware and adult content, not ads.

Repeat the queries after resolver restart, Tailscale reconnect, uplink reconnect
and reboot. On systems without device events allow up to 30 seconds for a new
interface. Repository tests cannot verify actual network routing.

The global `Domains=~.` outranks links that are only the default route, so their
DNS servers (e.g. from DHCP) are not used for ordinary lookups. A link that also
routes `~.` receives every lookup in parallel with the global DNS; when global
DNS is set (devbox), `setup-dns` warns about such links and prints the `nmcli`
commands to clear them, without changing the connection itself. The
`-- link:` label in `resolvectl query` names the interface the reply arrived on,
not which server answered.

Audit other resolved drop-ins and per-link domains: more-specific domains from
other VPNs or DHCP, or another `~.` route, can select other upstreams. Browser
DoH and application-specific resolvers can bypass system DNS policy. Direct
Tailscale IP connections require no DNS.

## Remove domains or undo

Edit `/etc/dotfiles/tailscale-dns-domains` with `sudoedit`, then run:

```sh
sudo systemctl restart dotfiles-tailscale-dns.service
```

An empty list removes the link's DNS configuration. To restore Tailscale-managed
DNS entirely, disable local forwarding first:

```sh
sudo systemctl disable --now dotfiles-tailscale-dns.timer
sudo systemctl disable --now dotfiles-tailscale-dns.service
sudo resolvectl revert tailscale0  # if the interface exists
sudo tailscale set --accept-dns=true
```

This retains resolved and the default resolver policy. To undo that policy too,
restore the previous `10-dns-override.conf` or remove the installer-owned drop-in
and restart resolved. Restore prior NetworkManager settings separately if
needed. Keep `/etc/resolv.conf` owned by the resolver you retain.
