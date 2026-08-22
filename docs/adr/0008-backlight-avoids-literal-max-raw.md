# Backlight percent↔raw mapping avoids the literal max raw value

Issue #86: setting brightness to 100% blanks the panel, while the media keys
"fix" it by landing a step or two short of it. This is a known quirk on some
panels — writing the literal max raw backlight value blanks the screen
instead of showing full brightness — not something confirmed on this
hardware (`brightnessctl` finds no backlight device in the container this fix
was written in), so treat the cause as a hypothesis pending host
verification, not a confirmed diagnosis.

**Update (issue #79 host verification):** confirmed on real hardware, and
wider than a single raw unit. On an `amdgpu_bl1` panel (raw max 65535), 98%
(raw 64223 under the original 1-unit cap) displayed fine; 99% (raw 64879) and
100% (raw 65534) both blanked the screen — reproduced with both the media
keys and the Quick Settings slider, so it's the shared mapping, not a
caller-specific bug. A single reserved raw unit isn't enough on this panel;
see the revised `safeMaximum` below.

## Why

**Cap the achievable raw range below the panel's near-max dead zone, not just
the 100% write.** `rawForPercent` is the only path that writes brightness
(media keys via `BacklightService.adjust` and the Quick Settings slider), so
capping its output keeps the unsafe range unreachable regardless of caller.

**`percentForRaw` shares the same capped basis.** An earlier version capped
only `rawForPercent` and left `percentForRaw` dividing by `maximum - 1`. That
mismatch collapses the top of the percent scale onto one raw value on any
panel with a small `maximum` (e.g. 100 or 24): a capped write reads back as
99% or less instead of 100%, and a brightness-down step recomputes the same
capped raw value forever — dead at the top. Both functions now use
`safeMaximum(maximum)` as their 100% raw value, so a write round-trips to the
percent that requested it, and a step down from 100% lands on a strictly
lower raw value (down to the resolution of the panel — see
`backlight.test.js`'s quantization note for the inherent limit on very coarse
panels).

**Degenerate `maximum` (0, 1, 2) still returns something usable.** A one- or
two-level backlight has no room to reserve a raw unit for the cap; those
cases fall through to the pre-existing "always return the one valid raw
value" behavior.

**The margin is a percentage of the range, not a fixed raw unit.** The
original fix reserved exactly one raw unit below `maximum`. Host testing
(#79) showed that undersells the dead zone on panels where it scales with
the range instead of being a fixed few units — `amdgpu_bl1`'s blank zone
covers roughly the top 2% of its 65535-value range. `safeMaximum` now
reserves `round(maximum * 0.03)` raw units (minimum 1, so tiny ranges keep
their original single-unit protection), landing comfortably below the
confirmed-safe boundary with headroom. This is a project-wide constant, not
per-device configuration — see #77's decision against a device chooser — so
it necessarily trades a little top-end range on panels without this quirk
for safety on panels that have it.

## Consequences

- `modules/lib/backlight.js`: `rawForPercent` and `percentForRaw` both route
  through a shared `safeMaximum(maximum)` helper (`maximum` minus a 3%
  margin, floored at 1 raw unit, or `maximum` itself when `maximum <= 1`).
- `backlight.test.js` covers the cap, the round-trip to a displayed 100% on
  small-range panels, that a brightness-down step off 100% always produces a
  lower raw value (at realistic panel resolutions), and a regression test
  pinned to the amdgpu_bl1 numbers above.
- #79's Quick Settings slider inherits this for free: `End` (select maximum)
  goes through the same `rawForPercent`.
- The *reproduction* is host-verified (both the media keys and the Quick
  Settings slider blanked on real hardware). The 3% margin is not: it's
  sized from a single confirmed-safe point (98%) and a single confirmed-bad
  point (99%) on one panel, with no host confirmation yet that it clears the
  dead zone without giving up more usable range than necessary. Still
  pending real-hardware confirmation, same as #86 originally was.
