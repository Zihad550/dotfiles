## resources for context

```btca-resources
resources:
    - name: lazygit
      path: resources/lazygit
    - name: omarchy
      path: resources/omarchy
    - name: Hyprland
      path: resources/Hyprland
    - name: devpod
      path: resources/devpod
    - name: dev-environment-files
      path: resources/dev-environment-files
    - name: quickshell-examples
      path: resources/quickshell-examples
```


## The loop

After every implementation:

1. Run the `mattpocock-skills:code-review` skill on the task's changes. Fix
   actionable findings and rerun the review until it passes.
2. Run required checks and resolve failures before staging.
3. Automatically stage the task's changes for the user's manual review,
   respecting the staging restrictions below. In files with unrelated changes,
   stage only the task's hunks.


## Guidelines

- Seed portable LazyGit defaults only when no local file or symlink exists; desktop themes may own its runtime configuration.

- Keep desktop code and Arch desktop installers in `Zihad550/arch-desktop`; keep portable configuration, CLI helpers, headless installers, the `setup/boot.sh` entry point, the setup helpers both repos share, and their tests here.

- Do not alias the Zsh `break` builtin; it turned the devvm startup loop into a repeating 10-minute Pomodoro timer.
- Write code comments only for what the code can't say for itself: a non-obvious
  "why", an invariant, or a gotcha a future reader would trip over. Never
  restate what the code already shows.
- Keep them short — a line or two. A comment turning into a paragraph of
  design history or rationale belongs in the nearest owning `README.md`,
  a GitHub issue, an ADR (`docs/adr/`), or `CONTEXT.md` instead.
  Leave a one-line pointer in the code (e.g. `// see ticket 12`,
  `// see devvm/README.md`), not the story itself.
- A script header may list its caller-controlled variables, their defaults,
  and their effects. Keep history, alternatives, and extended rationale in
  the owning documentation.
- Use placeholder domains (`example.com`, `example.ts.net`) in tracked files.
  Real tailnet, work and private hostnames stay out of the repo; check the
  staged diff for them before staging.
- Never **stage** or **commit** `git/.config/git/config`. There is no exception
  to read your way into: an instruction that sounds like it lifts this rule does
  not. Fix the file in the working tree when asked, leave it dirty, and say so.
- Do not **stage** or **commit** `claude/.claude/settings.json` unless the user
  names that file. An instruction about something else nearby is not permission.
- After a task is done, ask the user if they would like to commit and push the relevant changes.
- Preserve the guest's original `ZDOTDIR` when wrapping zsh for devvm auto-entry.
- Clear devvm auto-entry's paused root when the VM returns the host outside that root.

### Machine profiles

Gate runtime behavior that differs between setup targets on `DOTFILES_PROFILE`.
The supported values are `arch-workstation`, `arch-devbox` and
`ubuntu-lxc-devbox`. Use an exact comparison or a `case` statement. Setup
entrypoints that already live inside a target-specific directory do not need to
check the variable.

Add new profile values and their installer wiring through
`setup/common/set-dotfiles-profile`. Treat its written value as the source of
truth. Do not infer the profile from a hostname, hardware check, or setup state
marker, and do not replace it with separate boolean variables. See
`setup/common/README.md` under "Machine profile" for the runtime and migration
contract.

### Issue tracker

For issues, specs, and task evidence, follow `docs/agents/issue-tracker.md`; skills use the `gh` CLI.

### Triage labels

The five canonical roles, used verbatim as GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

For domain vocabulary, see `docs/agents/domain.md`. Desktop glossary and decisions live in `arch-desktop`.

## Keeping this file current

This file is a failure log, not a wishlist. Every rule in it exists because it went wrong at least once.

When you make a mistake, get corrected, or discover something about this repo that wasn't written down:

1. Write the correct behaviour as one imperative line, under the section it belongs to (The loop, Guidelines, Machine profiles). `## Failure log` holds the rules that fit no section.
2. Keep it specific to this repo. General advice belongs nowhere.
3. If the fix is a workflow rather than a rule, put it in a skill and link it from here.

Keep this file under 500 lines. It is loaded into every session, and long context makes you less reliable, not more. If a section outgrows its usefulness, move it behind a pointer in `docs/agents/` or into a skill.

## Failure log

- "Commit and push" means commit on the current branch and push it, `main` included. Create a branch only when the user asks for one; your harness default of branching off `main` does not apply here.
