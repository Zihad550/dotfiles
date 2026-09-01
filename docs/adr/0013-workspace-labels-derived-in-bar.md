# Workspace labels are derived in the bar, except for explicit directory launches

Issue #98 asked for workspaces to name themselves after whatever you opened on
them. The Launcher already renames workspaces for
real, dispatching `hl.dsp.workspace.rename` from its workspaces Provider, so
the obvious implementation was to fire that same dispatch automatically on
every window open. Instead the bar derives what it displays from the
workspace's own toplevels. An explicit directory launch from the Launcher's
Directories Provider is the deliberate exception: after the selected
application focuses a resulting window, the Launcher persists a name on that
window's numbered workspace.

## Why

**An automatic rename makes state that has to be garbage-collected.** A
Hyprland rename persists: nothing undoes it when the window that justified it
closes. Auto-renaming means owning the whole lifecycle — rename on open, and
then decide who renames workspace 4 back to `4` when the last window on it
dies, when a window is dragged to another workspace, or when Hyprland
reassigns ids as workspaces come and go. Derivation has no lifecycle at all:
the label is a function of the windows that are there right now, so the
"cleanup" case is just the function returning something different.

**It would fight the manual rename that already exists.** The rename Prompt
writes the same name field an automatic rename would overwrite. Deriving
leaves that field alone, which lets a manual name simply win: any name that
isn't the bare id is displayed as-is and nothing is derived over it. A
Directories Provider launch is different: it is an explicit user action and
deliberately overwrites the destination's existing name, after which a manual
rename works normally again.

## Consequences

- Derived labels exist only in the bar. `hyprctl workspaces` and the Launcher's
  workspaces Provider see the persistent name when an explicit directory
  launch or manual rename has written one; a bare workspace still has no
  derived label in the compositor.
- Every numbered workspace is labeled, not just the active one — a background
  workspace takes the identity of its most recently focused window (Hyprland's
  focus history), so an entry never flips between named and bare as focus
  moves. The issue asked for "the active workspace"; the bar cannot show one
  rule for itself and another for its neighbours.
- An explicit Directory Provider launch names the destination as
  `workspaceId-application(directoryHint)`, using the selected Action's
  canonical application name and a compact hint from the directory basename.
  It waits for a confident focused-window correlation, skips Special
  Workspaces, and leaves the application open when correlation times out.
- The persistent directory-launch name has no lifecycle cleanup. It remains
  after the application closes and can be replaced by a manual rename or a
  later explicit directory launch.
