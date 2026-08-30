# Launcher

The keyboard-driven launcher: the thing that appears on `SUPER+SPACE` and lets a
query select and act on something. A Quickshell QML config of its own
(`quickshell/.config/quickshell/launcher/`); it replaced walker (frontend) plus
elephant (providers and matching), which were deleted outright in ticket 19 —
the keybind, the configs, the helper scripts and the packages are gone, and the
Launcher is now the only launcher.

## Deliberate drops

The symbol picker was the one Provider deliberately not ported from the old
launcher: walker's symbol/unicode/emoji pickers have no counterpart in the
Launcher, by design, not oversight. Named in the spec's Out of Scope
(`docs/launcher-spec.md`). The dmenu Surface was likewise eliminated, not
reimplemented — future ad-hoc scripts have no generic list-picker to call.

## Language

**Launcher**:
The window that takes a query and offers matching entries to act on.
_Avoid_: menu, picker, dmenu, runner, palette

**Surface**:
A distinct way of reaching the launcher, each with its own entry point and
scope — the main keybind, a prefix, a dedicated keybind, or dmenu.
_Avoid_: mode, entry point, invocation

**Provider**:
A named source of entries, responsible for producing them and saying what can
be done with them. Apps, open windows, screenshots, directories.
_Avoid_: menu, source, plugin, backend

**Entry**:
One selectable item offered by a provider.
_Avoid_: item, result, row, option, hit

**Action**:
Something that can be done to an entry, bound to a key. A provider's entries
share the same set.
_Avoid_: command, handler, activation

**Prefix**:
A leading character in the query that routes it to one provider instead of the
default set — `/` for directories, `$` for clipboard.
_Avoid_: sigil, trigger, mode char

**Query**:
The text typed into the launcher, after any prefix is stripped.
_Avoid_: search, input, filter, term

**Prompt**:
A provider asking for one line of text by taking over the query line, prefilled
and answered in place — renaming a workspace. Not a surface: same window, same
query line, no separate entry point.
_Avoid_: dialog, input box, edit mode, text prompt

**Chooser**:
The nested, unranked list a secondary Action opens — the directories
Provider's sub-menu, shown in place of the entries that opened it until the
back action closes it. Its corpus carries no entry keys. Not a Prompt: it asks
nothing and is never answered in place on a query line. Not a Surface: it has
no entry point of its own.
_Avoid_: submenu, sub-menu, page, popup, sub-list

**Marking**:
Selecting several entries within one provider to act on together, independently
of which one is highlighted. Lasts only as long as the launcher is open.
_Avoid_: multi-select, tagging, checking

**Entry Key**:
A stable identifier for an entry that survives catalog rebuilds and restarts,
supplied by a provider only when its entries genuinely have one. Absent for
entries that never recur.
_Avoid_: id, uid, hash, fingerprint

**Frecency**:
How often and how recently an entry has been chosen, accumulated against its
entry key. The only ranking signal comparable between providers.
_Avoid_: history, usage score, ranking, popularity

**Ordered Provider**:
A provider whose entries are offered in an order it fixes itself, rather than
one the shared ranking decides — files, which lists each matched folder
immediately followed by that folder's contents. Only ever reached through a
prefix, since an unranked list cannot be interleaved with a ranked one.
_Avoid_: unranked, sorted, grouped, static

**Directory Index**:
The shared set of directories offered by the Directories Provider and used by
the Files Provider to choose folders. Its membership follows the Launcher's
defined roots and exclusions. With Devcontainer Routing on and a custom host
set, the Directories Provider also merges in a remote Directory Index scanned
from that host over SSH — the Files Provider stays local-only.
_Avoid_: directory cache, folder cache, folders list, directory corpus

**Core Action**:
One of the four actions every provider fills — primary, secondary, mark, back —
which mean the same thing in every provider so muscle memory transfers. A
provider may declare further actions beyond these, but only when it needs them.
_Avoid_: default action, standard binding

# Bar

The strip along the top of the screen: at-a-glance status, and the controls
reached from it.

## Language

**Quick Settings**:
The panel under the bar's Status Cluster holding the modules that are controls
rather than at-a-glance status — network, bluetooth, volume, power. The name
every major desktop gives this: GNOME, Android and Windows all call it Quick
Settings.
_Avoid_: gear menu, settings menu, control centre, tray

Its primary surface is ordered as header actions and battery summary, the
full-width volume and brightness controls, passive Wired status when connected,
then the reflowing Wi-Fi/Bluetooth/Tailscale/Devcontainer Tile grid. Wired is
transport state, not a Tile; unavailable controls are omitted so the remaining
content reflows without placeholders.

**Status Cluster**:
The grouped at-a-glance indicators at the right of the bar and the mouse entry
point for Quick Settings. `SUPER+CTRL+A` opens the same panel without it, on
whichever monitor is focused.
_Avoid_: gear, tray, system tray, indicator group, status icons

**Row**:
One line in a Quick Settings Page: leading glyph, label, trailing detail, and
whatever control it owns. Rows form lists; the primary Quick Settings surface
uses Tiles instead.
_Avoid_: item, entry, tile, option

**Tile**:
A pill-shaped control on the primary Quick Settings surface, paired in a
two-column grid. Its main segment changes state; an optional trailing chevron
opens the control's Page. Its label names whatever the control is currently
attached to, falling back to the control's own name when there is nothing to
name.
_Avoid_: row, item, entry, button, card, pill

**Page**:
Content that replaces the primary Quick Settings surface in the same window,
reached from a Tile or Row and left by a back arrow. Not a second window and
not a submenu — the panel is showing something else for a while.
_Avoid_: popup, submenu, screen, view, flyout

**Flyout**:
A popup anchored under the bar entry that opened it, listing rows to act on,
dismissed by picking one or by clicking outside. One shared component,
`Flyout`, holds the chrome — `PopupWindow`, focus grab, reopen-debounce,
bordered `Column` of rows — behind both the special-workspaces Flyout and
the scrolling-workspace window list. Not a Page: a Page replaces Quick
Settings' own rows in the same window, while a Flyout is a second window
anchored under the entry that opened it. Not a Chooser: a Chooser is a
Launcher concept, replacing entries in the query window rather than opening
one of its own.
_Avoid_: dropdown, submenu, menu, popup, page

**Tailnet**:
The named Tailscale network this machine is currently a member of, as a person
would name it — the account-level name, not the machine's address on it and not
the MagicDNS suffix that addresses resolve under. Each of those three is a
different string, so say which one is meant.
_Avoid_: tailscale network, magicdns suffix, node name, hostname

# Desktop

The Hyprland desktop's application and workspace conventions.

## Language

**Special Workspace**:
A named workspace normally kept out of view and summoned by a dedicated key,
giving a recurring application a single place that can be shown or hidden.
_Avoid_: scratchpad, special scratchpad, Special App

**Workspace Name**:
The string Hyprland itself holds for a workspace — bare `3` until something
renames it, `3-(dev)` once the Launcher's rename Action has. The only one the
compositor, `hyprctl` and the Launcher's workspaces Provider know about.
_Avoid_: workspace title, label, workspace id

**Workspace Label**:
What the Bar displays for a workspace, derived from the windows on it rather
than stored anywhere. It contains the representative window's application,
with no directory suffix. Falls back to the Workspace Name whenever that Name
is anything other than the bare id, so a manual rename always wins. Never
written back to the compositor; see
`docs/adr/0013-workspace-labels-derived-in-bar.md`.
_Avoid_: workspace name, display name, derived name, caption

**Devcontainer Routing**:
The persisted, default-off switch that makes Herdr (`SUPER+U` and the
Launcher's own Herdr chooser row) open a Mirrored Directory on the
devcontainer host instead of locally, and gates whether the Directories
Provider's remote Directory Index exists at all. Every other Launcher
action — opening or choosing an app for a local-provenance directory or file
in Zed, VSCode, Cursor, Neovim, or Files — ignores it: those always open
where the files actually are, mirrored or not. The Devcontainer Tile in
Quick Settings flips it, and while on, its label shows the custom host in
place of the generic name — off, or with no custom host set, it reads
"Devcontainer". Off means neither Herdr nor the remote scan does anything:
nothing SSHes anywhere.
_Avoid_: devcontainer mode, remote mode, SSH mode

**Mirrored Directory**:
A path under a root the devcontainer also has mounted. The gate
`bin/df-herdr-session` combines with Devcontainer Routing to decide whether
Herdr opens on the devcontainer host or locally — its only remaining
consumer. Every other Launcher action treats a local-provenance directory as
always-local regardless of whether it's mirrored.
_Avoid_: synced directory, shared directory

# Session Lifecycle

Who is at the machine, and what the machine does when nobody is: the login
surface, the lock over a running session, and the timed stages that lead to it.

## Language

**Greeter**:
The login surface shown before any session exists, running as its own user on
its own VT. It authenticates and hands off; nothing of it survives into the
session it starts, so it can never lock one.
_Avoid_: display manager, login manager, lock screen, login screen

**Session Lock**:
The surface that covers a running session and takes a password to dismiss,
held by the compositor rather than drawn by an ordinary window. The Greeter's
counterpart on the other side of login.
_Avoid_: lock screen, screensaver, screen lock, locker

**Secure**:
The state in which the Session Lock is actually guarding the session, as
opposed to merely requested or drawn. The only state that makes suspending
safe, and the only one worth waiting for.
_Avoid_: locked, active, engaged, up

**Sleep Inhibitor**:
The logind delay the Session Lock holds itself, from startup until the session
it locked reports Secure. A timer rather than a promise: logind suspends when
its window expires, Secure or not, so the lock's own wait is bounded well
inside it.
_Avoid_: sleep lock, suspend hook, sleep guard, delay lock

**Stranded Lock**:
A lock the compositor still holds after the client that raised it is gone —
recoverable, but invisible to anything that asks the client whether it is
locked.
_Avoid_: orphan lock, stale lock, stuck lock, zombie lock

**Idle Ladder**:
The ordered sequence of Stages that runs while nothing is happening, each
firing at its own elapsed time and unwinding on activity.
_Avoid_: idle timeout, idle chain, timers, screensaver

**Stage**:
One rung of the Idle Ladder — Dim, Lock, Blank, Suspend — named by what it
does rather than when it fires, since the times are configuration and the
order is not.
_Avoid_: step, timeout, listener, phase

**Stay Awake**:
The toggle that suspends the Idle Ladder entirely, leaving manual locking and
manual suspend untouched.
_Avoid_: caffeine, inhibit, no-idle, presentation mode

**Probe**:
The Session Lock's surface rendered in an ordinary window, authenticating for
real but holding nothing, so its appearance and its password field can be
worked on with no possibility of lockout. Its own Quickshell config
(`quickshell/.config/quickshell/lock-probe/`), run with `df-qs-test lock-probe`.
_Avoid_: preview, mock, test lock, dry run

# Setup

The scripts and documentation that configure a development box.

## Language

**Shared Setup Script**:
A setup component under `setup/common/` that owns behavior, interfaces, and
rationale meant to be reusable across boxes, regardless of how many boxes
currently use it. Its executable contract is authoritative for supported
inputs and defaults.
_Avoid_: common helper, box script

**Box Wrapper**:
A box-specific setup component that owns local configuration, ordering, and
rationale while delegating shared behavior to a Shared Setup Script. Its
configuration, rather than prose documentation, defines the box's chosen
defaults.
_Avoid_: shared script, implementation

**Step**:
One named unit of a box's `init` run, announced and retried as a whole.
_Avoid_: stage, task, phase, job

**Phase**:
One half of a change rolled out in two parts, so the first half is survivable
and the second is taken only once the first is confirmed working.
_Avoid_: stage, step, pass, round

**Break-glass**:
The access path deliberately left open so a change that locks you out stays
recoverable: a temporary LAN ssh hole, a retained passphrase keyslot, the
physical console.
_Avoid_: fallback, escape hatch, backdoor, recovery path

**Archive Branch**:
A pushed, never-merged `archive/<topic>` branch holding setup files retired
from every box's `init` — never sourced, never `run_step`'d — instead of
deleting them, because a box configuration they once served may come back.
Frozen as they were when retired; `main` keeps no copy. Read one with
`git show archive/<topic>:<path>`.
_Avoid_: deprecated script, legacy script, dead code, unused script, stale branch
