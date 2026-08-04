# 22 — Wi-Fi Provider

**What to build:** The Wi-Fi networks in range become Entries in the Launcher, and connecting to one — including typing its password — happens without leaving the Launcher. `nmtui` in a terminal stops being how an ordinary network gets joined.

**Blocked by:** 06 — Core Action vocabulary. Needs one Launcher change (secret Prompts, below) that no existing Provider has asked for.

**Status:** wontfix — superseded by the Quick Settings Wi-Fi Page. See
`.scratch/quick-settings-wifi/spec.md` and
`docs/adr/0001-wifi-in-quick-settings-not-launcher.md`.

The design below is kept rather than deleted: its reading of the
`Quickshell.Networking` API, the `ConnectionFailReason` mapping and the
frozen-order argument all carried over to the Quick Settings work unchanged.
Only the surface changed.

- [ ] Networks in range are listed with their signal strength, security and whether they are saved or active
- [ ] Selecting a saved or open network connects to it with no further input
- [ ] Selecting a secured network that is not saved asks for its password in the Launcher and connects
- [ ] A typed password is never visible on screen
- [ ] A connection attempt shows its progress and names the reason when it fails
- [ ] A wrong password can be retried without reopening the Launcher
- [ ] Disconnecting and forgetting a network are Actions on its Entry
- [ ] The scanner runs while the Provider is open and not otherwise
- [ ] Arriving scan results do not move the highlighted row
- [ ] A hard-blocked or disabled radio says so instead of listing nothing
- [ ] The bar's network row no longer shells out to `nmtui` for the ordinary case

## Design

### It is all one API, and that decides the shape

`Quickshell.Networking` covers this end to end — verified against the module
headers (`src/network/{network,device,wifi,enums,qml}.hpp`), not assumed:

- `Networking.devices` → `WifiDevice` (`type === DeviceType.Wifi`), whose
  `networks` model is the listing. The bar's `NetworkItem.qml` already reads
  exactly this.
- `WifiDevice.scannerEnabled` — writable. Turns the scan on, which populates
  and keeps updating `networks`.
- On each `WifiNetwork`: `name`, `signalStrength` (0.0–1.0), `security`
  (`WifiSecurityType`), `known`, `connected`, `state` (`ConnectionState`),
  `stateChanging`, `nmSettings`.
- Actions: `connect()`, `connectWithPsk(psk)`, `connectWithSettings(settings)`,
  `disconnect()`, `forget()`.
- Outcome: the `connectionFailed(reason)` signal, `ConnectionFailReason` being
  `Unknown`, `NoSecrets`, `WifiClientDisconnected`, `WifiClientFailed`,
  `WifiAuthTimeout`, `WifiNetworkLost`.
- Radio: `Networking.wifiEnabled` (rfkill soft block, writable) and
  `wifiHardwareEnabled` (read-only).

So **no subprocess anywhere.** This is not the `Systemd.qml` shape — there is
no listing to parse, no argv to build, no exit code to interpret. That removes
most of what a `lib/wifi.js` would have held. What remains pure and worth
testing in node is small but real: the signal-icon ladder, the sub-line text,
the sort order, and the mapping from `ConnectionFailReason` to a sentence a
person can act on. Everything else is bindings in `modules/Wifi.qml`.

Not in the default pool, for `rankedRoutable`'s stated reason — this is a menu
you choose *before* you search it, and a row whose Return reconfigures the
network one tie away from a Query that meant an application is the same hazard
`kill -9` was. Reached from the `?` list via `enter()` (`NestableProvider`).
No prefix: the useful characters are taken, and nothing about "wifi" wants a
sigil.

### The scanner is held open, not pulsed

`scannerEnabled` is a state, not a one-shot rescan, and that is the better
fit: bind it to the Provider being entered. On `enter()` it goes true and the
list fills and keeps refreshing; on close or `back` it goes false.

It must not be left on. A continuously scanning Wi-Fi radio costs power and
airtime, and this Provider is open for seconds at a time. Bind it to `active`
and `entered` — the same properties `Themes.qml` and `Workspaces.qml` already
use to drop session state — rather than setting it imperatively in two places
that can disagree.

### The password is a Prompt, and Prompts need a secret mode

CONTEXT.md already has the concept and the Launcher already has the machinery:
a Prompt is a Provider taking over the Query line for one line of text —
`prompting`, `promptValue`, `promptVerb`, `promptPlaceholder`, `applyPrompt`,
`cancelPrompt`, as `Workspaces.qml` uses for rename. A password is that, with
one property nothing has needed yet:

- **`promptSecret`** on the Provider, read by Launcher.qml's `TextInput` as
  `echoMode: TextInput.Password`. Without it the password is on screen, in an
  overlay-layer surface, at whatever size the Query line is.

That is the only Launcher.qml change this ticket needs, and it belongs there
rather than in the Provider — the Provider does not own the text field.

The secret itself is safe by construction: `connectWithPsk(psk)` takes a QML
string and hands it to NetworkManager over DBus. It never becomes a process
argument, so there is nothing readable in `/proc` — which matters in a repo
that ships a Provider (`Processes.qml`) whose whole job is showing people
`ps -eo cmd` output. Just don't log it, and don't leave it on a property after
`applyPrompt` — clear it in `cancelPrompt` the way `Workspaces.qml` clears
`promptingEntry`.

**When to prompt** — two paths, both needed:

- *Ahead of time*, when the network is `!known` and `security` is neither
  `Open` nor `Owe`. This is the common case and prompting first is honest
  about what is about to be asked.
- *In response to `NoSecrets`*, which is a distinct `ConnectionFailReason`
  rather than something to be inferred. This catches what the first path
  cannot know: a `known` network whose saved secret is wrong or was never
  stored. Same Prompt, opened from the failure handler.

The second path is also what makes "retry a wrong password without reopening"
fall out for free.

### Stay open while connecting

`Systemd.qml` closes on its primary Action and reports by notification,
because a restart has no observable in-progress state and re-listing is not
confirmation. **Wi-Fi is the opposite case and should behave differently.**
`state` moves through `Connecting` → `Connected`, `stateChanging` says when
it is in flight, and `connectionFailed` gives a typed terminal reason. There
is a real thing to show.

So: stay open on connect, show the state on the row (`Connecting…`), close
once `Connected`. On `connectionFailed`, stay open and put the reason where
the row's sub-line is — `NoSecrets` reopens the Prompt, `WifiNetworkLost` says
the network went away, `WifiAuthTimeout` says the handshake timed out. Closing
here would be actively worse than staying: connecting drops and reacquires the
link, and a notification delivered through a network transition is the least
reliable moment to depend on one.

### Rows

Name is the SSID. Sub-line in the manner of `subtextFor` elsewhere:
`85% · WPA2 · saved`, with `active` in place of `saved` for the current
connection, and the transient state replacing the tail while connecting. Icon
from the signal ladder the bar already spells out (`󰤯 󰤟 󰤢 󰤥 󰤨`) — same five
glyphs, same 0.0–1.0 thresholds, moved into `lib/wifi.js` so both callers read
one definition.

`WifiSecurityType` has twelve values and the sub-line should not print
`Wpa3SuiteB192`. Fold them to what a person distinguishes: open (`Open`,
`Owe`), a PSK label (`WpaPsk`, `Wpa2Psk`, `Sae`), enterprise (`Wpa2Eap`,
`WpaEap`, `DynamicWep`, `Leap`), and legacy WEP. That fold is the pure half's
main job and is exactly what a node test should pin.

Entry Key: `wifi:<ssid>`. One of the few listings whose rows genuinely recur —
home, office, phone hotspot — so Frecency has something real to learn, unlike
a systemd unit.

### The rows must not move under the cursor

This is the failure mode specific to this Provider, and holding the scanner
open makes it more likely, not less. Scan results arrive continuously and
`signalStrength` jitters by a few percent the whole time. A list sorted live
by strength reorders itself between the moment a row is highlighted and the
moment Return is pressed — and here that means joining a different network
than the one that was read, or typing a password into a Prompt for the wrong
SSID.

So: sort once when the Provider is entered and hold that order while it stays
open. Newly discovered networks append rather than insert. The percentages in
the sub-line may keep updating live — that is text, it moves nothing. Order
changes only on a fresh `enter()`.

Sort key: active network first, then `known`, then signal strength bucketed to
roughly the icon ladder's five steps, with Frecency breaking ties inside a
bucket. Bucketing rather than raw strength is what stops two networks a
percent apart from swapping on the next scan.

### Actions

- **primary — connect.** `connectWithPsk(psk)` after the Prompt, plain
  `connect()` for open and `known` networks. Stays open, per above.
- **disconnect** — `disconnect()`, only meaningful on the active network.
- **forget** — `forget()`. Destructive and quiet; it wants a modifier chord,
  not a bare Return neighbour.

Radio on/off is available (`Networking.wifiEnabled`) and is still left out of
this Provider: it is a state of the machine, not of any Entry, so it belongs in
the system menu next to the other toggles. But the Provider must *read* it —
if `wifiEnabled` is false, or `wifiHardwareEnabled` is false (a hard rfkill,
which software cannot undo), the empty list needs to say which. An empty
Provider that looks identical to "no networks in range" is the bug this
checkbox exists to prevent.

### Where nmtui still belongs

`connectWithPsk` covers PSK security only — the header says so explicitly:
`WpaPsk`, `Wpa2Psk`, `Sae`. Enterprise networks (`Wpa2Eap`, `WpaEap`,
`DynamicWep`, `Leap`) need identity, certificates and a phase-2 method, which
is `connectWithSettings(NMSettings*)` against a profile that has to exist
first. This Provider should not try to build one from a Query line.

That gives the escape hatch a principled boundary rather than a vague one:
enterprise auth, static addressing and VPNs stay with `nmtui`. So
`NetworkItem.qml`'s `onClicked` moves to entering this Provider, and `nmtui`
keeps a modifier-click. What is not defensible is leaving the plain click on
`nmtui` and quietly having two answers for joining a coffee shop network.

### Open questions

- Does the `WifiDevice.networks` model deduplicate an SSID advertised by
  several access points, or is a mesh network several rows? If it is several,
  the pure half needs to collapse them by name and keep the strongest — a
  three-row listing for one office network is worse than useless as a picker.
- `Network.nmSettings` is a list, so a network can have more than one saved
  profile. Whether `connect()` picks sensibly among them, or whether a network
  with two profiles needs a disambiguating row, is worth one look on the host
  before deciding it does not matter.

## Comments

Closed as `wontfix` during the Quick Settings Wi-Fi grilling session, before
any code was written.

The question put was whether the Launcher Provider and a bar popup should both
exist over a shared `WifiService` singleton, or whether one surface should win.
One surface won, and the Launcher was not it — reasoning in
`docs/adr/0001-wifi-in-quick-settings-not-launcher.md`.

Consequence worth recording: because there is now exactly one surface, **no
shared service was extracted**. The API access lives in the Quick Settings
Page. If a second surface is ever wanted, that logic has to come out into a
singleton first — `TailscaleService.qml` is the shape to copy.

What survived into `.scratch/quick-settings-wifi/`: the API table, the
`ConnectionFailReason` → message mapping, the frozen-order argument (which
matters *more* with a pointer than with a keyboard), the `known` + `security`
rule for when to prompt, and the enterprise boundary at `connectWithPsk()`.
What died with it: `promptSecret` on the Launcher's Query line, `lib/wifi.js`
as a node-tested pure half, the `wifi:<ssid>` Entry Key and Frecency ranking.
