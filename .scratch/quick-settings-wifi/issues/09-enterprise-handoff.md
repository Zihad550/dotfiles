# 09 — Enterprise hand-off

**What to build:** WPA-Enterprise networks are listed honestly rather than hidden or silently broken. Saved ones connect like anything else; unsaved ones open `nmtui`, which is the only thing that can enrol them.

**Blocked by:** 04 — connecting.

**Status:** ready-for-agent

- [ ] Enterprise networks appear in the list, marked as such
- [ ] An enterprise network you have already saved connects normally
- [ ] An unsaved enterprise network launches `nmtui` and closes Quick Settings
- [ ] No enterprise network silently fails or does nothing when clicked

## Why they cannot just work

Joining with a password covers pre-shared keys only. Enterprise networks — the
university and corporate ones — need an identity, certificates and a phase-2
method, against a connection profile that has to exist before anything can use
it. Building one from a text field in a bar panel is not in scope, and
pretending to would produce a field that cannot succeed.

A network already saved is different: the profile exists, so it connects
through the ordinary path with nothing special about it.

## Why listed rather than hidden

The network is visible on every other device you own. Omitting it from your own
bar reads as a bug rather than a decision, and sends you looking for a fault
that is not there.

So it is shown, marked `enterprise` where the signal detail goes, with a real
route through — the same escape hatch the Bluetooth row already uses to reach
`bluetui`. Quick Settings closes on the hand-off, because `nmtui` is a terminal
window that would otherwise open behind the panel.

This is the boundary recorded in `docs/adr/0001`: `nmtui` is retained
deliberately, for enterprise enrolment, static addressing and VPNs.

## Manual verification

Host-only. Needs an enterprise network in range — a university or corporate
SSID. If none is reachable, say so and leave this ticket open rather than
ticking it from inspection.

```bash
df-qs-restart
```

1. **Listed** — open the Page. The enterprise network appears, marked
   `enterprise` rather than showing a percentage alone.

```bash
nmcli -f SSID,SECURITY device wifi list | grep -i 802.1X
```

**Pass:** the networks this reports are the ones marked in the Page.

2. **Unsaved** — click it. A terminal opens running `nmtui`, and Quick Settings
   closes rather than sitting on top of it.
3. **Saved** — if you have one enrolled already, click it. It connects through
   the ordinary path, with no `nmtui` and no marker treatment beyond the label.
4. **Never silent** — every enterprise row does one of those two things. None
   is clickable-but-inert.
