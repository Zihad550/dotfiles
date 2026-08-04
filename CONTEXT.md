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
A stable identifier for an entry that survives restarts, supplied by a provider
only when its entries genuinely have one. Absent for entries that never recur.
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

**Core Action**:
One of the four actions every provider fills — primary, secondary, mark, back —
which mean the same thing in every provider so muscle memory transfers. A
provider may declare further actions beyond these, but only when it needs them.
_Avoid_: default action, standard binding
