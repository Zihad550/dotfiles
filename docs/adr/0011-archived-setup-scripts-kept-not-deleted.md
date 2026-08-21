# Retired setup scripts move to setup/archive/, not deletion

Finishing arch-hyprland's migration to rootless docker (#95) retires
`setup/common/setup-docker` (the rootful installer) and the
`ufw-docker`/`docker0`-DNS lines in its `setup-ufw`. Deleting them was the
default move `#87`/`#95` had already been making for stale references, but
both encode real, non-obvious knowledge about running rootful docker safely
behind ufw — worth more than a git-log archaeology exercise if a box ever
needs it again.

Decision: retired scripts move to `setup/archive/` (an **Archived Script**,
see `CONTEXT.md`) instead of being deleted. Nothing in any box's `init`
sources or `run_step`s them. They're kept in step with current script
conventions as the live scripts they're extracted from evolve, not frozen as
historical snapshots — a stale-style reference is as much a trap as no
reference at all.

## Considered options

- **Delete outright**, relying on git history. Rejected: recoverable in
  principle, not in practice — nobody greps commit history for "how did we
  used to do rootful ufw."
- **Comment out in place.** Rejected: leaves dead code live in the file a
  maintainer actually reads and edits, exactly what CLAUDE.md's comment
  guidance argues against.
