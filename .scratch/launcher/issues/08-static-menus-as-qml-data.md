# 08 — Static menus as QML data

**What to build:** The four hand-maintained menus — system, media, display and other — available from the Launcher, still extended by editing one file and seeing it reload.

**Blocked by:** 06 — Core Action vocabulary.

**Status:** done — all five closed on the host across two rounds, steps 1–3 then
steps 4–5. No round spent on a defect.

- [x] All four menus appear as Providers with every entry they have today
- [x] Adding an entry means editing one file and seeing it hot-reload, with no restart or build step
- [x] Every entry whose command relies on shell expansion still works — audited one by one, not assumed
- [x] A malformed entry surfaces as a load-time error rather than failing silently at activation
- [x] Entries duplicating another Provider are recorded for merging rather than ported twice

## Comments

### Host round 1 — steps 1 and 2 of the block, and all seven of step 3

**The config loads.** `df-qs-restart launcher --log` reached `Configuration
Loaded` with no QML error, so `Menu.qml`, the four data files and the JS import
all parse and resolve — including the two things that could not be checked from
the devcontainer: `required property` on a `QtObject` base satisfied by a
derived data file, and a sibling type referenced with no import statement.

**Nothing was dropped at load.** No `launcher:` warning appeared in the log,
which is a stronger result than it looks: every rejected declaration prints one,
so silence means all fifteen passed validation rather than being quietly skipped.
It also means the *absence* of that channel is not what a later missing entry
would be — a real load-time rejection is visible.

**All seven shell-expansion entries work** — the two display scripts, Compass
with its `$(pass env/mongodb_uri)`, both zellij sessions, Helium on Profile 2
and Zen on profile 008. That is the whole of what the port's per-entry audit was
predicting, confirmed on the host. **Closes checkbox 3.**

Two observations from step 2, neither a fault:

**Typing `logout` offers "Relaunch".** That is the pass condition, not a
mismatch — the entry is named Relaunch and carries `logout` as a keyword, so
this is the keyword corpus working. Same shape as `speaker` finding "Multi
media".

**Typing `other` offers only an unrelated application.** Also correct, and worth
writing down because it is a real gap rather than a bug: the corpus holds each
entry's name and keywords, and *not* the name of the menu it belongs to. So the
sub-line reads "Other" but the word "Other" matches nothing. Reaching one menu
as a menu is ticket 11's prefix routing; the alternative — folding the menu name
into every entry's corpus texts — is deliberately not done here, because it
would make all five of the other menu's entries match the word "other" equally
and bury a real query under them.

### Host round 2 — the fifteen entries, hot-reload, and the deliberate mistake

**All fifteen entries are present.** `lock` → Lock, `speaker` → Multi media,
`rotate` → the display orientation entries, `saved` → Layout: Restore saved,
`logout` → Relaunch, and the other menu's five confirmed by running them in
round 1. Four of those five queries are keyword matches rather than name
matches, so the keyword corpus is carrying its share rather than being dead
weight nobody would have noticed. **Closes checkbox 1.**

**Hot-reload works.** An entry added to `SystemMenu.qml` and saved was offered
without restarting anything, ran, and stopped being offered when deleted — the
log's three `Reloading configuration...` / `Configuration Loaded` pairs are that
sequence. **Closes checkbox 2.**

**A malformed entry is a load-time warning and a dropped Entry**, exactly as
specified:

```
WARN qml: launcher: system menu: entry "Broken on purpose" declares command as a
          string -- it must be an array, one element per argument
INFO: Configuration Loaded
```

Both halves matter and both are in those two lines. The warning names the menu,
the entry and what is wrong with it, at load — before anything could press
Return on it. And `Configuration Loaded` *follows* it: the bad declaration cost
its own Entry and nothing else, rather than taking the catalog binding down and
the whole merged list with it. That is the collected-not-thrown decision in
`catalogOf` doing the thing it was written for. **Closes checkbox 4.**

Both scratch entries have been removed from `SystemMenu.qml`.

### What was built

Four data files, one Provider, one pure module.

- `modules/Menu.qml` — the Provider. All of the behaviour: catalog, `actions`,
  the launch prefix, `run()`.
- `modules/SystemMenu.qml`, `MediaMenu.qml`, `DisplayMenu.qml`, `OtherMenu.qml`
  — the four menus, data and comments only.
- `lib/menus.js` — what a declaration means and which ones are refused, kept
  free of QML types so its tests run under node.
- `tests/launcher/menus.test.js` — 44 tests, of which 22 are the per-entry
  audit below.

The four join `pool` in `Launcher.qml` after applications, so they are reachable
from the main Launcher. Reaching a single menu by a prefix is ticket 11's, not
this one's.

They live in `modules/` beside `Applications.qml` rather than in a `menus/`
subdirectory: `Launcher.qml` already resolves `Applications {}` by bare name
from that directory, and a subdirectory would need `import "../menus"`, whose
resolution is not checkable from here.

### The declaration format, and why it is not elephant's

Elephant ran every entry's command through `sh -c`
(`resources/elephant/internal/providers/menus/setup.go:200`). Nothing here does
unless the entry asks. So a declaration names one of two fields:

- `command: ["argv", "one element per argument"]` — run directly. An argument
  with spaces and quotes inside it arrives intact, which three of the ported
  entries need.
- `shell: "…"` — run through `sh -c`. One entry needs this.

`command` given as a *string* is rejected rather than split on spaces.
`Applications.qml` keeps a string branch because it does not author the desktop
entries it reads; nothing forces one here, and splitting would tear the three
quoted arguments apart.

`scoped: false` opts an entry out of the `uwsm-app --` prefix. This is per entry
rather than per Provider because of `uwsm stop`: scoping it means asking systemd
to kill the process doing the asking.

### The audit, one entry at a time

Fifteen entries, each an assertion in `tests/launcher/menus.test.js` pinning the
exact argv, plus a guard test that fails if a command is edited in the QML
without the audit following it. Four findings:

**One entry genuinely needs a shell.** `MongoDB Compass env` substitutes
`$(pass env/mongodb_uri)`. It is the only `shell:` declaration in the four
menus.

**Four entries carry a leading `~`** — the three display rotations and the
layout restore, plus the three `df-launch-special-app` entries. Elephant's shell
expanded it; `execDetached` does not, and the failure would be a script simply
not found. `argvOf` expands a leading `~` explicitly (leading only, so a `~`
inside an argument is left alone).

**Three entries pass a whole command line as one argument**, one of them with
`"Profile 2"` quoted inside it. Those are single array elements now, which is
stronger than the shell quoting they had: nothing re-splits them.
`df-launch-special-app` passes that argument on to Hyprland's exec dispatcher,
which is what parses it.

**One entry already named `uwsm-app` itself** — Zen profile 008, because
elephant applied no launch prefix. Stripped from the data, since the prefix is
the Provider's job now; keeping it would have run `uwsm-app -- uwsm-app -- …`. A
test asserts no entry names `uwsm-app`.

### Two deliberate changes from what the menus do today

**The media menu's one entry has been doing nothing.** `media.toml` declared
`actions = {"pavucontrol" = ""}`. Elephant falls through an empty entry action
to the menu's own and then to the menu default, and returns without running
anything when all three are empty (`setup.go:115-146`) — which is this entry's
case. The action *name* is what said what it was meant to do, and it is the
command now. So this is a fix, and "parity" for this entry means something
different from the other fourteen.

**The system menu's icons are icon-theme names now.** `system.toml` carried
nerd-font glyphs (` `, `󰤄`, …) in the icon field, which worked because walker
rendered that field as text. The Launcher resolves it through
`Quickshell.iconPath`, where a glyph is a name nothing has and renders as a
blank slot. They are `system-lock-screen`, `system-suspend`, `system-reboot`,
`system-shutdown`, `system-log-out`; media's `🎧` is `multimedia-volume-control`.
Whether the active icon theme actually has all six is in the host block —
a miss costs a blank slot and nothing else.

The display menu's icons were already theme names and are unchanged.

**The other menu's icon was very nearly dropped.** None of its five entries
declares one, which read as "they have no icon" — but elephant falls an entry's
icon back to its *menu's* (`setup.go:369-372`), and `other.toml` declares
`icon = "applications-other"` at menu level, so all five render it today. The
first version of this port gave them nothing, and the review caught it: the
entries would have worked perfectly and looked subtly poorer, which is the
quietest way a port can go wrong. `Menu.qml` has a menu-level `icon` now, and
the audit pins the rendered icon for all fifteen entries rather than only the
argv.

### Recorded for merging

**The whole media menu duplicates the applications Provider.** Its single entry
launches pavucontrol, which has a desktop entry, a better icon, and no menu
around it. Ported as-is rather than dropped, because this ticket ports the four
menus as they are and deleting a whole menu is not a decision to take inside a
port. The merge is deleting `MediaMenu.qml` and its line in `pool` — nothing
else references it.

Nothing else duplicates. The other menu's flatpak entries look like application
entries but carry a profile argument no desktop entry has, and the two zellij
entries go through `df-launch-special-app` rather than launching anything
directly.

The commented-out entries at the bottom of `other.toml` are not ported: they are
not entries the menu has today. Several of them (volume, disk, date) depend on
elephant's `async` field, which has no analogue here.

### Left for later, deliberately

**`expandHome` and `launchPrefix` now exist twice** — in `lib/menus.js` and in
`Applications.qml`, which had them first. The right move is for the QML copy to
consume the tested one, and it is not made here: `Applications.qml` is
host-verified code that nothing in the devcontainer can re-check, and the ticket
that touches it should be one whose host block already opens the Launcher and
launches an application.

**Every menu entry is in the main pool.** Reaching one menu on its own, the way
a prefix or a dedicated keybind would, is ticket 11. Until then "Restart" is
matchable from an empty Query alongside applications and windows.

### Not done here

`elephant/.config/elephant/menus/*.toml` is untouched — deleting the elephant
configuration is ticket 19's, and until the keybind switches (ticket 10) walker
is still what reads it.

## Manual verification

Four checkboxes need the host. `qmllint` and `quickshell` do not exist in the
devcontainer, so nothing below could be run from here — including whether the
QML parses at all.

### 1. The config loads and the menus are there

```
scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** the log has no QML errors. A `Menu.qml` mistake shows here as a type
or property error and the *previous* config keeps running, so a launcher that
looks unchanged after this is usually an error in the log.

Then open the Launcher and type each of these. **Pass:** the named entry appears,
with `System` / `Multi Media` / `Display` / `Other` as its sub-line.

| type | expect |
| --- | --- |
| `lock` | Lock — System |
| `logout` | Relaunch — System (found by keyword, not by name) |
| `speaker` | Multi media — Multi Media (keyword again) |
| `rotate` | the three HDMI-A-1 entries — Display |
| `saved` | Layout: Restore saved — Display |
| `job apply` | Zen Browser profile 008 — Other (keyword) |
| `compass` | MongoDB Compass env — Other |
| `zellij` | both zellij sessions — Other |
| `helium` | Helium - work profile — Other |

Fifteen entries, all fifteen present. **Closes checkbox 1.** The footer should
read `⏎ run` on each of them.

Also worth a glance while the list is open: whether the six changed icons
resolve — the five system ones and media's. A blank slot means the active icon
theme has no such name, which is cosmetic but worth saying rather than leaving
noticed-and-unrecorded. The other menu's five all render `applications-other`,
which they inherit from the menu; the display menu's four are unchanged from
what walker shows today, so those eight are the control group.

### 2. The shell-expansion entries, one at a time

The audit fixes the argv; this is whether that argv does the thing. Press Return
on each and check the second column.

| entry | pass |
| --- | --- |
| `HDMI-A-1: Toggle orientation` | the monitor rotates — this is the `~` expansion |
| `Layout: Restore saved` | the saved layout is applied |
| `MongoDB Compass env` | Compass opens **connected** — a broken `$(pass …)` opens it unconnected, which is the failure to look for |
| `work - zellij session` | the work zellij session appears on its special workspace |
| `project - zellij session` | likewise for project |
| `Helium - work profile` | Helium opens on the *Profile 2* profile, not the default — the quoted argument |
| `Zen Browser profile 008` | Zen opens on profile 008 |

**Closes checkbox 3.** If one fails, `qs -c launcher log` shows the argv that
was run.

The other menu's remaining entries are not on this list because none of them
relied on the shell: `hyprlock`, three `systemctl` calls, `uwsm stop`,
`pavucontrol`. Worth pressing Lock and Multi media anyway — Multi media is the
entry that did nothing before this ticket.

### 3. Hot-reload

```
$EDITOR ~/dotfiles/quickshell/.config/quickshell/launcher/modules/SystemMenu.qml
```

Add an entry and save:

```qml
        {
            name: "Hot reload check",
            keywords: ["reload"],
            command: ["notify-send", "the menu reloaded"]
        },
```

**Pass:** without restarting anything, opening the Launcher and typing `reload`
offers it, and Return sends the notification. **Closes checkbox 2.** Then delete
it and save again — it should stop being offered just as quickly.

### 4. A malformed entry says so

Two halves, because two different things catch them.

**Syntax** — break the QML, say by deleting the closing `]` of `entries`:

```
qs -c launcher log
```

**Pass:** the log names the file and the line, and the Launcher keeps working on
the previous version rather than half-loading this one.

**Semantics** — restore the syntax, then declare an entry the parser accepts and
the Provider cannot run:

```qml
        {
            name: "Broken on purpose",
            command: "notify-send hi"
        },
```

**Pass:** the log gets
`launcher: system menu: entry "Broken on purpose" declares command as a string -- it must be an array, one element per argument`
on reload, and the entry is **not** offered in the list. The point is that both
happen at load, before anything can press Return on it. **Closes checkbox 4.**

Delete it afterwards.
