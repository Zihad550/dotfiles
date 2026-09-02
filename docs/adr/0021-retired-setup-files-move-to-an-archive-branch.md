# Retired setup files move to an archive branch, not setup/archive/

Retiring the fedora target (#110's cleanup) put a whole distro directory up for
archival, not the single extracted script `0011` was written for. Thirteen files
that nobody can run, kept in `main` and — per `0011` — kept in step with current
script conventions as the live scripts around them evolve, is a maintenance bill
with no reader.

Decision: retired setup files move to a branch named `archive/<topic>`, and are
deleted from `main`. The branch is pushed and never merged; `main` keeps no
`setup/archive/` directory. `setup/archive/` itself is retired under its own
rule, to `archive/rootful-docker`.

This supersedes `docs/adr/0011-archived-setup-scripts-kept-not-deleted.md`
entirely.

## Why

**`0011` rejected deletion, and it was right to.** Its argument — "recoverable in
principle, not in practice — nobody greps commit history for 'how did we used to
do rootful ufw'" — still holds against deleting outright. A branch is the part
`0011` did not consider: it is a named, pushed, listable thing. `git branch -r`
shows it; a commit SHA in a changelog does not.

**The upkeep clause is what actually failed.** `0011` asked that archived
scripts be "kept in step with current script conventions, not frozen as they
were when retired." That is the clause nobody honours, because the incentive to
edit an unrunnable script is nil — and `0011` itself named a stale-style
reference as "as much a trap as no reference at all." A branch is honestly
frozen, and frozen is what these files were going to be anyway.

**Directory scale broke the shape.** One extracted script sitting beside its
live sibling reads as a footnote. A thirteen-file distro tree in `setup/` reads
as a supported target, which is what `boot.sh` dispatching at `fedora)` had
quietly made it.

## Consequences

- **Inbound links from `main` become branch references, not paths.** Four
  pointers reached into `setup/archive/`: `setup/common/setup-rootless-docker`,
  `setup/arch-workstation/setup-packages/setup-ufw`, and two in
  `setup/arch-devbox/README.md`. They now name the branch instead of a relative
  path, so they are no longer clickable in the working tree. This is the real
  cost of the change, and the reason `0011` went the other way.
- **Retrieval is `git show archive/<topic>:<path>`**, or a checkout. Both are
  cheaper than history archaeology and neither is as cheap as opening the file.
- **Branches are never merged and never deleted.** A merged archive branch puts
  the files back; a deleted one is the outright deletion `0011` rejected.
- **The naming is `archive/<topic>`, not `archive/<date>`.** `archive/fedora-setup`
  and `archive/rootful-docker` say what is inside; a date says when someone got
  tired of it.

## Considered options

- **Keep `setup/archive/`, as `0011` decided.** Rejected above: the upkeep
  clause is unenforceable, and directory-scale archives misread as live targets.
- **A branch per retirement event, dated.** Rejected: the topic is what a reader
  searches for. Two retirements of the same subsystem can share a topic branch.
- **A single long-lived `archive` branch collecting everything.** Rejected: it
  would need merges from `main` to stay applicable, and a branch that takes
  merges is a branch someone eventually merges back.
