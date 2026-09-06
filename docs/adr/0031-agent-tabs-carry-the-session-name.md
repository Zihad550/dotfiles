# Agent tabs carry the agent's session name

`zsh/.config/zsh/herdr-rename.zsh` labelled every tab from the directory and
the running command, so every agent tab in a session read `1:dotfiles (codex)`
— identical across tabs, and useless for finding the one you left a task
running in. [`toyamarinyon/herdr-thread-to-tab`](https://github.com/toyamarinyon/herdr-thread-to-tab)
is a marketplace plugin that does exactly this sync, and [ADR 0019](0019-herdr-supports-plugins.md)
says to check the marketplace before writing an in-repo workaround. The hook
is extended instead.

## Why

**The plugin and the hook cannot both own a label.** The plugin replaces a
label only when it is Herdr's numeric default or one the plugin itself wrote.
The hook renames the tab at `preexec`, immediately before the agent starts, so
by the time the plugin looks the label is `1:dotfiles (codex)` — indistinguishable
from a hand-typed name, and left alone forever. Adopting the plugin therefore
means deleting the tmux-style labelling for every tab, agent or not, to buy
naming for the minority of tabs that hold an agent.

**A shell hook cannot see the session it names.** `precmd`/`preexec` never run
while an agent holds the foreground, which is exactly the window in which the
session gets its name. Herdr publishes pane events on its socket but exposes
no CLI verb to subscribe to them, so the hook polls `herdr pane current`
(~2 ms) every three seconds for the life of the agent command and stops when
the next hook fires.

**Codex's name is not in its terminal title.** Codex sets the title to the
project directory and reports only a thread id to Herdr. The plugin resolves
that id by spawning `codex app-server` and speaking `thread/read` to it; the
same name is already in `~/.codex/session_index.jsonl`, appended to on every
rename, so the hook greps the id and takes the last entry rather than starting
a process per poll. Every other agent puts a usable summary in the terminal
title, which Herdr already reports.

## Consequences

- The "label we last set" state moves from an in-shell associative array to
  `${XDG_RUNTIME_DIR}/herdr-rename-$UID/<tab-id>`: the watcher renames the same
  tab from a separate process, and both writers need one answer to "is this
  label mine, or did someone type it?".
- A label the agent set is reclaimed by the shell when the command exits — it
  is in the state file, so it doesn't read as a manual rename. A rename typed
  by hand still wins over both writers, as it did before.
- A title that is only the agent's own name or the directory is rejected, so
  those tabs keep the `1:dotfiles (codex)` form rather than losing information.
- `_herdr_agent_commands` decides which commands get a watcher; it mirrors the
  agent integrations installed by `setup/common/setup-herdr` and drifts from
  them by hand.
- `.zshrc` now sources the hook behind a `command -v herdr` guard. It never
  did, so none of the behavior ADR 0003 describes had ever actually run — a
  reader comparing that ADR against a live session before this change would
  have found plain directory tabs and no hook at all.
- `tests/multiplexer/tabRename.test.js` runs the hook under `zsh` against a
  fake `herdr` and a fake session index, since who-owns-the-label is behavior,
  not text a grep can check.
- This contradicts ADR 0019's default of preferring a marketplace plugin.
  Revisit if the plugin gains a way to share a label with another writer, or
  if Herdr grows a CLI event subscription that would remove the poll.
