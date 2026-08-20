# Herdr keeps following Devcontainer Routing after every other action stops

Issue #92: with Devcontainer Routing on, opening a local directory under a
Mirrored Directory root sent it over SSH for every Launcher action — Zed,
VSCode, Cursor, Neovim, Files — even though the exact files already exist on
this machine. The fix makes routing follow provenance instead of a
toggle-gated path check: a local-provenance directory always opens locally,
a remote-provenance one (#90/#91) always opens remote, for all five of those
actions and the Files Provider (`~`). `bin/df-herdr-session` — both `SUPER+U`
and the Launcher's own Herdr chooser row — is deliberately left out. It keeps
resolving `routing enabled && is_mirrored(path)` exactly as
`docs/adr/0007-super-u-follows-devcontainer-routing.md` left it, so a local
Mirrored Directory can now open remote via Herdr and local via every other
action in the same chooser.

## Why

**Fixing Herdr here would re-open the choice ADR 0007 already settled.**
ADR 0007 deliberately moved `SUPER+U` from always-local (ADR 0003's
`--local` flag) to following the toggle, arguing that the surprise of a
mismatched keybind was worse than the surprise of an unwanted SSH session.
This ticket's new rule — local-provenance always local — would silently
re-reverse that call for the fixed `~/dotfiles` path `SUPER+U` always opens.
That reversal deserves its own deliberate decision, not a side effect of
fixing four unrelated argv builders.

**The two consumers can't be split.** `chooserApps`'s Herdr row and
`SUPER+U` both resolve routing by calling the same script,
`bin/df-herdr-session`, which re-derives `is_mirrored` itself rather than
accepting a decision from its caller (see the script's own header comment).
Changing one changes both; leaving Herdr's Launcher-side behavior alone means
leaving `SUPER+U` alone too, and vice versa.

**The result is a real, visible inconsistency, not an invisible one.**
The Herdr row now sits in the same chooser as four rows that never route a
local directory, with no prior way to tell it apart. Rather than accept that
silently, the Herdr row's subtext gains a `· <host>` suffix (the same shape
`lib/directories.js`'s `subtextFor` already uses for remote-provenance
entries) whenever `routing enabled && isMirrored(path, home)` — i.e.
whenever it will actually route. `isMirrored`/`MIRRORED` survive in
`lib/directories.js` for exactly this one on-demand call, not for routing
any action's argv and not computed across the whole directory pool.

## Consequences

- `lib/directories.js`'s `entryFor` no longer carries a `mirrored` field on
  local entries; `routedFor` is gone entirely. `isMirrored`/`MIRRORED`
  remain, called only from `chooserApps` while building the Herdr row.
- `lib/files.js`/`Files.qml` drop every trace of Devcontainer Routing —
  no toggle/host `FileView`s, no `isMirrored`, no ssh argv branch. The Files
  Provider was already local-only (`CONTEXT.md`'s Directory Index entry);
  this makes the code match that.
- `Directories.qml` keeps its toggle/host `FileView`s: still needed to gate
  whether remote-provenance entries exist in the pool (`remoteReady`) and to
  compute the Herdr marker.
- A future ticket that wants Herdr to stop being the exception has one clear
  place to start: `bin/df-herdr-session`'s `is_mirrored` check, and the
  marker in `chooserApps` that mirrors it.
