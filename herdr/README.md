# Herdr

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
