# 05 — Toggle the radio from the glyph

**What to build:** The Wi-Fi Row's glyph becomes its own click target that switches the radio off and on, while the rest of the row still opens the Page. The Row says what is true when there is no network to name.

**Blocked by:** 03 — the Page.

**Status:** ready-for-agent

- [ ] Clicking the glyph toggles the Wi-Fi radio
- [ ] Clicking anywhere else on the Row still opens the Page
- [ ] The glyph's hit area is noticeably larger than the glyph, with a hover highlight
- [ ] Every other Row in Quick Settings behaves exactly as before
- [ ] The Row shows `Wi-Fi off`, `Disconnected`, `Connecting…`, `Blocked` or `No adapter` when there is no SSID
- [ ] Clicking the name while the radio is off turns it on and opens the Page
- [ ] A hard-blocked radio and a missing adapter dim the Row and ignore both targets

## The shared row chrome changes

The rows in Quick Settings share one chrome component whose single click area
covers the whole row. This adds an **optional** second target on the glyph,
defaulting to off, so no existing Row changes behaviour. That default is the
whole safety of this ticket: Bluetooth, Tailscale, Volume and the five power
rows must be untouched.

The glyph's hit area is padded well beyond the glyph itself and carries a hover
highlight. This is not polish. A bare ~16px target with no affordance, whose
action drops your connection, is a mis-click waiting to happen — the padding
and the highlight are the mitigation for choosing the glyph as the toggle.

## What the Row says

| Condition | Name slot | Row |
| --- | --- | --- |
| connected | the SSID | normal |
| connecting | `Connecting…` | normal |
| radio on, no link | `Disconnected` | normal |
| radio off | `Wi-Fi off` | normal |
| hard-blocked | `Blocked` | dimmed, both targets inert |
| no Wi-Fi adapter | `No adapter` | dimmed, both targets inert |

**Clicking the name while the radio is off turns it on and opens the Page.**
One click, because opening Quick Settings and clicking the network name can
only have meant "get me online".

Hard-blocked is the exception. A physical switch is not something software can
undo, so the Row dims and neither target does anything — a control that
pretends otherwise is a control that lies.

## Manual verification

Host-only.

```bash
df-qs-restart
```

1. **Toggle off** — click the glyph. The radio drops, the Row reads `Wi-Fi off`
   and the glyph changes to the disabled form. Confirm:

```bash
nmcli -f WIFI,WIFI-HW general
```

**Pass:** `WIFI: disabled`, `WIFI-HW: enabled`.

2. **Turn on via the name** — with the radio still off, click the Row's **name**
   (not the glyph). The radio comes back on *and* the Page opens, in one click.
3. **Toggle on via the glyph** — back out, click the glyph. The radio returns
   and the SSID reappears once it reconnects.
4. **Hover** — a highlight appears behind the glyph, noticeably wider than the
   glyph itself.
5. **Other rows unaffected** — click Bluetooth, Tailscale and a power row.
   Each behaves exactly as before, including closing the panel where it used to.
6. **Hard block** — if your laptop has a Wi-Fi key or switch, use it. The Row
   reads `Blocked` and dims; clicking the glyph does nothing.

```bash
rfkill list wifi
```

**Pass:** `Hard blocked: yes`, and the Row says `Blocked` rather than
`Wi-Fi off`.
