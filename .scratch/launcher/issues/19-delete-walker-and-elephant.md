# 19 — Delete walker and elephant

**What to build:** The contract step. Nothing in daily use needs the old launcher, so it and its configuration leave the repo and the machine.

**Blocked by:** every other ticket — 01 through 18.

**Status:** done — all six checkboxes closed. Four by static audit, the last
two by the user on the Arch host (see **Comments**). `triage-labels.md` has no
role for a completed ticket; the five it lists are all open states.

- [x] No keybind, script or configuration references the old launcher or its provider daemon
- [x] Helper scripts and provider configuration are removed from the repo
- [x] The old launcher's theme template is retired — superseded, see below
- [x] The temporary fallback keybind is removed
- [x] The deliberately dropped Provider is recorded as dropped, so its absence is not read later as an oversight
- [x] Both packages are removed from the package list

## What was done

**Checkbox 4 — the fallback keybind.** `hypr/.config/hypr/lua/bindings/system.lua`
no longer execs walker from any bind: `SUPER + SPACE` is the Launcher's
GlobalShortcut, and the `SUPER + ALT + SPACE` fallback is gone. Note the
fallback never reached a commit — it was added and removed inside this same
uncommitted series, so a diff against `HEAD` shows only `SUPER + SPACE`
changing from `uwsm-app -- walker` to `hl.dsp.global("launcher:toggle")`.
The "Launchers" section is that one bind alone.

**Checkbox 2 — helpers and config removed from the repo** (`git rm`):
- `walker/` and `elephant/` — the stowed configs (walker's `config.toml` and
  theme, elephant's `elephant.toml`, `desktopapplications.toml`, and the
  `menus/*.{toml,lua}` menus, including the four menus ticket 08 ported and
  the `dotfiles_*` menus behind the pickers)
- `bin/df-launch-walker`, `bin/df-dir-picker`, `bin/df-file-picker`,
  `bin/df-screenshot-picker`, `bin/df-screenshot-mark`, `bin/df-screenshot-copy`,
  `bin/df-screenshot-copy-paths`, `bin/df-theme-picker`, `bin/df-theme-bg-picker`
  — every helper whose job was opening a walker menu; the Launcher's
  Directories/Files/Screenshots/Themes/Backgrounds Providers are each that
  script's replacement (the first four were already ported one for one)
- `bin/df-hypr-rename-workspace` — it prompted through `walker -d`, so it dies
  with walker. Its bind (`SUPER + SHIFT + R`) and the `SUPER + SHIFT + P`
  "Scripts" bind (which ran the deleted `bin/walker/execute-command`) are both
  dropped from the "Launchers" section of
  `hypr/.config/hypr/lua/bindings/system.lua`; renaming a workspace is now the
  Launcher's own Workspaces Provider (`launcher/modules/Workspaces.qml`)
- `setup/arch-hyprland/setup-packages/setup-walker` — the only script naming
  `omarchy-walker`. It was already orphaned: nothing in
  `setup/arch-hyprland/init` ran it, so there is no `run_step` to remove and
  `init` is unchanged by this ticket
- `scripts/stow/stow-hyprland` no longer stows `walker` or `elephant`
- `zsh/.zshenv` and `mise/.config/mise/config.toml` no longer put
  `dotfiles/bin/walker` on PATH (that directory was emptied by ticket 16)
- `resources/walker/` and `resources/elephant/` — the vendored upstream
  clones, removed from the machine (they were never tracked; `AGENTS.md` no
  longer lists them)

**Checkbox 3 — the theme template.** `themes/templates/walker.css.tpl` became
`themes/templates/walker.css.tpl.disabled`, the same convention as the retired
mako/swayosd/waybar templates. Nothing generates it; `themes/README.md` no
longer lists it.

**Superseded.** `.scratch/retire-dead-theme-targets/` then deleted all four
`.tpl.disabled` files outright and retired the convention itself, on the
grounds that none of the four programs is coming back. The outcome this
checkbox asserts still holds — the template is retired and nothing generates
`walker.css` — but the mechanism it names no longer exists in the repo.

**Checkbox 1 — nothing references the old launcher.** No keybind, autostart
entry, stow list, PATH entry or setup script names walker or elephant any more:
`hypr/.config/hypr/lua/autostart.lua` no longer starts
`walker --gapplication-service`; `hypr/.config/hypr/lua/windows.lua` dropped a
stale commented walker layer rule; `waybar/.config/waybar/config.jsonc` no
longer carries `elephant menu 'system'`; `scripts/utils/import-omarchy-previews`
documents the Launcher's Themes Provider instead of the walker picker. Where a
comment in the ported Providers names its provenance, the deleted source is
marked "(deleted with ticket 19)" — the same convention ticket 16 used for
`bin/walker/*` — and nothing claims walker/elephant is still a live dependency.

**Checkbox 5 — the dropped Provider is recorded.** `CONTEXT.md` gains a
"Deliberate drops" section naming the symbol picker (the spec's one deliberate
drop) and the dmenu Surface, so their absence reads as a decision.

**Checkbox 6 — both packages.** The only repo mention of `omarchy-walker` was
`setup-walker`, which is deleted; nothing installs it any more. Elephant was
never in a package list at all — it arrived as a dependency of the walker
package. `setup-walker` also installed `libqalculate`, which the Launcher's
calculator still needs; it is already carried (with `cliphist`, which
`setup-walker` never installed) by
`setup/arch-hyprland/packages/quickshell-packages`, so no package move was
needed here.

**Unchanged on purpose.** `resources/omarchy/` keeps its own walker/elephant
configs — that is upstream's vendored copy of a separate tool, not this
dotfiles' configuration. The historical tickets under `.scratch/launcher/` and
`docs/launcher-spec.md` keep their walker/elephant mentions; they are the
record of the migration, not references from anything that runs.

## Manual verification

Repo-side work is done; the machine-side cleanup cannot be done from the
container. Each step is one copy-pasteable block; the expected pass is stated.

**1. The fallback keybind and the walker service are gone from the live
config.** From the Arch host, in the Hyprland session:

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
hyprctl reload
hyprctl binds | rg -i "walker"
pgrep -fa "walker|elephant"
```

**Pass:** the stow run prints no `walker`/`elephant` symlink errors; `hyprctl
binds` prints nothing; `pgrep` prints nothing (the Launcher's own process is
`quickshell -c launcher`, which the pattern does not match).

**2. The old keybind is dead and the Launcher still opens.** Press
**SUPER + ALT + SPACE**, then **SUPER + SPACE**.

**Pass:** SUPER + ALT + SPACE does nothing; SUPER + SPACE opens the Launcher
as before (and the temporary label is gone from the bind list, covered by
step 1). **Closes checkbox 4** for the live session.

**3. The old configs leave the machine.**

```bash
rm -f ~/.config/walker ~/.config/elephant
pacman -Q | rg -i "walker|elephant"
sudo pacman -Rns --noconfirm <the packages the line above lists>
```

**Pass:** the `rm` succeeds (they were stow symlinks); after the uninstall
`pacman -Q | rg -i "walker|elephant"` prints nothing, and the `elephant`
user service (if any) is gone with the package. **Closes checkbox 6** for the
machine.

**4. The Launcher survives the removal** (nothing it launches reached into
the deleted configs — the dir cache path and the `~/.config/theme-previews`
directory are inherited, not owned):

```bash
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, no QML error. Spot-check a few Providers:
type `firefox`, then `=` followed by `2+2`, then `/` for directories, then
`$` for clipboard history.

## Comments

Four of the six checkboxes are closed by static audit (boxes 1, 2, 3, 5 — the
repo no longer contains a keybind, script, config, template or package-list
entry that names the old launcher). Boxes 4 and 6 are the live-machine half of
the same claims: the reloaded Hyprland session and the installed packages.

**2026-08-03 — host verification, reported by the user.** The Manual
verification steps were run on the Arch host and `omarchy-walker` was removed.
**Closes checkboxes 4 and 6**, and with them the ticket.

Recorded as a user-reported pass: the command output was not pasted back, so
this entry rests on the user's report rather than on output anyone re-read.
Noting that because the tracker's normal loop is paste-then-tick, and the
distinction matters if box 4 or 6 is ever re-opened.

Two of the steps were weaker tests by the time they ran, both known in advance:
step 2's `SUPER + ALT + SPACE` fallback never reached a commit, so it was
unbound in any config being reloaded and could only pass; and step 1's stow run
had by then also stopped stowing `waybar`, `mako` and `swayosd`, which
`.scratch/retire-dead-theme-targets/` removed. Step 1's `hyprctl binds` and
`pgrep` checks and step 4's Launcher spot-check are unaffected — those carried
the real weight.

**Follow-on now unblocked.** `setup/arch-devbox/README.md` said the
`omarchy-walker` repo dependency "can go once the machine's packages are
pruned". They are, so it went.
