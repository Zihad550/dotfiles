# Themes download on demand from a separate pack repo

The repo carried 17 themes, but only one is used at a time. Decision: keep
`kanagawa` in `themes/builtin/` and move the rest to
`Zihad550/dotfiles-themes`. Setup makes a partial
(`--filter=blob:none`), sparse clone of that repo at `~/dotfiles-themes`. The
picker lists the clone's folders with `git ls-tree`, and picking a theme runs
`git sparse-checkout add <name>`. Third-party installs go to
`~/.local/share/dotfiles/themes/`.

## Why

**One pack repo, not one repo per theme.** The themes share an author and
change together when a template changes. One clone and one pull serve all of
them. Omarchy uses one repo per theme because its user themes come from
different authors.

**Git, not raw HTTP downloads.** `ls-tree` reads the last fetch, so the list
works offline. A theme's files are downloaded only when it's checked out.
`git pull` updates installed themes, and there is no index file to keep in
sync or API rate limit to hit.

**Separate roots instead of one stowed `~/.config/themes`.** Stow linked that
whole directory into this repo, so `df-theme-install` cloned into the working
tree. `df-theme-remove` also could not tell built-in themes from user themes.
With one root per kind, a theme's root says who owns it. `df-theme-dir`
resolves a name in the order user, pack, built-in, matching Omarchy's
user-over-built-in rule.

**The pack isn't stowed.** Checkouts change at runtime, after stow has run.

**Omarchy compatibility.** `df-theme-generate` accepts Omarchy's semantic
`colors.toml` names. `df-theme-install` drops Lua, `vscode.json` and
symlinks from cloned themes, as `omarchy-theme-set` does.
