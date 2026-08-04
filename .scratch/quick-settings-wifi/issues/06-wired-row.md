# 06 — Wired Row

**What to build:** Ethernet gets its own Row in Quick Settings, appearing only when a cable is connected. The Wi-Fi Row stops standing in for it.

**Blocked by:** 03 — the Page.

**Status:** ready-for-agent

- [ ] A Wired Row appears in Quick Settings when a wired device is connected
- [ ] It disappears when the cable is unplugged
- [ ] It shows a wired glyph, `Wired`, and `Connected`
- [ ] It has no toggle and no Page — it is status only
- [ ] The Wi-Fi Row never displays wired state
- [ ] Both Rows can be visible at once, each showing its own connection

## Why this is a split, not a fallback

Today one Row covers both, falling back to a wired glyph and "Wired" when a
cable is in. Once the glyph is a Wi-Fi control (05), that fallback becomes a
Row that displays one thing and does another — a wired glyph whose click
toggles the Wi-Fi radio.

Splitting keeps each Row's glyph honest about what clicking it does. The Wired
Row has no control at all, which is correct: there is nothing to toggle about a
cable, and plugging it in is the whole interface.

Nothing is lost from the panel — the at-a-glance "am I on the cable?" signal
survives as its own Row, and it now coexists with the Wi-Fi Row rather than
hiding it.

## Manual verification

Host-only. Needs an Ethernet cable or a USB adapter.

```bash
df-qs-restart
```

1. **Unplugged** — open Quick Settings. There is no Wired Row.
2. **Plug in** — a Row reading `Wired · Connected` appears, with a wired glyph.
3. **Both at once** — with the cable in *and* Wi-Fi connected, both Rows show,
   each with its own state. The Wi-Fi Row still shows its SSID and did not
   change to say "Wired".
4. **No control** — clicking the Wired Row does nothing; it has no toggle.
5. **Unplug** — the Row disappears. The Wi-Fi Row is unaffected throughout.

```bash
nmcli -t -f DEVICE,TYPE,STATE device | grep ethernet
```

**Pass:** the Row's presence matches whether this reports `connected`.
