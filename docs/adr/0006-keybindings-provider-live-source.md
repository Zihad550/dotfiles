# Keybindings Provider reads live `hyprctl binds`, not the Lua source

The Launcher's `keybindings` Provider (`!` prefix) lists every Hyprland bind by
shelling out to `hyprctl binds -j` on each open, rather than parsing
`hypr/.config/hypr/lua/bindings/*.lua`. Static parsing was the more obvious
path — it would give exact key text and file+line for free — but was
rejected: hyprlua binds have no re-invocation path (`hyprctl dispatch __lua N`
errors, confirmed by test), so nothing forced full source knowledge, and a
hand-maintained parser for `o.bind()` calls — including the
`for i = 1, 10 do` loop generating the workspace binds — is a second source
of truth for data that already exists live.

## Consequences

- 24 binds are triggered by physical `code:N` rather than a named key (10
  workspace switch/move pairs, 4 resize binds) — `hyprctl` reports these with
  an empty key field, so the Provider carries a small hardcoded lookup table
  for them instead, matched against the bind's `description`.
- The "edit" secondary Action can't use a parsed file+line either — it
  `grep -n`s the description text across `bindings/*.lua` at the moment the
  action is invoked, not at load time. Landing on the wrong twin among the 4
  duplicate-worded binds (e.g. one of the two "Full width" binds) is an
  accepted, rare miss.
- `resize` submap binds needed real descriptions added in `tiling.lua` (they
  had none) so the Provider never has to special-case a nameless Entry.
