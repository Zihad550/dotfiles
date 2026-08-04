# 03 — Wi-Fi Page lists networks in range

**What to build:** The Wi-Fi Row in Quick Settings shows the network you are actually on, and clicking it replaces the panel's rows with a list of the networks in range. A back arrow returns. Read-only — selecting one does nothing yet (04).

**Blocked by:** 01 — the rename.

**Status:** ready-for-agent

- [ ] The Wi-Fi Row's name slot shows the connected SSID, not the word "Network"
- [ ] Clicking the Row replaces the panel's contents with the network list, in the same window
- [ ] A back arrow returns to the rows, unchanged
- [ ] Each network shows a signal glyph and percentage, and is marked when connected or saved
- [ ] Order is fixed when the Page opens; live signal changes never reorder the list
- [ ] Networks discovered while the Page is open append at the bottom
- [ ] The scanner runs only while the Page is open
- [ ] Opening the Page does not dismiss Quick Settings

## A Page, not a popup

The same `PopupWindow` shows different content — see **Page** in `CONTEXT.md`.
That is what makes this cheap: the focus grab, the reopen guard and the
dismiss path are untouched because there is still exactly one window. The
panel's height already tracks its content, so it resizes to the list for free.

The whole Row is the click target for now. Carving the glyph out as a separate
target is 05, and keeping them together here means this ticket needs no change
to the shared row chrome at all.

The Row must not ask Quick Settings to close, or opening the Page dismisses the
panel it is drawn in. The Tailscale row already opts out this way and its
comment says why.

## Order is frozen, and it is a correctness requirement

Sort once when the Page opens — connected first, then saved, then descending
signal strength — and hold that order until it closes. Networks found while
open append at the bottom rather than inserting.

Signal strength jitters continuously. A live-sorted list swaps rows under the
pointer between aiming and clicking, and the consequence is not cosmetic: it is
joining the wrong network in 04, or typing a password into a field belonging to
a different SSID in 07.

Percentages in the detail slot keep updating live. Text changing moves nothing.

## The scanner

Bind scanning to the Page's own visible state, so no dismiss path — back arrow,
click-outside, gear click — can leave the radio scanning. It is a state held
open, not a one-shot, and a panel that is open for seconds should not leave it
running. NetworkManager's cached results populate the list immediately; fresh
ones append shortly after.

## Manual verification

Host-only.

```bash
df-qs-restart
```

1. **The Row** — open Quick Settings. The Wi-Fi Row shows your SSID and
   percentage, not "Network".
2. **Open** — click it. The panel becomes the network list in place; no
   separate window appears, and it resizes to fit. Quick Settings stays open.
3. **Contents** — the network you are on is marked, saved networks are marked,
   each row has a glyph and a percentage.
4. **Frozen order** — watch for 30 seconds. Percentages change; **no row
   moves**. Any network that appears does so at the bottom.
5. **Back** — the arrow returns to Bluetooth/Tailscale/Volume/power, unchanged.
6. **Scanner off** — with the Page closed but Quick Settings open:

```bash
journalctl --user -u NetworkManager --since "1 min ago" --no-pager | grep -i scan
```

**Pass:** no fresh scan entries while the Page is shut; entries appearing while
it is open.
