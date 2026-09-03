# Calendar Panel host verification

Run these steps from a terminal inside the active Hyprland session. The source
tests cannot prove window placement, pointer delivery, focus, or live theme
updates without that session.

## 1. Load the changed config

```bash
set -eu
cd "$HOME/dotfiles"
test -n "${WAYLAND_DISPLAY:-}"
command -v quickshell hyprctl >/dev/null
bin/df-qs-load-check
```

Pass: the command prints `PASS: Quickshell loaded`. If it prints
`UNAVAILABLE:`, record that result and continue with the checks that the host
supports. It must never report a pass without a Quickshell load.

## 2. Appearance and pointer interaction

```bash
set -eu
cd "$HOME/dotfiles"
bin/df-qs-restart dotfiles
# Click the center clock with the left button.
# Move over the previous-month, next-month, and week-start controls.
```

Pass: the Calendar Panel appears below the clock, uses the active Bar colors,
and each hovered control shows its hover state. A right or middle click does
not open it. Clicking a day cell does not change the month or selection.

## 3. Keyboard and focus behavior

```bash
set -eu
cd "$HOME/dotfiles"
# With the Calendar Panel open, press Left, Right, Up, Down, T, and W.
# Press Escape, then click the clock once more.
```

Pass: Left and Right change month, Up and Down change year, T returns to the
current month, and W changes the shared week-start order. Escape closes the
panel. The next single click opens it once and the panel accepts keys without
an extra click to establish focus.

## 4. Panel exclusivity and outside-click dismissal

```bash
set -eu
cd "$HOME/dotfiles"
# Open Calendar from the clock.
# Click the Status Cluster.
# Open Quick Settings, click the clock, then open Quick Settings again.
# With either panel open, click an unrelated application window once.
```

Pass: opening one Bar panel closes the other, never leaves both surfaces open,
and never leaves focus split between them. An outside click closes the panel;
the click does not reopen it through the Bar item underneath.

## 5. Midnight update

```bash
set -eu
cd "$HOME/dotfiles"
date
# Open Calendar before local midnight and leave it open across midnight.
# After the minute changes, inspect the highlighted day and year-progress bar.
```

Pass: without reopening, the today marker moves to the new date, the month
changes when midnight crosses a month boundary, and year progress advances.
If the view was browsing another month, that browse position stays intact while
the today marker and progress still update.

## 6. Live theme update

```bash
set -eu
cd "$HOME/dotfiles"
test -L "$HOME/.config/theme"
old_theme=$(basename "$(readlink "$HOME/.config/theme")")
trap 'bin/df-theme-set "$old_theme" >/dev/null 2>&1 || true' EXIT
bin/df-theme-set catppuccin-latte
# Leave Calendar or Quick Settings open while the theme switch completes.
sleep 1
```

Pass: the open panel changes its background, text, and visible semantic colors
with the Bar, without closing or restarting. The trap restores the theme when
the block exits.

## 7. Multi-monitor anchoring

```bash
set -eu
cd "$HOME/dotfiles"
hyprctl monitors -j
# On each listed monitor, click that monitor's center clock.
# Move the panel across the boundary between monitors.
```

Pass: each click opens a panel on the same monitor as its clock. The panel does
not jump to the focused monitor or another Bar, and its constrained edge stays
inside the monitor that owns the clock.

## 8. Constrained-display case

```bash
set -eu
cd "$HOME/dotfiles"
hyprctl monitors -j
# Temporarily select the smallest usable mode for one connected monitor in the
# host's display settings, then click that monitor's clock and Status Cluster.
# Restore the previous display mode after observing both panels.
```

Pass: both panels remain within that monitor's usable area. Content that does
not fit remains reachable by vertical or horizontal scrolling, and no popup is
cut off or placed on a different display.

## needs-info action

Add the waiting label before handing these steps to the host. Keep the host
checkboxes open until the report arrives. Paste the command output and pass or
fail result for each step into issue #148.

```bash
gh issue edit 148 --add-label needs-info
```
