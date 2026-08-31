## Problem Statement

The Launcher is walker (frontend) plus elephant (providers and matching). Three
things about that arrangement are actively costing us:

**Elephant's entry model blocks features we want.** It has no concept of
Marking, so selecting several screenshots to act on together required a runtime
file outside any process's ownership — which produced a real bug where marks
leaked into the next Launcher session, because nothing knew when a session
ended. Its scoring throws away provider-supplied ordering, requiring a
`FixedOrder` workaround. Entries render as one uniform row, so a thumbnail grid
for screenshots is impossible.

**Walker's configuration fights us.** A default prefix cannot be deleted, only
retargeted, because walker merges user config by matching on provider — nineteen
lines of comment in the walker config exist solely to explain this and the
workaround it forces.

**Every invocation execs a client binary**, even though a service is already
running, so the window has to be built on each open.

Separately, the Launcher's provider surface has sprawled into four unrelated
entry points — the main keybind, prefixes, two dedicated keybinds, and a dmenu
mode driven by eight shell scripts — with duplicate implementations of the same
menus in two of them.

## Solution

Replace walker and elephant with a Quickshell QML Launcher that we own end to
end, migrating provider by provider with the main keybind switching over on day
one.

The Launcher runs as its own always-running Quickshell config, so the window
already exists when the keybind fires and opening is instant. Providers produce
Entries of a uniform shape; the shell owns Query, Marking, keyboard navigation
and Action dispatch, so behaviour is identical everywhere. A Provider may
override how its Entries look — and whether they lay out as a list or a grid —
which is what finally makes the screenshot thumbnail grid and first-class
Marking possible.

Ranking is a global score pool across Providers, blended with Frecency, which is
the only signal comparable between Providers.

## User Stories

1. As a user, I want the Launcher to open the instant I press its keybind, so that it never feels like a thing I am waiting on.
2. As a user, I want to press one keybind for everything I launch, so that I do not have to remember which of four entry points holds what.
3. As a user, I want the Launcher window to already exist before I press the key, so that opening costs nothing beyond mapping a surface.
4. As a user, I want the keypress to reach the Launcher without spawning a client process, so that the open path has no fork and exec in it.
5. As a user, I want a fallback keybind to the old launcher during the migration, so that a broken Launcher never leaves me unable to start anything.
6. As a user, I want the Launcher to take keyboard focus the moment it appears, so that I can start typing without clicking first.
7. As a user, I want Escape to dismiss the Launcher, so that abandoning a Query is instant.
8. As a user, I want focus to return to the window I came from when the Launcher closes, so that dismissing it does not disturb what I was doing.
9. As a user, I want the Launcher's filtering to never stall the bar, so that typing a Query does not hitch the clock, the OSD, or a notification animation.
10. As a user, I want a crash in the Launcher to leave my bar, notifications and OSD running, so that an immature feature cannot take down my whole shell.
11. As a user, I want to type a few characters and see matches narrow immediately, so that I can act as soon as I recognise the right Entry.
12. As a user, I want the best match to win regardless of which Provider produced it, so that I do not have to think about where a thing lives.
13. As a user, I want the things I pick most often to rise to the top, so that my common actions get shorter over time.
14. As a user, I want the Launcher to show my most-used Entries before I type anything, so that the most common case needs no Query at all.
15. As a user, I want Entries that never recur — calculator results, window addresses, web searches — to not pollute what the Launcher thinks I use, so that Frecency stays meaningful.
16. As a user, I want Return to mean "the primary thing" in every Provider, so that muscle memory transfers.
17. As a user, I want Shift+Return to mean "the secondary thing" everywhere, so that I have a consistent second verb.
18. As a user, I want Tab to Mark an Entry in every Provider that supports it, so that multi-selection is one gesture I learn once.
19. As a user, I want Escape to go back to the parent when I am inside a sub-menu, so that nesting is navigable.
20. As a user, I want a Provider to be able to offer extra verbs beyond the core four when it genuinely needs them, so that unusual Providers are not forced into sub-menus.
21. As a user, I want to Mark several screenshots and copy all their paths at once, so that I can hand several files to something in one step.
22. As a user, I want Marks to be visible on the Entries I have marked, so that I can see my selection before acting.
23. As a user, I want Marks to disappear when the Launcher closes, so that a selection never leaks into my next Query.
24. As a user, I want Marking confined to a single Provider, so that an Action always knows what kind of thing it is acting on.
25. As a user, I want to see screenshots as a thumbnail grid, so that I can pick by eye rather than by reading timestamps.
26. As a user, I want to launch an installed application by name, so that the Launcher replaces my app launcher on day one.
27. As a user, I want to switch to an already-open window by name, so that I do not launch a second copy of something running.
28. As a user, I want to type an arithmetic expression and get a result, so that quick sums do not need another tool.
29. As a user, I want to search the web from the Launcher, so that a query I cannot answer locally goes straight out.
30. As a user, I want my static menus — system, media, display, other — available from the Launcher, so that nothing I had before is missing when the keybind switches.
31. As a user, I want to add an entry to a static menu by editing one file and seeing it hot-reload, so that extending menus stays as cheap as it is today.
32. As a user, I want menu entries that depend on shell expansion to keep working, so that commands reading a secret or substituting a command do not silently break.
33. As a user, I want to find a directory by fuzzy-matching its path, so that I can jump into projects without navigating.
34. As a user, I want directory search to stay responsive across many thousands of entries, so that the largest Provider is not the slowest one.
35. As a user, I want to choose what opens a directory rather than always getting the default, so that the secondary Action stays useful.
36. As a user, I want directory data to refresh in the background, so that a stale cache never blocks the Launcher opening.
37. As a user, I want to reach my clipboard history from the Launcher, so that it is one more Provider rather than a separate tool.
38. As a user, I want to apply a theme from the Launcher, so that theme switching does not need its own script.
39. As a user, I want to set a background from the Launcher, so that it lives beside the other appearance actions.
40. As a user, I want to see running dev servers, processes and systemd units as Providers, so that they are reachable from the same place as everything else.
41. As a user, I want to kill a process directly from its Entry, so that managing something does not need a second tool.
42. As a user, I want to rename a workspace without a separate text-prompt tool, so that the capability survives the dmenu mode being removed.
43. As a user, I want a prefix to route my Query to one Provider, so that I can narrow the search when I already know what I want.
44. As a user, I want the prefix characters to stay what they are today, so that my muscle memory carries over.
45. As a user, I want to discover what Providers exist, so that I can find capabilities I have forgotten about.
46. As a user, I want the Launcher to follow my theme, so that it looks like the rest of my shell without separate configuration.
47. As a user, I want each Provider ported one at a time, so that I can judge whether the abstraction is right before committing to all of them.
48. As a user, I want the riskiest Providers ported first, so that a wrong abstraction is discovered after two Providers rather than twelve.
49. As a user, I want a named list of Providers I am deliberately not porting, so that the migration has a definition of done and can actually finish.
50. As a user, I want walker, elephant and their configs deleted once nothing I use needs them, so that I am not maintaining two launchers indefinitely.

## Implementation Decisions

**Full replacement, not a reskin.** The QML Launcher owns Providers, matching
and UI. Elephant is not retained as a backend: its entry model is the source of
the Marking and ordering workarounds, so keeping it would preserve the exact
constraints motivating the work.

**The Launcher is its own Quickshell config**, autostarted alongside the bar,
not a module inside it. QML is single-threaded, and filtering the largest
Provider was measured at 46–61ms per keystroke against ~17,000 entries. Inside
the bar's process that would block the bar, OSD and notification rendering on
every keystroke. Separation also means Launcher faults cannot take down the
notification daemon. Cost is a second process and a duplicated theme singleton;
the existing theme template already covers a second config.

**The keybind registers as a compositor shortcut from within QML**, so the
keypress dispatches into the running process with no client binary. This is
contingent on the API existing and must be verified before piece one; the
fallback is a compositor bind calling into the Launcher over IPC, which works
but reintroduces a per-open fork and exec.

**Uniform Entry, optional delegate.** Every Provider yields Entries of one shape.
The shell owns Query, Marking, keyboard navigation and Action dispatch, so
behaviour cannot drift between Providers. A Provider may optionally supply its
own delegate and a list-or-grid layout hint — the mechanism that makes the
screenshot grid possible without freeing behaviour.

**Core Actions are a fixed vocabulary** — primary, secondary, mark, back — that
every Provider fills, with extra Actions permitted where genuinely needed. This
vocabulary already exists implicitly in the current configuration; the change is
making it explicit and declared once rather than restated per Provider.

**Providers declare their own prefixes**, retaining today's characters. This
removes the merge-by-provider semantics that make a default prefix impossible to
delete.

**Ranking is a global score pool blended with Frecency.** Frecency accumulates
against an Entry Key that a Provider supplies only when its Entries genuinely
have stable identity — desktop entry IDs, absolute paths, menu-plus-text.
Providers whose Entries never recur (windows, calculator, web search) opt out
and rank on match score alone rather than fabricating identity. Frecency is
persisted to a small state file, read at startup and written on activation; this
is new infrastructure with no existing analogue in the shell.

**Marking is scoped to one Provider and ends when the Launcher closes.** No
persisted marks file, so the stale-selection failure is structurally impossible
rather than patched.

**Static menus become QML data files** rather than staying in their current
configuration format or moving to JSON. Nothing machine-generates them, they
hot-reload on save exactly as today, and they gain load-time syntax checking. A
per-entry audit is required: some commands rely on shell expansion, which the
detached-exec path does not provide, so those must be invoked through a shell
explicitly.

**The dmenu Surface is eliminated rather than ported.** The seven scripts behind
it are Providers that were written as scripts because that was the cheap path;
they become Providers fetching their data through a process. The workspace-rename
call site becomes an Action invoking the compositor directly rather than a
text-prompt round trip. Two of the seven duplicate existing menus and merge into
them rather than becoming new Providers.

**Matching and ranking live in a plain JavaScript module** consumed by QML,
deliberately kept free of QML types so the same file is loadable by a plain
JavaScript runtime. This is the single test seam (see Testing Decisions).

**Sequencing.** Piece one is the full default Provider set — applications,
windows, calculator, web search, and four static menus — because the main keybind
switches on day one and must remain usable. Directories follow, then screenshots:
between them they exercise every capability the Provider abstraction promises
(asynchronous cached data, sub-menus, custom delegate, grid layout, Marking), so
a wrong interface surfaces after two Providers rather than twelve. Cheap static
Providers come last.

**Definition of done** is that nothing in daily use requires walker. The
deliberate drop list is the symbol picker. On completion, walker's helper script
directory, the elephant configuration, and walker's theme template are removed,
the latter following the same disabling convention used for previously replaced
components.

**Migration safety.** A secondary keybind to the old launcher is retained for the
duration, because the primary keybind switches before parity and a Launcher that
fails to open otherwise leaves no way to start anything.

## Interface: Provider

A Provider is a QtObject exposing:

- **label** — what to call it when the window has to name it.
- **ready** — false while emptiness is a fault rather than an answer.
- **catalog** — `{ entries, corpus }`: Entries in a display shape the window
  can render without knowing which Provider they came from, and the corpus
  `rank()` scores. One property rather than separate `entries`/`corpus` so a
  consumer reads a consistent pair in a single access — the indices `rank()`
  returns are only meaningful against the entry list the corpus was prepared
  from.
- **actions** — which Core Action slots (`primary`, `secondary`, `mark`,
  `back`) this Provider fills, e.g.
  `actions: ({ primary: { label: "launch", invoke: entry => …, after: "close" } })`.
  A Provider never names its own key — Return/Shift+Return/Tab/Escape mean the
  same thing everywhere, which is the point. `label` is the footer hint,
  `after` is what the Launcher does next (close/refresh/stay). A Provider
  needing an Action outside this vocabulary adds it to `extras` (the one place
  a Provider does name a key, e.g. `{ chord: "Ctrl+W", ... }`); a chord
  claiming a core key or one no keypress can produce is dropped with a
  warning.
- **refresh** — optional: re-ask the source for what it may not have yet,
  called on every open. Only needed when the underlying data can go stale
  between opens (windows), not when it's populated once (applications).
- **prefix** — optional (ticket 11): the leading character that routes a
  Query to this Provider alone (`=` calculator, `@` web search). A Provider
  that never sets it is simply never prefix-matched.
- **nested** — optional (ticket 12): true while the Provider is showing a
  sub-view of its own (Directories.qml's chooser). Gives the Provider the
  whole pool to itself, like a routed prefix, and clears the Query crossing
  either edge.
- **enter() / leave()** — optional (ticket 18): what the "?" provider list
  calls for a Provider with no `prefix`. `enter()` sets `nested`; `leave()`
  clears it. A listable Provider with neither `prefix` nor `enter()` is a
  programming error, surfaced by the "?" list calling the missing function.
  Requires `active` alongside it (a visibility watch that drops entered state
  when the Launcher closes).
- **layout** — optional (ticket 13): names a layout other than the default
  one-row-per-Entry list. `"preview"` is the one value defined — a narrow
  list beside a large image of the highlighted Entry. Only rendered when this
  Provider owns the whole active pool (routed or nested); left unset, the
  Provider renders as a normal row.
- **description** — optional (ticket 18): a sentence shown in the "?"
  provider list. Degrades to `""` when absent.
- **listable** — optional (ticket 18): false opts a Provider out of the "?"
  list without making it unreachable. Absent means listed.
- **prompting** — optional (ticket 16): true while the Provider is asking for
  a line of text of its own (Workspaces.qml's rename), taking over the Query
  field. Not a Surface — same window, same query line. Five slots come with
  it once a Provider ever sets `prompting`:
  - `promptValue` — Query prefill, read synchronously when `prompting` goes
    true.
  - `promptVerb` — footer's Return hint (defaults to "confirm").
  - `promptPlaceholder` — placeholder text naming what's being prompted for.
  - `applyPrompt(text)` — Return: act on the field's content, lower
    `prompting`.
  - `cancelPrompt()` — Escape/dismissal: lower the flag, change nothing. Must
    also fire on `active` going false, so a reopened Launcher is never
    mid-prompt.
- **ordered** — optional (ticket 17): a catalog may be
  `{ entries, ordered: true }` instead of `{ entries, corpus }`, skipping
  `rank()` entirely because the Entries are already in required display order
  (Files.qml's folder-then-contents grouping). An Ordered Provider must own
  the whole active pool whenever shown (via a prefix), since a zero-scored
  ordered list would otherwise interleave with a scored Provider's ranking as
  if tied. Nothing bounds its length, so a Provider producing many Entries
  must cap them itself.

**The one variant (ticket 09): a Provider that isn't ranked.** Calculator and
web search have `entries` — a plain list — in place of `catalog`, and take the
Query as `queryText` rather than being matched against it, because both
*generate* their Entry from the Query: a corpus holding a copy of the needle
would score highest for everything typed. `Launcher.qml` places their Entries
around the merged pool by hand (`localEntries`). A Provider with `catalog` is
scored; one with `entries` is placed; nothing has both, except the `ordered`
catalog shape above, which is a real catalog that declines scoring because its
order is its own structure.

An **Entry** is `{ name, subtext, icon, key, provider, target }`: the two
display lines, an icon-theme name, the Entry Key Frecency accumulates against,
the Provider that can act on it, and `target` (the Provider's own object,
untouched outside it). `key` is optional — a Provider supplies one only when
its Entries have identity that survives a restart (a window address does not;
a desktop entry id does).

## Testing Decisions

**There is no existing test infrastructure in this repository** — no test files,
no runner, no CI. There is therefore no prior art to follow, and this spec should
not pretend otherwise. What follows proposes the minimum seam that makes the
risky part of this feature verifiable, not a testing strategy for the repo.

**A good test here asserts external behaviour only**: given a corpus and a Query,
what comes back and in what order. It must not assert how scoring is computed
internally, which buffers are used, or how narrowing is implemented — those are
precisely the things expected to change as the implementation is tuned.

**One seam: the matching and ranking module.** Matching, scoring, the global pool
merge, the Frecency blend, and top-N selection are pure functions over data. They
are also the only part of the Launcher where a subtle bug is invisible in use —
a wrong ranking looks like a preference, not a fault. Everything above this
module — window lifecycle, keyboard routing, delegates, Provider data fetching —
requires a running compositor and is verified by running the Launcher.

The module must therefore avoid QML imports and be written so a plain JavaScript
runtime can load it, with any interoperability shim guarded so it is inert under
QML. Confirming the same file loads under both is itself an early task, since the
seam's viability depends on it.

**Prior art exists only from this feature's own investigation**, not from the
repository. During benchmarking, the scorer was extracted and exercised under a
standalone JavaScript runtime, which caught two real defects that inspection had
missed: a consecutive-match bonus that applied to scattered matches because a
variable was compared against itself, and it verified that a bounded top-N
selection returned output identical to a full sort across every query tried,
ties included. Both are exactly the class of bug this seam exists to catch, and
both were invisible in the running application.

**What should be tested at this seam:** that a match is found or rejected
correctly; that consecutive and word-boundary matches rank above scattered ones;
that bounded top-N selection agrees with a full sort; that ties preserve
encounter order; that the Frecency blend moves a frequently-chosen Entry above a
better textual match only under the intended conditions; that Providers opting
out of Entry Keys are unaffected by Frecency; and that narrowing a previous
result set yields the same result as scanning the full corpus.

## Out of Scope

- Porting the symbol picker. It is on the deliberate drop list.
- A general dmenu capability. The Surface is eliminated, not reimplemented, which
  means future ad-hoc scripts have no generic list-picker to call. This is a
  known, accepted loss.
- Marking that survives closing the Launcher. Accumulating a selection across
  separate openings is a different feature with a store behind it.
- Frecency keyed on the Query-and-Entry pair, so that different Queries can learn
  different preferred Entries. Better long-term but sparse and unhelpful until
  well-used, and it does not address the empty-Query case.
- Per-Provider score weighting. The global pool is unweighted; if cross-Provider
  comparability proves painful, weighting is a later change.
- Testing window lifecycle, keyboard routing, delegates or Provider data
  fetching. These need a running compositor and are verified by use.
- Establishing general test infrastructure or CI for this repository.
- Changing the theme system. The existing template already covers a second
  Quickshell config.

## Further Notes

**Measured context.** Matching roughly 17,000 directory entries costs about
46ms cold and about 61ms including ranking, per keystroke, in QML's JavaScript
engine — which ran roughly fourteen times slower than a standalone runtime on
identical code. Two obvious mitigations were measured and rejected for this
corpus: incremental narrowing barely helps, because every path shares a common
prefix so short Queries match nearly everything; and a character-bitmask
prefilter gains little for the same reason. Matching basenames rather than full
paths is five to eight times faster and far more selective, but loses
parent-directory matching, and is held in reserve rather than adopted.

**On the performance bar.** These figures were initially judged against a 60fps
ideal and read as disqualifying. That was the wrong baseline. Compared against
the incumbent end to end, the QML implementation felt faster — elephant's own
per-keystroke path involves socket IPC, serialisation and GTK rendering, and was
never measured. The bar is the incumbent, not 60fps.

**Already verified.** A Quickshell layer-shell window takes keyboard focus as
soon as it maps, without a click, using on-demand focus rather than exclusive
focus. Exclusive focus is not required and is best avoided, as it can take the
keyboard away from every other surface.

**Still to verify before piece one.** Whether a compositor shortcut can be
registered from within QML, since the open path depends on it. Whether a
desktop-entry API is available, since hand-rolling desktop file parsing, icon
lookup and terminal handling is substantial work to discover late. And whether
the matching module genuinely loads under both QML and a standalone runtime.

**The scorer used during benchmarking is not shippable.** It was written to
perform a realistic amount of work, not to rank well, and it ranks a path whose
segments each begin with a Query character above an obvious exact-prefix match.
Ranking quality is a real design task, not a port.

**Scale.** Piece one is roughly 900–1,100 lines before the main keybind is
usable — around 500–700 of shell infrastructure plus the eight default Providers.
The remaining Providers are estimated at 1,200–1,500 lines in total. For
calibration, the bar, notification daemon and OSD together are about 2,200 lines.
