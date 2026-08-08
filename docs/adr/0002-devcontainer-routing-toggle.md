# Devcontainer routing becomes one shared, default-off switch

Opening a mirrored directory from the Launcher, and opening a tmux session
with `SUPER+U`, both route into the devcontainer over SSH — the Launcher only
for paths under a fixed allowlist, tmux unconditionally, for any path at all.
Neither ever asks; each just hardcodes `devcontainer.devpod` and goes. The
tmux script even carries a comment admitting it: "kept in sync with
`directories.js`" — two copies of the same host, no shared source of truth,
no way to turn either off short of editing the script.

This becomes one persisted, default-**off** toggle plus an optional
custom-host override, both read from state files under `~/.local/state/`, and
consulted by every call site instead of each hardcoding its own copy of
`devcontainer.devpod`. Off means every one of them behaves as if the
devcontainer feature does not exist — no SSH, no devpod auto-start triggered.

## Why

**Default off, not on.** Until now the Launcher's routing ran the instant a
path matched the allowlist, and tmux ran unconditionally — there was never a
day-one decision to make this opt-out; it was just always on. Flipping the
default to off is deliberate: the common case this toggle exists for is
working normally, with the devcontainer as something turned on for a session
rather than assumed.

**One shared switch, not per-tool ones.** A future reader hitting "why does
tmux still SSH when the Launcher just stopped" is exactly the confusion this
forecloses — one mental model, one state, everywhere.

**A state file, not an env var.** The three consumers span a QML/JS process
(Quick Settings, and the Launcher's own provider modules) and a bash script
invoked fresh per keybind. An env var set in one shell doesn't reach either —
a daemon-launched tab never inherited it, and an already-running Quick
Settings process wouldn't see a later export. A file both can independently
`stat`/read at the moment they act is the one mechanism that reaches all of
them, and this repo already has the idiom for it (the unused
`~/.local/state/omarchy/toggles/<name>` existence-flag pattern in
`df-theme-set-vscode`).

**The mirrored-path allowlist stays a second, independent gate.** The toggle
answers "am I working with the devcontainer right now"; the allowlist answers
"does the devcontainer actually have this directory mounted." Folding the
allowlist into the toggle (routing everything when on) would send an
unmirrored directory over SSH to a devcontainer that has never heard of it —
a strictly worse failure than opening it locally.

## Consequences

- The Launcher's `lib/directories.js` / `lib/files.js` and
  `bin/df-tmux-session` stop each hardcoding `devcontainer.devpod` — the
  duplication the tmux script's own comment already flagged.
- `bin/df-tmux-session` gains a path check it never had: before, it opened an
  SSH window for any directory unconditionally; now it only does so when the
  toggle is on **and** the path is in the mirrored allowlist, same as the
  Launcher.
- Zed's `ssh_connections` entry in `zed/settings.json` is deliberately left
  out of this — it's a manually invoked saved profile, not automatic routing,
  so it doesn't read the toggle.
