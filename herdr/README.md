# Herdr

Super+I opens the personal session and triggers `df-update-daily` if it has
not already been triggered that day, using the update host's local date.
Reopening an existing session also checks. There is no time-of-day filter. Updates follow the same devcontainer routing as the session; Super+U
does not trigger them. The first workspace receives three background tabs on development profiles.
On `arch-workstation`, it receives only a devvm settings update tab; host
skills, mise packages and agent integrations are not updated.

`${XDG_STATE_HOME:-~/.local/state}/dotfiles/update-daily.last-triggered`
records the last automatic trigger date. A lock prevents concurrent triggers,
and the date survives restarts. The date is recorded before creating tabs,
so a partial failure is not retried automatically that day. Manual
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
