# drafts

Claude Code mod: a side pane showing the newest drafts the draft skills
(`draft-gt-command-for-issue-create`, `work-draft-reply`, `work-pr-info`) write
to `tmp/` under the session's project root (`$.session.root()`: where the
session started, or where `/cd` or a worktree move took it):
`tmp/gt-issue-*.md`, `tmp/gt-comment-*.md` and `tmp/draft-*.md`. Unlike `/tmp`,
it survives a reboot. `/tmp/` in `git/.config/git/.gitignore_global` keeps it
out of commits.

`/drafts` or `ctrl+x d` toggles the pane; the choice persists across sessions.
The chord is bound in `claude/.claude/keybindings.json`; `ctrl+d` is hardcoded
to exit and cannot be rebound. In the pane, `c` copies the shown draft and `r`
rescans.
Drafts render as Markdown, styled like a reply; copying keeps the original
text.

## Install

```
claude plugin marketplace add ~/dotfiles/claude/.claude/mods
claude plugin install drafts@dotfiles-mods
```

The marketplace is a local folder, so the plugin is read from here: after an
edit, run `/reload-plugins`.

## Check

```
claude plugin validate claude/.claude/mods/drafts
claude plugin test claude/.claude/mods/drafts
```
