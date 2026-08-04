# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

`.scratch/` is not gitignored — issues are committed alongside the config they describe.

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

1. Set `Status: needs-info` — the canonical label for waiting on the reporter
   (see `triage-labels.md`), which covers waiting on host results.
2. Write a `## Manual verification` section in the ticket: one copy-pasteable
   block, and for each step what a **pass** looks like. Not prose the user has
   to translate into commands.
3. Stop. Hand the block over and say which checkboxes it closes. Do not carry
   on into work that depends on the answer.
4. The user runs it and pastes the output back.
5. Append the result under `## Comments`, tick only the boxes the output
   actually closes, and continue.

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

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
