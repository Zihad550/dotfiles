# Backlight percent↔raw mapping avoids the literal max raw value

Issue #86: setting brightness to 100% blanks the panel, while the media keys
"fix" it by landing a step or two short of it. This is a known quirk on some
panels — writing the literal max raw backlight value blanks the screen
instead of showing full brightness — not something confirmed on this
hardware (`brightnessctl` finds no backlight device in the container this fix
was written in), so treat the cause as a hypothesis pending host
verification, not a confirmed diagnosis.

## Why

**Cap the achievable raw range at `maximum - 1`, not just the 100% write.**
`rawForPercent` is the only path that writes brightness (media keys via
`BacklightService.adjust`, and eventually the Quick Settings slider in #79),
so capping its output keeps the literal max raw value unreachable regardless
of caller.

**`percentForRaw` shares the same capped basis, not `maximum - 1`.** An
earlier version of this fix capped only `rawForPercent` and left
`percentForRaw` dividing by `maximum - 1`. That mismatch collapses the top of
the percent scale onto one raw value on any panel with a small `maximum`
(e.g. 100 or 24): a capped write reads back as 99% or less instead of 100%,
and a brightness-down step recomputes the same capped raw value forever —
dead at the top. Both functions now use `maximum - 1` as their 100% raw
value, so a write always round-trips to the percent that requested it, and a
step down from 100% always lands on a strictly lower raw value (down to the
resolution of the panel — see `backlight.test.js`'s quantization note for the
inherent limit on very coarse panels).

**Degenerate `maximum` (0, 1, 2) still returns something usable.** A one- or
two-level backlight has no room to reserve a raw unit for the cap; those
cases fall through to the pre-existing "always return the one valid raw
value" behavior.

## Consequences

- `modules/lib/backlight.js`: `rawForPercent` and `percentForRaw` both route
  through a shared `safeMaximum(maximum)` helper (`maximum - 1`, or
  `maximum` itself when `maximum <= 1`).
- `backlight.test.js` covers the cap, the round-trip to a displayed 100% on
  small-range panels, and that a brightness-down step off 100% always
  produces a lower raw value (at realistic panel resolutions).
- #79's Quick Settings slider inherits this for free: `End` (select maximum)
  goes through the same `rawForPercent`.
- Still open: host verification that this actually fixes the reported
  blanking (issue #86's acceptance is pending real hardware confirmation).
