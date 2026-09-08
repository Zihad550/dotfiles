# Agent tabs carry a short task summary, via a plugin

Every agent tab in a Herdr session reads the same thing — the directory, or
Herdr's tab number — so the tab holding the session you left a task running in
is unfindable. [ADR 0019](0019-herdr-supports-plugins.md) says to reach for
Herdr's plugin API before an in-repo workaround. `herdr-plugins/tab-namer` is
that plugin, written here rather than installed from the marketplace.

## Why

**A shell hook cannot see the session it names.** The first attempt was a zsh
`precmd`/`preexec` hook. Those never run while an agent holds the foreground,
which is exactly the window in which a session gets its name, so it needed a
polling watcher, a background process per agent pane, and an on-disk lock to
arbitrate between the watcher and the shell. It was removed in `900c435`.
A plugin has none of that shape: Herdr invokes `[[events]]` commands itself,
out of band from any shell.

**Bash, not Rust.** Herdr runs `command` values as argv arrays, so a plugin is
any executable — "a Bash script, JavaScript app, Lua script, Rust binary". The
marketplace plugin this replaces is Rust, which buys a socket listener we do
not need and costs a per-target release pipeline: its install step downloads
platform tarballs and verifies checksums so `plugin install` works from GitHub.
`herdr plugin link` points at the working tree instead, so there is no build,
no release, and no install step to keep working.

**Events, not a socket listener.** The marketplace plugin runs a `[[startup]]`
listener that subscribes to `pane.created`/`pane.updated`/`pane.agent_detected`
over `HERDR_SOCKET_PATH`. Declaring `[[events]]` hooks gets the same coverage
with no long-lived process: `pane.agent_detected` when the agent appears,
`pane.agent_status_changed` at every turn boundary — which is when a session's
name changes — and `pane.exited` to hand the label back. Herdr passes the
payload in `HERDR_PLUGIN_EVENT_JSON`; host-verified that `pane_id` arrives at
`.data.pane_id`, though the plugin takes the first `pane_id` anywhere in the
payload rather than depending on that nesting.

**Codex's name is not in its terminal title.** Codex sets the title to the
project directory and reports only a thread id to Herdr. The marketplace plugin
resolves that id by spawning `codex app-server` and speaking `thread/read`; the
same name is already in `~/.codex/session_index.jsonl`, appended to on every
rename, so the last entry for the id is current and no process is spawned.
Agent detection can precede that index entry, so the latest user message in the
thread's rollout transcript supplies the initial name until the index catches
up.
Other agents usually put a usable summary in the terminal title, which Herdr
already reports. Claude Code can leave that title at `Claude Code`, so the
plugin falls back to the latest human prompt in the session transcript under
`~/.claude/projects`.

**Haiku compresses the source text.** The raw session name or prompt can be a
sentence, so the event command passes it to the same non-interactive,
tool-disabled Claude Haiku setup used by Worktrunk's commit generator. The
result is cached until that source text or branch changes. Issue numbers are
extracted from the source text or branch and appended without asking the model
to infer one.

## Consequences

- Labels use `<position>:<three or four word summary> [#issue]`. The position
  is recalculated on tab creation, closure, and movement, so it follows the
  visible order rather than Herdr's never-reused public tab number.
- Only a tab with exactly one pane is renamed. A shared tab has no single pane
  to be named after, and no rule would pick the right one.
- The plugin takes over a label only when it is Herdr's numeric tab-position
  label or one the plugin previously wrote, recorded per tab under
  `HERDR_PLUGIN_STATE_DIR`. Herdr's never-reused public tab number is a
  different field. Anything else was typed by hand and is left alone.
- A title that is only the agent's name, a raw session id, or the tab's own
  directory is rejected — the tab keeps Herdr's numeric default label rather
  than gaining a label that says nothing.
- A generic Claude Code title is replaced by the latest usable prompt from its
  transcript; the terminal title remains preferred when it contains a summary.
- Tabs still carrying labels from the removed shell hook (`1:dotfiles (codex)`)
  read as hand-typed and are never claimed. Renaming such a tab back to its
  numeric tab-position label hands it to the plugin.
- `setup/common/setup-herdr` links the plugin from the working tree. Re-linking
  an already-linked plugin is a no-op, so the setup script stays idempotent.
- Directory-and-command tab labels for non-agent tabs are not restored. That
  was the other half of the removed hook, and nothing here replaces it — plain
  shell tabs keep Herdr's numbers.
