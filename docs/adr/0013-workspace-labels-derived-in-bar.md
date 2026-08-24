# Workspace labels are derived in the bar, not renamed in the compositor

Issue #98 asked for workspaces to name themselves after whatever you opened on
them. The Launcher already renames workspaces for
real, dispatching `hl.dsp.workspace.rename` from its workspaces Provider, so
the obvious implementation was to fire that same dispatch automatically on
every window open. Instead the bar derives what it displays from the
workspace's own toplevels and leaves the compositor's name untouched.

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
isn't the bare id is displayed as-is and nothing is derived over it.

## Consequences

- Labels exist only in the bar. `hyprctl workspaces` and the Launcher's
  workspaces Provider still see `3` — a reader who greps for these strings in
  the compositor will not find them, and that is the design, not a bug.
- Every numbered workspace is labeled, not just the active one — a background
  workspace takes the identity of its most recently focused window (Hyprland's
  focus history), so an entry never flips between named and bare as focus
  moves. The issue asked for "the active workspace"; the bar cannot show one
  rule for itself and another for its neighbours.
- Labels contain the application name only. Zed project roots and terminal
  working directories are deliberately omitted.
- Switching to real renames later means building the lifecycle this decision
  avoided, not just moving a call — that is the cost of reversing it.
