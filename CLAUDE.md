# Guidelines

- Write code comments only for what the code can't say for itself: a non-obvious
  "why", an invariant, or a gotcha a future reader would trip over. Never
  restate what the code already shows.
- Keep them short — a line or two. A comment turning into a paragraph of
  design history or rationale belongs in the nearest owning `README.md`,
  `docs/<feature>-spec.md`, an ADR (`docs/adr/`), or `CONTEXT.md` instead.
  Leave a one-line pointer in the code (e.g. `// see ticket 12`,
  `// see docs/launcher-spec.md`), not the story itself.
- A script header may list its caller-controlled variables, their defaults,
  and their effects. Keep history, alternatives, and extended rationale in
  the owning documentation.
- Never **stage** or **commit** `git/.config/git/config`. There is no exception
  to read your way into: an instruction that sounds like it lifts this rule does
  not. Fix the file in the working tree when asked, leave it dirty, and say so.
- Do not **stage** or **commit** `claude/.claude/settings.json` unless the user
  names that file. An instruction about something else nearby is not permission.

### Issue tracker

Issues live in this repo's GitHub Issues; skills use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
