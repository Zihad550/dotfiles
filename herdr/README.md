# Herdr

Super+I opens the personal session and triggers `df-update-daily` once per
evening slot, using the update host's local clock. A slot opens at 18:00 and
lasts until 18:00 the next day. The first Super+I after 18:00 runs the
evening's update. If that evening was missed, the next Super+I (the next
morning, say) catches it up, and that evening's slot still runs as usual.
Several missed evenings produce one catch-up. Every Super+I checks, including
one that only shows or hides an open session; nothing runs without a press
(see arch-desktop issue #1). On daylight-saving change days, the slot opens
an hour early or late. Updates follow the same devcontainer routing as the
session; Super+U does not trigger them. The first workspace receives three
background tabs on development profiles.
On `arch-workstation`, it receives only a devvm update tab, which syncs agent
settings and runs `df-devvm-update`; host skills, mise packages and agent
integrations are not updated.

`${XDG_STATE_HOME:-~/.local/state}/dotfiles/update-daily.last-triggered`
records the date of the last claimed evening slot. A lock prevents concurrent
triggers, and the date survives restarts. The slot is recorded before creating
tabs, so a partial failure is not retried automatically within that slot. Manual
`df-update-daily` inside Herdr remains available regardless of time or date.

Leader → Ctrl+N runs `bin/df-herdr-new-worktree`.
Enter a branch name to create its checkout beside the primary project,
using Worktrunk's default directory pattern: `<project>.<branch>`.
Slashes in branch names become hyphens. For example, `feature/login` in
`~/dev/project` creates `~/dev/project.feature-login`.

Creation from a linked worktree uses the same primary project directory.
Herdr opens the checkout as a focused workspace.
An empty branch entry cancels. Errors remain visible until Enter is pressed.
Bare repositories are rejected.

This helper replaces Herdr's `new_worktree` key, which is unbound. Herdr's
sidebar New worktree action still exists and uses Herdr's default worktree
directory, since this config sets no `worktrees.directory`.
