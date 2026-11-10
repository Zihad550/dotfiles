# lazy-diff

Claude Code mod for reviewing and staging Git changes beside the chat.
`/lazy-diff` opens its own pane, starting with staged files. It uses the
repository containing the current session root, including linked worktrees.

- Switch between **staged**, **unstaged** (including untracked), and **all**.
- The file tree sits in a right sidebar beside the diff. **Hide files / Show
  files** (`b`) collapses or restores it, preserving the selection and expanded
  folders. Hiding it gives the diff the full pane width.
- Folder icons change when expanded or collapsed; file icons identify common
  languages and config formats, with a generic fallback. Icons use a Nerd Font
  (the repo’s Ghostty config uses JetBrainsMono Nerd Font).
- Press a folder to expand or collapse it.
- Press a filename to preview it without changing the index.
- Press its checkbox to stage the whole file (`[ ]`) or unstage it (`[x]`).
  A partially staged file shows `[x]`: uncheck it to unstage, then check it
  to stage all changes. Unstaging uses path-only `git reset -- <path>`,
  preserving working files even before the first commit.
- The preview uses Claude Code's built-in `Code` element with `format="diff"`.
  **All** shows staged and unstaged diffs separately.
- `r` refreshes. Writes, edits, and Bash calls refresh an open pane too.
  External edits appear on the next refresh. Files that leave the active
  filter after staging or unstaging disappear, and the next file is previewed.

Renames include both paths in index operations. Untracked files use Git's
`--no-index` diff; conflicts must be resolved before the checkbox can stage
them. Empty files, binary files, and metadata changes retain Git's output.
Large diffs show a message instead of cutting a highlighted hunk in half.

## Install

The shared `setup/common/setup-skills` installs this mod without bundling any
skills in it. To install only this mod:

```sh
claude plugin marketplace add ~/dotfiles/claude/.claude/mods
claude plugin install lazy-diff@dotfiles-mods --scope user
```

`scripts/stow/stow-ai` links the marketplace to `~/.claude/mods`. Claude reads
the plugin in place; after editing it, run `/reload-plugins`.

## Check

```sh
claude plugin validate claude/.claude/mods/lazy-diff
claude plugin test claude/.claude/mods/lazy-diff
node --experimental-strip-types --test claude/.claude/mods/lazy-diff/tests/git.integration.mjs
```
