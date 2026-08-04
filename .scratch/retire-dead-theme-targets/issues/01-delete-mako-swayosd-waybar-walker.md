# 01 — Delete mako, swayosd, waybar and walker from the theme system

**What to build:** The whole effort in one pass. The four targets were retired
together and share one convention, so splitting them would mean four passes
over the same files.

**Status:** done — the five repo-side checkboxes are closed by static audit,
the last by the user on the Arch host (see **Comments**). `triage-labels.md`
has no role for a completed ticket; the five it lists are all open states.

- [x] The four `.tpl.disabled` templates are gone, and the convention with them
- [x] The generated per-theme outputs for all four targets are gone
- [x] The dead stow packages `mako/`, `swayosd/`, `waybar/` are gone
- [x] No live file carries commented-out code that would have driven the four
- [x] `df-theme-generate` emits exactly what it did before
- [x] A theme switch on the host still restyles every live target

## What was done

**Checkbox 1 — the templates.** `git rm` of
`themes/templates/{mako.ini,swayosd.css,walker.css,waybar.css}.tpl.disabled`.
`themes/templates/` now holds only the 13 templates that generate.

Two caveats on the `walker.css` one. Against `HEAD` it reads as a deletion of
`themes/templates/walker.css.tpl`, not of a `.tpl.disabled` file — ticket 19
did the rename, and that ticket is itself still uncommitted, so the two show up
in one diff. And because it *was* live at `HEAD`, `df-theme-generate` does emit
one fewer file than it did at `HEAD`: `walker.css`. That is intended across the
two tickets, but see checkbox 5 — this ticket's "no behaviour change" holds
only against the tree it started from, not against `HEAD`.

`themes/README.md`'s tree listing was rebuilt here. Ticket 19 had removed the
`walker.css.tpl` line from it, which happened to be the `└──` terminator, so
the block was left unclosed; it had also drifted from the directory well before
either ticket, missing `bottom.toml.tpl`, `keyboard.rgb.tpl`, `lazygit.yml.tpl`
and `tmux.conf.tpl`. It now lists all 13 and closes properly.

**Checkbox 2 — the generated outputs.** `git rm` of `mako.ini`, `swayosd.css`,
`walker.css` and `waybar.css` from each of the 17 directories under
`themes/.config/themes/` — 68 files. These were the last output of the
templates before they were disabled; nothing has regenerated or read them
since.

**Checkbox 3 — the stow packages.** `git rm -r` of `mako/` (1 file),
`swayosd/` (2) and `waybar/` (8, including `config.jsonc`, `style.css`, the
two theme CSS files, the two `scripts/*.sh` helpers and the two `*.xml` menu
definitions). `scripts/stow/stow-hyprland` had already commented out its
`stow waybar` line and the `mako` `core.ini` symlink block; both are now
deleted rather than commented.

**Checkbox 4 — the comments.** Commented-out code that would have driven the
four targets is removed from ten files:

- `bin/df-theme-set` — three blocks: the `mako` symlink, the `waybar`
  restart, the `mako` service restart
- `bin/df-font-set` — the `swayosd` and `waybar` style-sheet `sed`s and the
  `waybar` service restart
- `bin/df-hypr-audio-switch` — the `swayosd-client` focused-monitor note
- `bin/voxtype/df-voxtype-model` — the `waybar` restart and `df-restart-waybar`
- `hypr/.config/hypr/lua/autostart.lua` — the `mako` and `swayosd-server`
  `exec_on_start` lines
- `hypr/.config/hypr/lua/bindings/utilities.lua` — the four `makoctl` binds
- `hypr/.config/hypr/lua/bindings/media.lua` — the `swayosd-client` note
- `rofi/.config/rofi/scripts/select_theme` — the `waybar` and `mako` restarts
- `scripts/stow/stow-hyprland` — `stow waybar` and the `mako` symlink block
- `setup/arch-hyprland/setup-packages/setup-hyprland` and
  `setup/fedora/hyprland.sh` — the `mako`/`waybar`/`swayosd` package and
  `systemctl enable` blocks

Where a comment carried a fact the surrounding code does not state — that
brightnessctl stays for the backlight, that Quickshell hot-reloads so nothing
needs restarting, that `-5` would parse as an option — the fact survives as a
line that no longer names the dead program.

**What was deliberately kept.** `quickshell/` documents each module against the
thing it replaced (`// waybar: "battery", format "{icon} {capacity}%"`,
`// mako: default-timeout=5000`). Those are prose about live code and the only
record of where a magic number came from; deleting them would cost real
information. `hypr/.config/hypr/lua/bindings/old.lua` is an archive file by
design and is untouched. `voxtype/.config/voxtype/config.toml` mentions Waybar
in upstream's own description of a config option.

**Checkbox 5 — generation is unchanged for every live target.**
`bin/df-theme-generate` globs `"$TEMPLATE_DIR"/*.tpl` (line 100), which never
matched a `.tpl.disabled` file, so removing the three that were already
disabled cannot change its output. `walker.css.tpl` is the exception noted
under checkbox 1: it was live at `HEAD` and its output is gone. Nothing reads
that output — walker is uninstalled — so no live target loses a file.

No live path in `df-theme-set`, `df-theme-generate`, `df-theme-refresh` or
`df-font-set` names any of the four targets, and none symlinks a deleted
generated file.

**Unchanged on purpose.** `rofi/` stays — `hypr/.config/hypr/lua/bindings/apps.lua`
still runs `rofi -show drun`, so only the one commented `mako` line inside
`rofi/.config/rofi/scripts/select_theme` was touched. `resources/omarchy/`
keeps its own waybar and walker configs; that is upstream's vendored copy of a
separate tool.

## Manual verification

Repo-side work is done. The last checkbox needs a Wayland session, which the
container does not have.

**1. Theme generation is byte-identical for the live targets.** `stow-base`
symlinks `~/.config/themes` at `themes/.config/themes` in the repo, so
`df-theme-generate` writes back into the working tree and git is the
comparison — no temp copy needed.

`df-theme-generate` takes exactly one theme name and exits 1 on none, so this
loops rather than calling it bare, and names each failure instead of letting a
non-zero exit pass unnoticed.

```bash
cd ~/dotfiles
for t in themes/.config/themes/*/; do
   name=$(basename "$t")
   df-theme-generate "$name" >/dev/null || echo "FAILED: $name"
done
git status --porcelain themes/.config/themes/ | grep -v '^D '
```

**Pass:** no `FAILED:` line, and the `grep` prints nothing — all 17 themes
regenerated, and the only changes under `themes/.config/themes/` are the 68
staged deletions this ticket made. A `??` or ` M` line means generation is no
longer byte-identical: report it rather than proceeding.

**Trap:** the `grep -v '^D '` is what makes this readable, and it is also what
would hide a regression if the deletions were ever unstaged. If `git status`
shows the 68 files as ` D` (unstaged) rather than `D ` (staged), drop the
`grep` and read the full list.

**2. A theme switch still restyles everything live.**

```bash
df-theme-set gruvbox
df-theme-set catppuccin
```

**Pass:** no error, and the Bar, OSD, notifications, Launcher, terminal and
`btop` all pick up each theme. **Closes checkbox 6.**

**3. Nothing dangles after a restow.**

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
ls -la ~/.config/waybar ~/.config/swayosd ~/.local/share/mako 2>&1
```

**Pass:** the stow run prints no errors; the three `ls` targets are absent, or
are stale symlinks you can delete by hand (they were stowed from packages that
no longer exist).

## Comments

Five of six checkboxes are closed by static audit — the repo no longer
contains a template, generated output, stow package or comment naming mako,
swayosd, waybar or walker outside the exempted paths. Checkbox 6 is the
runtime half: only a real theme switch in a real session can close it.

**2026-08-03 — host verification, reported by the user.** The Manual
verification steps were run on the Arch host and passed. **Closes checkbox 6**,
and with it the ticket.

Recorded as a user-reported pass: the command output was not pasted back, so
this entry rests on the user's report rather than on output anyone re-read.
Step 1 is the one where that matters — it regenerates all 17 themes into the
working tree and its whole signal is what `git status` prints afterwards, so
a silent pass and a real pass look the same from here.

Worth knowing if this is ever revisited: step 1 was rewritten after review
found the original unrunnable. It called `df-theme-generate` bare, which exits
1 on zero arguments; `diff` then compared an untouched tree, printed nothing,
and the block's stated pass was reported. The version that ran loops over every
theme and names each failure.
