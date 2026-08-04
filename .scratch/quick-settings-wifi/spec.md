# Wi-Fi in Quick Settings

**Status:** ready-for-agent

## Problem Statement

Joining a Wi-Fi network on this machine means opening a terminal and running
`nmtui`. The bar already shows which network is connected and how strong it is,
two centimetres from where the decision gets made — but that display is
read-only, so seeing the problem and fixing it happen in completely different
places.

The cost lands hardest in exactly the situation where it is least welcome:
arriving somewhere new, on a laptop, needing to get online. There is also no
way to turn the radio off without either a terminal or a function key that not
every keyboard has.

Compounding it, the Row that shows network state is doing two jobs badly. It
shows Wi-Fi or Ethernet depending on which is connected, so neither is reliably
visible, and the moment either one gains a control the glyph starts meaning one
thing while doing another.

## Solution

Wi-Fi becomes something you operate from Quick Settings.

The Wi-Fi Row shows the network you are on. Its glyph is a switch — click it,
the radio goes off; click it again, it comes back. Clicking anywhere else on
the Row replaces the panel's contents with a Page listing every network in
range, ordered with the connected one first. Click one to join it. If it needs
a password, the Row expands into a masked field; if the password is wrong, it
says so and lets you type again without going anywhere. When it connects, the
panel returns to its rows showing the network you just picked.

Ethernet stops sharing a Row with Wi-Fi and gets its own, appearing only when a
cable is in.

`nmtui` does not go away, but it stops being the everyday answer. It becomes
the deliberate boundary for the things a panel should not attempt: enterprise
enrolment, static addressing, VPNs.

## User Stories

1. As someone at a laptop, I want to see which Wi-Fi network I am on in the bar, so that I do not have to run a command to answer an obvious question.
2. As someone at a laptop, I want to see the signal strength of my current connection, so that I can tell whether a slow page is the network or the site.
3. As someone arriving somewhere new, I want to open a list of the networks in range from the bar, so that I can get online without opening a terminal.
4. As someone choosing a network, I want the one I am already connected to shown first and marked, so that I can tell at a glance whether I need to do anything at all.
5. As someone choosing a network, I want networks I have joined before marked as saved, so that I know which ones will connect without a password.
6. As someone choosing a network, I want the list ordered by signal strength, so that the one most likely to work is nearest the top.
7. As someone choosing a network, I want the list to hold still while I aim at it, so that I do not click the row that just moved into the place I was pointing.
8. As someone choosing a network, I want signal percentages to stay current while the list is open, so that I am reading live information rather than a snapshot.
9. As someone choosing a network, I want networks discovered while I am looking to appear at the bottom, so that new arrivals never displace what I was about to click.
10. As someone who has picked a network, I want to see that it is connecting, so that I do not click again thinking nothing happened.
11. As someone who has picked a network, I want the panel to return to its rows once it connects, so that I can see the result in the place I started from.
12. As someone whose connection attempt failed, I want to stay on the list with the reason shown, so that I can try something else without reopening anything.
13. As someone whose connection failed, I want to know *why* it failed, so that I can tell a wrong password from a network that has gone out of range.
14. As someone joining a secured network, I want to type its password in the panel, so that joining a café network does not require a terminal.
15. As someone typing a password, I want it masked, so that it is not readable by anyone near my screen.
16. As someone who mistyped a password, I want to retype it where I am, so that a typo costs one retry rather than a fresh trip through the whole flow.
17. As someone who abandoned a password field, I want what I typed discarded, so that a half-typed secret is not sitting there when I come back.
18. As someone who has finished with the panel, I want the bar to stop taking keystrokes, so that my typing goes to the application I am actually working in.
19. As someone conserving battery, I want the radio to scan only while I am looking at the list, so that a panel I opened for the volume slider is not scanning for networks.
20. As someone who wants to go offline, I want to switch the radio off from the bar, so that I do not need a function key my keyboard may not have.
21. As someone with the radio off, I want the Row to say so, so that "no networks" is distinguishable from "not looking".
22. As someone with the radio off, I want clicking the network name to switch it on and show me the list, so that getting back online is one click rather than two.
23. As someone whose laptop has a physical wireless switch, I want the Row to tell me it is hard-blocked, so that I stop clicking a control that cannot possibly work.
24. As someone on a machine with no wireless adapter, I want the Row to say so, so that an empty panel is not mistaken for a broken one.
25. As someone using a wired connection, I want Ethernet shown on its own Row, so that plugging in a cable does not hide my Wi-Fi state.
26. As someone using a wired connection, I want that Row to appear only when a cable is connected, so that the panel is not carrying a permanently empty entry.
27. As someone leaving a network, I want to disconnect from the panel, so that I can drop a bad connection without a terminal.
28. As someone who no longer trusts a saved network, I want to forget it from the panel, so that my machine stops joining it automatically.
29. As someone clicking through the list quickly, I want destructive actions kept off the ordinary click, so that a slipped pointer cannot disconnect or forget the network I depend on.
30. As someone at a university or workplace, I want enterprise networks listed rather than hidden, so that a network I can see on my phone is not mysteriously absent from my laptop.
31. As someone at a university or workplace, I want clicking an enterprise network to open a tool that can actually enrol it, so that I am handed forward rather than left at a dead end.
32. As someone who has already enrolled an enterprise network, I want it to connect like any other saved network, so that the common case is not penalised by the hard one.
33. As someone reading the panel, I want each glyph to do what it depicts, so that I can predict what a click will do before making it.
34. As someone aiming at the radio toggle, I want a target larger than the glyph with a visible hover state, so that turning off my network is never something I do by accident.
35. As a future maintainer, I want the panel called the same thing in the glossary, the filenames and the comments, so that I am not searching for two names for one thing.

## Implementation Decisions

**Everything runs through the toolkit's networking API.** No subprocess, no
command output to parse, no exit codes to interpret — the sole exception is the
deliberate hand-off to `nmtui`. The contract, verified against the toolkit's
module headers rather than assumed:

| Need | API |
| --- | --- |
| the device | the networking singleton's device list, filtered to the Wi-Fi type |
| scan | `scannerEnabled` on the Wi-Fi device — a state held open, not a one-shot |
| the list | `networks` on that device |
| per network | `name`, `signalStrength` (0.0–1.0), `security`, `known`, `connected`, `state`, `stateChanging` |
| join | `connect()`, `connectWithPsk(psk)` |
| leave | `disconnect()`, `forget()` |
| outcome | the `connectionFailed(reason)` signal |
| failure reasons | unknown, secrets required, supplicant disconnected, supplicant failed, auth timeout, network lost |
| security types | twelve values spanning open, OWE, WEP, the PSK family and the enterprise family |
| radio | `wifiEnabled` (writable soft block), `wifiHardwareEnabled` (read-only hard block) |

`connectWithPsk` accepts the PSK family only, which is precisely where the
enterprise boundary comes from — it is a property of the API, not a scoping
preference.

**The password never becomes a process argument.** It is handed to the network
manager directly. This matters concretely in this repo, which ships a Launcher
Provider whose entire job is displaying running command lines.

**Quick Settings is renamed from "gear menu" before any feature work.** The
glossary, the module filename and every comment adopt the term. *The gear*
remains the name of the bar button that opens the panel — the button and the
panel are different things, and only the panel is renamed. Landed as its own
commit so the feature diffs carry no naming noise.

**The network list is a Page, not a second window.** The existing panel
replaces its rows with the list in place, reached from the Wi-Fi Row and left
by a back arrow. This is the decision that keeps the feature cheap: the focus
grab, the reopen guard and the dismiss path are all untouched, because there is
still exactly one window. The panel's height already tracks its content, so it
resizes for free. It is also the idiom the term Quick Settings comes with —
GNOME, Android and Windows all work this way.

**The Wi-Fi Row's glyph is a separate click target from the rest of the Row.**
The shared row chrome gains an optional glyph target, defaulting to off, so no
other Row changes behaviour. The glyph's hit area is padded well beyond the
glyph and carries a hover highlight — a bare sixteen-pixel target with no
affordance, whose action drops the connection, would be a mis-click waiting to
happen.

**Order is fixed when the Page opens and frozen until it closes.** Connected
first, then saved, then descending signal strength. Networks discovered while
open append at the bottom rather than inserting. Signal strength jitters
continuously, so a live-sorted list swaps rows under the pointer between aiming
and clicking — and the failure is joining the wrong network, or typing a
password into a field belonging to a different network. Percentages still
update live, because text changing moves nothing.

**Scanning is bound to the Page's own visible state**, so no dismiss path can
leave the radio scanning. The connected network's name and strength do not
depend on a scan, so the Wi-Fi Row stays populated with the scanner off.

**A password is asked for on two separate triggers.** Up front when a network
is secured, unsaved and uses a pre-shared key — all known before the click, so
attempting a doomed connect buys nothing. And again on a secrets failure, which
catches what the first rule cannot see: a saved network whose stored password
is wrong or was never kept.

**The bar may need to request keyboard focus, and if so only while shown.**
Nothing in the bar has ever accepted a keystroke. Whether the panel's existing
focus grab suffices is an open question resolved on the host before the
password field is built. A bar that permanently holds keyboard focus would take
keystrokes from whatever is actually being worked in.

**Success returns to the rows; failure stays on the Page.** Success closes the
loop where it started, with the Wi-Fi Row showing the new network. Failure
stays because the Page is where the fix is. Nothing dismisses mid-attempt:
connecting drops and reacquires the link, which is the worst moment to depend
on a notification arriving.

**Destructive actions are on right-click.** Disconnect on the connected
network, forget on any saved one, and no menu at all on a network that is
neither. Left-click stays purely "connect" so neither can be reached by the
click made forty times a week. The cost is discoverability, accepted
deliberately for rare actions.

**Ethernet becomes its own Row** rather than a fallback inside the Wi-Fi Row,
visible only when a wired device is connected, with no control at all. Once the
Wi-Fi glyph is a control, a shared Row would display a wired glyph whose click
toggles the wireless radio.

**Enterprise networks are listed, marked, and handed off.** Joining with a
password covers pre-shared keys only; enterprise needs an identity,
certificates and a profile that must already exist. Already-enrolled ones
connect normally. Unsaved ones launch `nmtui` and close the panel, the same
escape hatch the Bluetooth Row already uses.

## Testing Decisions

**There is no automated test coverage for this feature, by decision.** The bar
config has never had a test — it is QML bindings over a live compositor — and
this work does not introduce the pattern. A pure, QML-free module holding the
ordering, the click decision table and the presentation strings was proposed
and declined; the seam is not worth the indirection for this feature's size.

The consequence is stated rather than glossed: **the frozen-order guarantee has
no automated check, and it is the single thing most likely to regress
silently.** Nothing about a live-sorted list looks wrong in a screenshot — it
only shows up as clicking the wrong network occasionally. So its manual check
is written to be sharper than "looks fine": hold the Page open for a full
thirty seconds and confirm that percentages change while **no row moves**, and
that a newly discovered network arrives at the bottom rather than in place.

Every ticket therefore carries a `## Manual verification` section as its only
verification, structured per this repo's convention: one copy-pasteable block
per step, and for each, what a pass looks like. Where a claim can be checked
against something other than the panel's own display, it is — the radio's state
against `rfkill` and the network manager's own report, an active connection
against the connection list, a forgotten network against the saved profiles,
scanner activity against the system journal. A panel that merely *says* it
disconnected is not evidence that it did.

Agents cannot close these. The container has no compositor, no Wayland session
and no `quickshell` binary, so any ticket reaching a runtime checkbox is set to
`needs-info` and handed over. Ticking a runtime box from inspection is
forbidden — "the code looks right" is a different claim from "it works".

Two facts are unresolvable without the host and are isolated in their own
research ticket, because one of them gates the password field: whether the
panel receives keystrokes under its existing focus grab, and whether one
network advertised by several access points arrives as one row or several.

## Out of Scope

- **Enterprise enrolment.** Identity, certificates and phase-2 methods stay
  with `nmtui`.
- **Static addressing, DNS and VPN configuration.** Same boundary.
- **Per-connection settings** — metered flags, autoconnect priority, MAC
  randomisation.
- **Hotspot mode.** The device can act as an access point; nothing here exposes
  that.
- **Bluetooth.** Its Row keeps its current hand-off to `bluetui`, and gains
  nothing from this work beyond the shared glyph-target capability being
  available to it later.
- **A Launcher Wi-Fi Provider.** Explicitly rejected — a keyboard-driven
  network picker was designed, then closed as `wontfix`.
- **Any shared service between surfaces.** Because there is exactly one
  surface, the API access lives in the Page. A second surface would require
  extracting a singleton first.

## Further Notes

The API surface was verified against the toolkit's own module headers rather
than assumed. That correction mattered: the design initially called for reading
declaratively but acting through `nmcli`, on the theory that a command's exit
code was the only trustworthy signal of success. The headers showed a typed
failure signal that is strictly better than an exit code, and a password path
that never touches a process argument — which removed a subprocess layer, a
parsing layer and a security concern that turned out not to exist.

The decision to put Wi-Fi in the bar rather than the Launcher runs against this
repo's recent direction, which consolidated every picker into the Launcher and
deleted the alternatives. That is deliberate and recorded as an architecture
decision, because a future reader will otherwise reasonably assume it was an
oversight. The short version: those tickets consolidated pickers that answer a
*query*, and choosing a network is not one — the candidates are a short list
you did not author, picked by strength and recognition rather than by name,
acting on state already displayed inches away.

The rejected Launcher design is kept rather than deleted. Its reading of the
API, its failure-reason mapping and its frozen-order argument all carried over
unchanged; only the surface changed.
