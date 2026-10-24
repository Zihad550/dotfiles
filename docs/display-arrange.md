# Display arrange

The Display Arrange overlay shows every enabled monitor as a rectangle in its
current Hyprland layout. Drag one monitor until it sits flush against an edge of
another and release. The drag is only a preview: **Apply** sends the whole
arrangement to Hyprland in one `hyprctl eval`, then automatically saves it to
`~/.config/hypr/display-layouts.json` so `df-hypr-display-layout apply` restores
it at login.

Open it from the Display panel (SUPER+CTRL+D, then **Arrange…**), the
Launcher's display menu (**Layout: Arrange displays**, which toggles it), or
with SUPER+CTRL+SHIFT+D. Esc closes without applying anything.

## Apply

**Apply** is enabled while the preview differs from the layout loaded from
Hyprland, or while a previous save needs to be retried. The chunk is built by
`modules/lib/displayArrange.js` and applied atomically: every monitor gets one `hl.monitor(...)` rule in a single
`hyprctl eval`, so the layout never passes through an overlapping state. If
Hyprland rejects the chunk, its error appears in the status line.

After Hyprland accepts the arrangement, Apply asks
`df-hypr-display-layout current` which variant belongs to the connected display
set and saves the runtime arrangement under that name. When no layout is saved
yet, it uses the variant `arranged`. Because it reuses the resolved name, the
next `df-hypr-display-layout apply` picks the same variant. The status confirms
**Applied and saved as …** only after saving succeeds. If saving fails, the
arrangement remains active for this session and Apply stays available to retry.

`hyprctl reload` returns to the hand-written rules in
`hypr/.config/hypr/lua/monitors.lua` and discards anything that was applied but
not saved.

## Disabled monitors

Only enabled monitors are shown — Hyprland reports stale geometry for disabled
outputs, so arranging them would place them incorrectly. Enable a monitor in the
Display panel first, then reopen Arrange.
