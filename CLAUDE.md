# Guidelines

- Write code comments only for what the code can't say for itself: a non-obvious
  "why", an invariant, or a gotcha a future reader would trip over. Never
  restate what the code already shows.
- Keep them short — a line or two. A comment turning into a paragraph of
  design history or rationale belongs in `docs/<feature>-spec.md`, an ADR
  (`docs/adr/`), or `CONTEXT.md` instead — leave a one-line pointer in the
  code (e.g. `// see ticket 12`, `// see docs/launcher-spec.md`), not the
  story itself.
- When doing git **commit** or **stage** ignore .claude/settings.json and git/.config/git/config, Unless the user explicitly asked to.

### Issue tracker

Issues live in this repo's GitHub Issues; skills use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, used verbatim as GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Code review

After `/code-review` finishes, also run the `/coderabbit:code-review` skill as a third, independent pass. Report its findings under their own heading — don't merge them into Standards or Spec.
