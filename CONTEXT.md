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
defined roots and exclusions.
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
opens the control's Page.
_Avoid_: row, item, entry, button, card

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

# Desktop

The Hyprland desktop's application and workspace conventions.

## Language

**Special Workspace**:
A named workspace normally kept out of view and summoned by a dedicated key,
giving a recurring application a single place that can be shown or hidden.
_Avoid_: scratchpad, special scratchpad, Special App
