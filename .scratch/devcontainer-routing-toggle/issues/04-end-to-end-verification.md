# 04 — End-to-end: one switch, everywhere

**What to build:** Nothing new — this ticket confirms the point of the
whole feature: flipping the Quick Settings row (ticket 03) is the *only*
action needed to change both the Launcher (ticket 01) and the tmux keybind
(ticket 02) together, Zed's static "Connect via SSH → devcontainer.devpod"
profile is unaffected, and no hardcoded copy of `devcontainer.devpod`
survives outside the two state-derived defaults this feature introduced.

**Blocked by:** 01, 02, 03

**Status:** needs-info — the one static-analysis checkbox is closed; the four
runtime checkboxes need the user, and one of them needs a devpod workspace
this session doesn't have. See **Comments**.

- [x] Repo grep confirms `devcontainer.devpod` no longer appears as an
      independent hardcoded literal outside the state-file default fallback
      in the Launcher's directories/files module and `bin/df-tmux-session`
- [ ] With the Quick Settings row off, opening a mirrored directory from the
      Launcher and pressing `SUPER+U` for the same path both stay local
- [ ] Flipping the row on (no custom host) restores both to today's
      `devcontainer.devpod` behavior, unchanged
- [ ] Setting a custom host and leaving the row on routes both the Launcher
      and tmux to that host
- [ ] Zed's manual "Connect via SSH → devcontainer.devpod" profile still
      connects regardless of the row's state, confirming it was correctly
      left untouched by this feature

## Manual verification

The grep is closable from the container; everything else needs the host.

1. **No stray hardcoded host.**
   ```
   grep -rn "devcontainer.devpod" quickshell/.config/quickshell/launcher/lib/ bin/df-tmux-session
   ```
   *Pass:* every hit is the single fallback-default definition in each file,
   not a second independent copy.
2. **One switch, off.**
   Turn the Quick Settings row off. Open `~/dotfiles` from the Launcher and
   press `SUPER+U` on the same directory. *Pass:* both open purely locally.
3. **One switch, on.**
   Turn the row on, no custom host set. Repeat step 2's actions. *Pass:*
   both route to `devcontainer.devpod`, matching pre-feature behavior.
4. **One switch, custom host.**
   Set a custom host, keep the row on. Repeat step 2's actions. *Pass:* both
   route to the custom host.
5. **Zed unaffected.**
   With the row off, use Zed's own "Connect via SSH" picker to reach
   `devcontainer.devpod` directly. *Pass:* it connects, regardless of the
   row's state.

## Comments

This session runs on the host, not the container `docs/agents/issue-tracker.md`
describes (`$WAYLAND_DISPLAY=wayland-1`, quickshell live under real PIDs) —
but there is no `devpod` binary, no devpod-managed container in `docker ps
-a`, and `devcontainer.devpod` doesn't resolve. Steps 3–5 need a running
devpod workspace this machine doesn't currently have provisioned, so they're
left for the user same as if this were the container.

**Checkbox 1 (grep), closed.** The ticket's own scoped command found exactly
one hit per file — the fallback-default definition — in both
`quickshell/.config/quickshell/launcher/lib/{directories,files}.js` and
`bin/df-tmux-session`. A wider repo-wide grep also turns up
`devcontainer.devpod` in `DevcontainerRoutingRow.qml` (the detail-text
fallback and the placeholder string) and in `zed/settings.json`. Neither is a
violation of the "two state-derived defaults" claim in this ticket's own
prose: `zed/settings.json`'s copy is the manually-invoked profile the
ADR/spec explicitly leave untouched (checkbox 5's subject), and the QML
row's copy is a third, architecturally-forced duplicate — `dotfiles/` and
`launcher/` are separate quickshell configs (own `shell.qml` each, no shared
code), so the row can't import `directories.js`'s `SSH_HOST` the way a
same-config module could. Worth naming here since the ticket's prose reads
as "exactly two," but the actual invariant is "one hardcoded value per
process boundary that can't reach the state files or each other's code."

**Checkboxes 2–4, logic verified at the file/script layer, not through the
GUI.** For each of the three states (row off; row on, no host; row on,
custom host `custom.example`), I wrote the exact files `DevcontainerRoutingRow.qml`'s
`onClicked`/`commitHost()` would write (`toggles/devcontainer-routing`,
`devcontainer-host`), then ran the real `bin/df-tmux-session` against a
stubbed `ssh`/`tmux` (same technique ticket 02 used) and called
`directories.js`'s `defaultOpenArgv` with the matching `routed`/`host`
values. Both consumers agreed in all three states: off → no `ssh` invoked
by either; on/no host → both resolve to `devcontainer.devpod`; on/custom
host → both resolve to `custom.example`. This covers the pure decision
logic and confirms tmux and the Launcher's JS module can't disagree given
the same state-file contents. It does **not** cover the Launcher's own
file→decision step (`Directories.qml`'s `routedFor` + its two `FileView`s
reading the state files themselves) or the actual GUI click and keybind —
those rest on ticket 01's host-verified checkboxes plus the four manual
steps above. State files were restored to the pre-test baseline (toggle
absent, no custom host) afterward.

**Checkbox 5, not run.** `zeditor` is installed here, but there's no devpod
workspace for it to connect to (see above) — needs the user to run it once
one exists.

**Test suite:** `node --test "tests/launcher/*.test.js"` — 398/400 pass. The
2 failures (`chooserApps offers Tmux alongside the same five apps, mirrored
or not` and `chooserEntriesFor defaults to no prefix when none is given`,
both in `directories.test.js`) predate this feature: `chooserApps`' array
has had `Tmux` first (not the `Zed, VSCode, Cursor, Neovim, Tmux, Files`
order those two tests assert) since commit `853af1b`, four commits before
ticket 01 started this branch. Confirmed via `git show 853af1b:...
directories.js` — unrelated to devcontainer routing, left unfixed as out of
scope for this ticket. Flagging here so it isn't mistaken for a regression
this feature introduced.

**Follow-up:** fixed at the user's request. The `Tmux` block in
`chooserApps` was indented 6 spaces against every sibling's 8 — a
hand-inserted entry at the front of the array, not designed there — moved
to sit between Neovim and Files, matching `files.js`'s own
editors-then-catchall-last order and the two tests. Suite now 400/400. This
is a user-visible change: the directory chooser's default (first, likely
Enter-selected) row goes back to Zed instead of Tmux.
