# drafts

Claude Code mod: a side pane showing the newest drafts the draft skills
(`draft-tea-command-for-issue-create`, `work-draft-reply`) write to
`/tmp/tea-issue-*.md`, `/tmp/tea-comment-*.md` and `/tmp/draft-*.md`.

`/drafts` toggles the pane; the choice persists across sessions. In the pane,
`c` copies the shown draft and `r` rescans.

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
