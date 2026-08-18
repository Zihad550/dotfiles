# Workspace Window Flyout

**Status:** ready-for-agent

## Problem Statement

Several workspaces run Hyprland's scrolling layout, where more than one window
can sit side by side, scrolled off to the left or right of whatever is
currently in view. The bar's workspace entry only shows the workspace's
number — there's no way to see what else is open on a scroll-layout
workspace, or jump straight to one of those windows, without scrolling
through blindly to find it. The bar's special-workspaces entry already solves
exactly this problem for the special workspaces: a dropdown listing each one
by name, one click to switch. Numbered workspaces on scrolling layout have no
equivalent.

## Solution

A numbered workspace's bar entry gains a small arrow next to its name,
appearing only when that workspace is running scrolling layout and holds more
than one window. Clicking the arrow opens a Flyout — the same
popup-under-a-bar-entry pattern the special-workspaces entry already uses —
listing every window on that workspace, in the order they actually sit in the
scroll, with a bullet marking whichever one is currently focused. Clicking a
window in the list switches straight to it and closes the flyout. The
workspace name itself keeps switching to the workspace on click, exactly as
it does today — nothing about the existing muscle memory changes.

## User Stories

1. As someone using scrolling layout, I want to see which workspaces
   currently hold more than one window, so that I know there's something to
   scroll to that isn't in view.
2. As someone using scrolling layout, I want to open a list of every window
   on a scroll workspace from the bar, so that I don't have to scroll blindly
   to find the one I want.
3. As someone choosing a window from that list, I want to see its title, so
   that I can tell windows of the same application apart.
4. As someone choosing a window whose title hasn't loaded yet, I want to see
   its application id instead, so that the entry isn't blank while I decide.
5. As someone choosing a window with neither a title nor an application id, I
   want it listed as an untitled window rather than dropped, so that the list
   still accounts for every window on the workspace.
6. As someone choosing a window, I want a mark on whichever one is currently
   focused, so that I know where I already am before I click anything.
7. As someone choosing a window, I want the list ordered the way the windows
   actually sit in the scroll, so that the list reads in the same direction
   as the layout it's describing.
8. As someone clicking a window in the list, I want to switch straight to it,
   so that reaching a window buried off-screen is one click instead of
   several scroll gestures.
9. As someone clicking a window in the list, I want the flyout to close once
   I've picked, so that it doesn't sit open over whatever I just switched to.
10. As someone clicking anywhere outside the flyout, I want it to close
    without doing anything else, so that dismissing it is as easy as opening
    it.
11. As someone on a workspace with only one window, I want the bar entry to
    look exactly as it does today — no arrow, no flyout — so that the common
    case isn't cluttered with a control I'd never use.
12. As someone on a workspace using dwindle (or any non-scrolling layout), I
    want no flyout arrow at all, even with several windows open, so that the
    control only appears where scrolling actually hides something.
13. As someone clicking the workspace name itself, I want it to keep
    switching me to that workspace exactly as it does today, so that this
    feature doesn't retrain muscle memory I already have.
14. As someone who has just closed a window down to one left on a scroll
    workspace, I want the arrow and any open flyout to disappear immediately,
    so that I'm never looking at a list for a control that no longer applies.
15. As someone using the bar's special-workspaces entry, I want its dropdown
    to look and behave exactly as it does today, so that refactoring its
    plumbing under the hood costs me nothing I'd notice.
16. As someone running this on more than one monitor, I want each bar's
    flyout to only ever list windows on that monitor's own workspaces, so
    that clicking an entry can't send my focus to a screen I'm not looking
    at.
17. As a future maintainer, I want the popup pattern behind both the
    specials entry and this new one to share one component, so that a future
    third use of a bar dropdown doesn't mean copying seventy lines a second
    time.
18. As a future maintainer, I want the window-naming fallback to live in one
    small tested module, so that "what do we call an untitled window" has
    one answer instead of silently drifting between the Launcher and the
    bar.
19. As a future maintainer reading `CONTEXT.md`, I want this popup pattern
    named consistently in the glossary, the filenames, and the comments, so
    that I'm not hunting for two names for the same thing.
20. As a future maintainer, I want the reasoning behind gating this on
    `tiledLayout` recorded somewhere, so that I don't have to re-derive from
    scratch that the field is only knowable live and naturally refreshed.
21. As someone glancing at the bar without interacting, I want a workspace
    with several windows on scrolling layout to look visually distinct (via
    the arrow) from one with a single window, so that I can tell there's
    more there before I even click.

## Implementation Decisions

**Visibility is `tiledLayout === "scrolling"` AND more than one window.**
Layout is read per-workspace off `HyprlandWorkspace.lastIpcObject.tiledLayout`
— verified live against the running compositor (`hyprctl workspaces -j`
reports this field on the installed Hyprland 0.56.2) since it is not exposed
as a named QML property on `HyprlandWorkspace` in the installed Quickshell
build (0.3.0), only reachable through the raw IPC passthrough. Window count
reuses the same `toplevels.values.length` binding the existing empty/opacity
state on numbered workspace entries already trusts live.

**The workspace name's click behaviour is unchanged.** It always switches to
that workspace, on every numbered workspace, regardless of window count or
layout. The flyout is reached through a separate small arrow glyph
(`▾`/`▴`, the same glyph `SpecialWorkspaces` already uses), which appears
only when the visibility condition above holds and does nothing but toggle
the flyout. This was a deliberate choice against mirroring
`SpecialWorkspaces`' click-toggles-the-menu behaviour: a numbered workspace
button would otherwise behave differently depending on how many windows
happen to be on it at the moment, an inconsistency `SpecialWorkspaces`
doesn't have because it's a single collapsed entry regardless of state.

**A shared `Flyout` component is extracted** from the `PopupWindow` +
`HyprlandFocusGrab` + open/close debounce + bordered `Column` of `MenuRow`s
currently built once inside `SpecialWorkspaces` and about to be needed a
second time. It takes a model and a row delegate; both call sites shrink to
just what differs (their data and what each row shows). `SpecialWorkspaces`
is refactored onto it with no behavioural change — same debounce, same
anchor, same dismiss-on-focus-loss.

**The new per-workspace-window entry gets its own file**, following the
precedent that gave `SpecialWorkspaces` its own file rather than growing
inline inside `Workspaces.qml`'s `Repeater` delegate. It owns the arrow, the
visibility condition, and the `Flyout` instance for its one workspace.

**Row content**: label = window title, detail = app id/class, using the
naming fallback below. A bullet (`•`) marks whichever toplevel equals
`Hyprland.activeToplevel`; nothing else in the row carries the mark.

**Row order is Hyprland's own order on `workspace.toplevels.values`** — not
reordered to put the focused window first, since the point is to mirror the
workspace's actual scroll position, not to highlight rank.

**Row click calls the toplevel's own `.activate()`** (confirmed present as a
fallback activation path in `launcher/modules/Windows.qml:focusWindow`) and
closes the flyout, matching `SpecialWorkspaces`' existing row-click
behaviour.

**The window-naming fallback (title → app id → "(untitled window)") is
duplicated, not imported**, into a new small pure module under a new
`dotfiles/modules/lib/` directory (this config currently has no `lib/`). The
`dotfiles` and `launcher` Quickshell configs are separate module roots — each
resolves its own `qs` import scope — so there is no import path from one into
the other; the Launcher's `lib/windows.js:nameFor` stays exactly where it is,
untouched. The duplicate is three lines and one naming rule, judged cheaper
to keep in sync by hand than to invent cross-config module sharing for.

**Layout membership uses the bar's natural raw-IPC refresh path**, not a
dedicated layout-change watcher. The original implementation could not flip a
workspace at runtime because `hyprctl keyword` is legacy-parser-only. The
independently fixed `SUPER+ALT+L` script now uses `hyprctl -r eval` and verifies
the compositor's resulting layout. The widget picks up the new value on its
next natural refresh of `lastIpcObject`.

**Docs**: an ADR records the `tiledLayout`-is-only-knowable-live constraint
and the toggle's natural-refresh behavior. A new `CONTEXT.md` Bar-section
glossary term, **Flyout**, names the popup-under-a-bar-entry pattern — distinct
from the Launcher's `Chooser` (a nested unranked list reached by a secondary
Action) and `Page` (content that replaces Quick Settings' rows in place).

## Testing Decisions

A good test here checks external behaviour — what a window is named, not how
a `PopupWindow` happens to be wired — and this repo already has a precedent
for exactly where that line falls in this codebase: `.scratch/quick-settings-wifi/spec.md`
decided no automated coverage for the bar config itself, "QML bindings over a
live compositor," and that has held — `quickshell/.config/quickshell/dotfiles/`
has no test files today. This feature follows the same line:

- **No automated coverage** for the `Flyout` component, the new per-workspace
  entry, the visibility binding, the arrow, or the `SpecialWorkspaces`
  refactor. All of it is QML bound to live Hyprland/Wayland state that
  doesn't exist outside a running compositor.
- **The one pure piece — the naming fallback — gets its own module and a
  `node:test` unit test**, at `tests/dotfiles/<module-name>.test.js`, run via
  the same `node --test "tests/**/*.test.js"` this repo already uses for the
  Launcher. Prior art: `tests/launcher/windows.test.js` already covers the
  identical rule (title present, title absent, both absent) against
  `launcher/lib/windows.js:nameFor` — the new test mirrors those same three
  cases against the duplicated `dotfiles`-local module.
- **Every implementation ticket carries a `## Manual verification` section**,
  per this repo's issue-tracker convention: one copy-pasteable check per
  step, stating what a pass looks like, cross-checked against `hyprctl`
  output rather than trusting only what the bar displays — e.g. a claimed
  `.activate()` should be checkable against `hyprctl activewindow -j`, not
  just "the bar looks focused."
- **Agents implementing this run in a devcontainer with no compositor**, no
  Wayland session, no `quickshell` binary. Any ticket reaching a runtime
  checkbox is set to `needs-info` and handed to the host, per this repo's
  standing convention — never ticked from code inspection alone.
- **The `SpecialWorkspaces` refactor needs its own before/after manual
  check** since it rewrites working code onto the new shared component: open
  two or more special workspaces and confirm the collapsed label, the bullet
  on the open one, the `"N windows"` detail text, and dismiss-on-outside-click
  are all unchanged after the move.

## Out of Scope

- **Fixing `bin/df-hypr-workspace-layout-toggle`.** Its breakage was surfaced
  during design and remained separate from this feature; it was fixed later.
- **Live-reacting to a workspace's layout changing while the bar is
  running.** The bar relies on its natural `lastIpcObject` refresh rather than
  a dedicated layout-change watcher.
- **Reordering the window list** to anything other than Hyprland's own
  spatial order — no "most recently used" or "focused first" mode.
- **Any keybind-driven or keyboard-only path** to this flyout. This is a
  bar-click feature only; nothing here touches `hypr/lua/bindings/`.
- **Extending `Flyout` to a third use** beyond `SpecialWorkspaces` and this
  new entry. It's built to be reusable, but nothing else is wired onto it
  yet.
- **Reworking `windows.lua`'s static per-workspace scrolling-layout
  assignment** (`{1,3,4,5,6,7,8,9}`). This feature reads that state; it
  doesn't change which workspaces get it.

## Further Notes

The `tiledLayout` field's presence and correctness were verified live
against the running compositor during design — a throwaway, panel-free
`Scope`-only QML probe run as a second `quickshell -p` instance alongside the
real `dotfiles`/`launcher` instances, never touching either — not assumed
from documentation. This repo's other tools have been burned by unverified
IPC assumptions before (see the "VERIFY BEFORE TRUSTING" block at the top of
`herdr/.config/herdr/config.toml`, applied to a different tool but the same
caution). The same probe surfaced, as a side effect rather than the goal, that
the old layout-toggle script used a legacy-only command. That finding was
recorded in the ADR and the script was fixed independently later.

The decision to keep the workspace name's click behaviour identical across
every numbered workspace, rather than have it change meaning once a
workspace becomes collapsible, runs slightly against the path of least
resistance (mirroring `SpecialWorkspaces` exactly would have been less code).
It's deliberate: consistency of a control every numbered workspace shares
outweighs the small saving, and it's recorded here so a future reader doesn't
"simplify" it back the other way.
