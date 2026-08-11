# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Host verification

Agents run in a DevPod devcontainer. It has the repo, `node`, and the shell
tooling — and **no Wayland session, no compositor, no `quickshell` binary, no
`~/.config/theme`**. Confirm with `echo $WAYLAND_DISPLAY` before assuming
otherwise.

So a checkbox that describes something *running* — a window appearing, a
keybind firing, a theme restyling, anything measured in milliseconds — cannot
be closed by an agent. It can only be closed by the user, on the host.

**Never tick a runtime checkbox from inspection.** "The code looks right" is
not the same claim as "it works", and a ticket that conflates them is worse
than one left open.

### The handoff

When a ticket reaches a host-only checkbox:

1. Set label `needs-info` — the canonical label for waiting on the reporter
   (see `triage-labels.md`), which covers waiting on host results.
2. Write a `## Manual verification` section in the issue body: one
   copy-pasteable block, and for each step what a **pass** looks like. Not
   prose the user has to translate into commands.
3. Stop. Hand the block over and say which checkboxes it closes. Do not carry
   on into work that depends on the answer.
4. The user runs it and pastes the output back.
5. `gh issue comment <n> --body "..."` with the result, tick only the boxes
   the output actually closes, and continue.

Work that does *not* depend on the pending answer should be finished before
stopping — the handoff pauses the blocked thread, not the whole ticket.

### Writing a good block

- One fenced block per step, runnable as-is. No placeholders the user has to
  fill in beyond an obvious `<name>`.
- State the expected output. "Should list a `theme` target" beats "check IPC".
- Prefer a check that fails loudly. `qs ipc call` exits 0 even for a target
  that does not exist, so its stderr is the only signal — never silence it.
- Name the trap where there is one. A registered global shortcut that never
  fires looks identical to a working one until you press the key.
