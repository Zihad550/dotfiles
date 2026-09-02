# Retire the dead theme targets

## Why

Four programs the theme system used to style are gone from this machine's
setup, each replaced by quickshell:

| Target    | Replaced by                                    | Retired in |
| --------- | ---------------------------------------------- | ---------- |
| `mako`    | quickshell notification daemon                 | earlier    |
| `swayosd` | quickshell OSD (`OsdService.qml`, `Osd.qml`)   | earlier    |
| `waybar`  | quickshell Bar                                 | earlier    |
| `walker`  | quickshell Launcher                            | ticket 19  |

Each was retired by *disabling* rather than deleting: the template was renamed
`<name>.tpl.disabled` so `df-theme-generate`'s `*.tpl` glob stops matching it,
and every line of shell that referenced the program was commented out in
place. That was the right move while a rollback was plausible. It no longer
is — all four replacements have been in daily use, and ticket 19 removed the
last of the four outright.

What the disabling convention leaves behind is not inert. `themes/` still
ships 68 generated colour files nothing reads, three stow packages nothing
stows, and roughly a dozen blocks of commented-out shell across `bin/`,
`hypr/`, `rofi/`, `scripts/` and `setup/`. A reader cannot tell from the file
alone whether a `.tpl.disabled` is a decision or an oversight, and the
commented `systemctl --user restart waybar.service` lines read as a service
that might still matter.

## Goal

Delete the four retired targets from the repo entirely, and retire the
`.tpl.disabled` convention with them. Git history is the archive; the working
tree should describe only what runs.

## Scope

**In:**

- The four `themes/templates/*.tpl.disabled` files.
- Their generated per-theme outputs — `mako.ini`, `swayosd.css`, `walker.css`,
  `waybar.css` across all 17 theme directories (68 tracked files).
- The dead stow packages `mako/`, `swayosd/`, `waybar/`.
- Commented-out shell and Lua that would have driven these four programs —
  the `systemctl --user restart waybar.service` lines and their kin.

**Out:**

- **Provenance comments inside the replacements.** `quickshell/` documents each
  module against the thing it replaced — `// waybar: "battery", format "{icon}
  {capacity}%"`, `// mako: default-timeout=5000`. Those describe live code and
  are the only record of why a value is what it is. They stay. The line to draw
  is code-that-would-have-run versus prose-about-code-that-does: delete the
  first, keep the second.

- **`rofi/` and `hypr/.config/hypr/lua/bindings/old.lua`** — out of scope for
  this earlier cleanup; both were subsequently retired by #118.
- `resources/omarchy/` — upstream's vendored copy of a separate tool.
- The `.scratch/launcher/` tickets and `docs/launcher-spec.md` — the record of
  the migration.

## Non-goals

No behaviour change. Nothing in this effort touches a program that runs;
every deletion targets a file that is already unread or a comment that is
already unexecuted. If a step would change what the theme system emits for a
live target, it is out of scope.

## Constraint

`df-theme-generate` globs `"$TEMPLATE_DIR"/*.tpl`, so removing the
`.tpl.disabled` files cannot change its output. Verify that assumption holds
before deleting, not after.
