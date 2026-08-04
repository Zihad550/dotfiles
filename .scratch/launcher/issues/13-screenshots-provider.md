# 13 — Screenshots Provider

**What to build:** Screenshots picked from a list of names and dates with a live preview of the highlighted one, several selectable at once. The other half of the abstraction stress-test, and the capability that motivated replacing walker.

**Blocked by:** 06 — Core Action vocabulary.

**Status:** done -- all seven checkboxes closed on the host, across two rounds (a grid, then the redesign to a list-plus-preview split -- see **What was built**).

- [x] Screenshots are pickable by name and date, newest first, with a live preview of the highlighted one
- [x] The preview loads without blocking typing, at the current library size
- [x] Primary copies the image; secondary copies the path
- [x] Marking selects several Entries, and the secondary Action applies to all of them
- [x] Marked Entries are visibly distinct from the highlighted one
- [x] Marks vanish when the Launcher closes and can never affect a later session
- [x] Marking is confined to this Provider and cannot span others

## What was built

`lib/screenshots.js` + `tests/launcher/screenshots.test.js` (16 tests, the
pure half: parsing `find`'s output, the Entry shape, and the argv the primary
and secondary Actions run), `modules/Screenshots.qml`, and the wiring in
`modules/Launcher.qml` and `modules/Applications.qml` (the Provider-interface
header, extended for `layout` and the `mark` slot). `lib/actions.js` grew a
fourth Core Action -- `mark`, bound to Tab -- with its own tests in
`tests/launcher/actions.test.js`. 229 tests total,
`node --test "tests/launcher/*.test.js"`, all passing in the container.

### Reached by "#", a decision this ticket left open

The ticket names no prefix and is blocked only by 06, not by 11 the way
directories is. Asked rather than guessed: prefix-routed, the same mechanism
directories uses, kept out of `pool` for a different reason -- a two-column
layout rendered row-for-row inside the default ranked list is not a layout
either was designed to share, not a performance concern the way 17,000 paths
scored on every keystroke is. First built on "!"; moved to "#" on request once
on the host -- both are free in the Quickshell prefix set and in walker's own
(`walker/.config/walker/config.toml`'s `providers.prefixes` claims neither),
so the choice carries no other weight and is a one-line change in
`Screenshots.qml` if it ever needs to move again.

### No Entry Key, on purpose

A screenshot's absolute path is stable across restarts -- CONTEXT.md's own
condition for supplying an Entry Key -- but Frecency has no way to express
"newest", only "most used", and the checkbox is newest-first. Supplying a key
would let copying a screenshot once make it outrank ones taken since, the
moment it was copied twice. `lib/matching.js`'s own comment on `score()`
confirms the mechanism this relies on: an empty Query scores every Entry 0,
so parseListing's own newest-first order survives untouched through a stable
sort, unless Frecency (which never fires here) reorders it. Pinned by
`tests/launcher/screenshots.test.js`'s ordering tests plus the existing
`matching.test.js` coverage of the stable-tie behaviour; not re-tested at the
Launcher.qml seam, which is QML and cannot be loaded under node.

### Marking is Provider state, not shell state

`lib/actions.js` gained a fourth slot rather than a parallel mechanism: `mark`
sits between `secondary` and `back`, chorded to Tab, defaulting to `after:
"stay"` for the same reason `back` does -- toggling a mark is a move within a
Provider's own selection, not a choice of the Entry. Unlike the other three
slots, the shell supplies no `invoke` of its own for it: there is nowhere in
the shell to hold "which Entries are marked" that would not leak between
Providers the moment a second one filled the slot, so `Screenshots.qml` owns
`marked` and its own `toggleMark`, mirroring `Directories.qml`'s `openFor`.
`active`, bound to `root.visible` the same way, is what clears it the instant
the Launcher closes -- structurally the same guard that closed ticket 12's
"dismissing mid-chooser" race, applied here to a selection instead of a
sub-view. This is also the entire mechanism behind checkboxes 6 and 7:
nothing outside `Screenshots.qml` can read or write `marked`, so there is
nothing to confine and nothing to leak.

`docs/launcher-spec.md`'s own problem statement opens with the bug this
replaces: elephant had no concept of Marking, so walker's version
(`bin/df-screenshot-mark`) kept the selection in
`$XDG_RUNTIME_DIR/df-screenshot-marks`, a file nothing owned, which is what
let a mark leak into the next session. There is no runtime file here at all.

### The layout is gated, not generalised

`Applications.qml`'s Provider-interface header now documents an optional
`layout` hint (`"preview"` is the one value defined), and `Launcher.qml`'s
`previewMode` only renders it when `activePool` holds exactly one Provider
asking for it -- never an alternate-layout Entry mixed row-for-row into the
ranked list. The preview split is a sibling `Item` to the existing `ListView`,
mutually exclusive on `visible`, and every place the highlight has to reach
was extended rather than duplicated: `setHighlight`/`applyHighlight` drive
both the main list's and the preview list's `currentIndex` and position
whichever is showing, `reassertView` is unchanged (it already just calls
`applyHighlight`), and the preview split's height is bound by the same
`root.listMaxHeight` the list's is. There is no generic per-Provider delegate
yet -- the preview list's delegate is specific to Screenshots' own Entry
shape, declared inline in `Launcher.qml` the same way the main list delegate
is. Documented in `Applications.qml` as the extension point a second Provider
wanting its own layout would need, rather than built speculatively for one
that does not exist.

Up/Down move the highlight by one Entry, the same as every other Provider --
no special-casing needed, unlike the grid this replaced (see the redesign
note below).

### Redesigned after the first host round: a grid, then a preview split

The first cut of this ticket was a thumbnail grid -- `GridView`, one small
image per cell. It worked (see the host note below), but a filename and a
timestamp under a small thumbnail turned out not to be enough to tell two
similar screenshots apart before committing to Return, which is exactly what
checkbox 1 ("pick by eye") asks for. Requested on the host: a narrow list of
names and dates on the left, paired with one large preview of whichever Entry
is highlighted on the right, so what Return is about to copy is what is on
screen.

Nothing about the Provider changed -- `lib/screenshots.js`'s catalog, the
Actions, and the marking mechanism are exactly what either layout needs, since
none of it assumes a shape for how an Entry is drawn. What changed is entirely
in `Launcher.qml`: `GridView` (`grid`) was replaced by an `Item` (`preview`)
containing a narrow `ListView` (`previewList`, `Theme.previewListWidth` wide,
reusing the row shape and colours the main list's own delegate already uses)
and a `Rectangle` preview pane holding one `Image` bound to
`root.highlightedEntry`. `gridColumns` and the grid-specific Left/Right key
handling were deleted rather than kept dormant -- a single-column list needs
neither, and the tradeoff that came with them (Left/Right stealing the
Query's own cursor movement in grid mode) is gone along with the mechanism
that required it.

This also turned out to be the cheaper design, not just the more legible one:
a grid decodes one thumbnail per visible cell -- dozens at once scrolling
through 700+ screenshots -- where the preview pane decodes exactly one image
at a time, whichever is highlighted. Checkbox 2's "without blocking typing" is
easier to keep true this way.

### Host round one -- one defect, found and fixed

`qs -c launcher log` showed a burst of
`WARN scene: QML Image at @modules/Launcher.qml[1122:29]: Cannot open:
file://undefined` on ordinary startup, before "#" was ever typed. Cause:
`grid`'s (now `previewList`'s) `model` was bound to `root.rankedEntries`
unconditionally. A view's `visible: false` does not stop Qt Quick from
instantiating delegates for layout purposes -- invisible is not the same as
absent -- so every application and window Entry the default pool ranked was
handed to a delegate reading `target.path`, a field only screenshot Entries
have. Fixed by gating the model itself: `model: root.previewMode ?
root.rankedEntries : []`, so the view sees nothing until it is actually the
one showing. `height`, which depended on the same count, was moved onto
`previewList.count` (which tracks the gated model) for the same reason.
Confirmed clean on restart after the fix -- see the log line quoted in the
transcript. No test in `tests/launcher/` could have caught this: it is a fact
about Qt Quick view instantiation, not about `lib/screenshots.js`, and nothing
in this repo's test seam reaches QML construction at all -- the same class of
gap ticket 12's own "Host round one" note names for a different defect.

### Thumbnails, and what could not be checked from here

`asynchronous: true` plus an explicit `sourceSize` bound to
`Theme.previewImageSize` on the single preview `Image` -- both matter: the
first keeps decoding off the thread that reads keystrokes (checkbox 2's
"without blocking typing"), the second keeps a 4K screenshot from being
decoded at 4K just to be shown in a pane a few hundred pixels wide. Whether
this actually feels instant against the real library (732 screenshots,
confirmed on the host) is still a host claim by construction -- there is no
image decoder in the container processing anything at any size.

The listing itself is one `find -L … -printf '%T@\t%p'` run through a
`Quickshell.Io.Process`, the same shape `Calculator.qml`'s `qalc` already
uses -- `stdout`/`stderr` collected via `StdioCollector`, settled from both
`onStreamFinished` and `onExited` because which of the two fires first is not
an assumption this file gets to make, the identical reasoning `Calculator.qml`
states for its own process. Sorting happens in `parseListing`, in pure
JavaScript, rather than in the shell pipeline, specifically so it is
something `tests/launcher/screenshots.test.js` can pin.

### Copying goes through a shell, deliberately

`execDetached` takes an argv and cannot redirect stdin, and both Actions need
to: the primary pipes the file's own bytes to `wl-copy` (`df-screenshot-copy`'s
own approach, typed by `file`'s mime guess rather than the extension), the
secondary pipes newline-joined paths (`df-screenshot-copy-paths`'s own
approach). Both build a `["sh", "-c", <script>, "_", ...args]` argv where
every path travels as its own positional parameter (`"$1"` / `"$@"`) rather
than being interpolated into the script string, so a path carrying a quote,
a space, or anything else a local shell would care about cannot break out of
it. Pinned by `tests/launcher/screenshots.test.js`'s own quoting-focused
cases. **Confirmed on the host**: Return copies the image content (pasted into
an image-capable target), Shift+Return copies the path (pasted into a text
field) -- checkbox 3 is closed.

### Host round two -- the remaining six checkboxes, one pass, no further defects

Reported as a blanket pass rather than pasted per-step output, the same way
ticket 12 closed its own remaining checkboxes: the list-and-preview split
showed newest first with the preview matching the highlight, typing narrowed
it without any felt stall, marking two screenshots showed the border distinct
from the keyboard highlight tint, Shift+Return with marks set copied every
marked path, and marks neither survived a dismissal-without-copying nor
crossed into another Provider. **Checkboxes 1, 2, 4, 5, 6 and 7 closed**,
alongside checkbox 3 above. All seven checkboxes closed; nothing raised since
Host round one's `file://undefined` fix surfaced again.

## Manual verification

Restow and restart before the first one -- confirmed already done once; repeat
if anything below was not already stowed:

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
sleep 2
qs -c launcher log | tail -20
```

**Expected:** no QML error, no `file://undefined` warning, and a line reading
`launcher: screenshots Provider sees N screenshot(s) in
<home>/Pictures/Screenshots`. Paste back anything else and stop.

### 1. The list and preview, newest first

Open the Launcher and type `#`.

**Expected:** a narrow list of screenshot names and dates on the left, and a
large preview of the highlighted one on the right. The topmost row is the
most recently taken screenshot -- take one during this session with
**Print**, retype `#`, and confirm it is now first and its preview matches.

Closes: checkbox 1.

### 2. Typing still filters, and the preview does not stall it

With the list open, type part of a filename or a date fragment.

**Expected:** the list narrows to matching rows and the preview follows the
highlight, with typing itself feeling no different from typing against the
application list -- no dropped keystrokes, no stall while an image decodes.

Closes: checkbox 2.

### 3. ~~Primary copies the image, secondary copies the path~~ -- already confirmed

Already run and passed: Return closes the Launcher and copies the image
content (pastes as an image); Shift+Return closes the Launcher and copies the
absolute path (pastes as text). No further action needed here.

### 4. Marking

Open the list (`#`). Confirm **Up**/**Down** move the highlight by one row
and the preview updates with it.

Highlight two or three screenshots and press **Tab** on each.

**Expected:** each one gains a visible mark (a border around its row) without
losing the highlight tint on whichever one the keyboard is on, and the
footer's hint row includes `tab mark` the whole time a screenshot is
highlighted. The keyboard highlight (background tint) and a mark (border)
must both be visible at once on different rows and be told apart at a glance.

Press **Shift+Return**.

**Expected:** the Launcher closes, and the clipboard holds every marked
path, newline separated -- paste into a text field and count the lines.

Closes: checkboxes 4 and 5.

### 5. Marks never survive a close, and never cross Providers

Mark two or three screenshots, then dismiss the Launcher **without** pressing
Return or Shift+Return -- click outside the card, or Escape.

Reopen and type `#` again.

**Expected:** nothing is marked. This is the check that matters more than it
looks: it is the one case `active`'s guard exists for, and the exact class of
bug (a selection surviving past the session that made it)
`docs/launcher-spec.md`'s problem statement opens with.

Then, with nothing marked, mark one screenshot, leave `#` by deleting it back
to an empty Query (landing on the default pool), retype `#`.

**Expected:** the mark is still there -- leaving the Provider via the Query,
short of closing the Launcher, does not clear it. This is deliberate:
checkbox 6 says "when the Launcher closes", not "when the Query changes", and
if this expectation feels wrong in practice that is a spec question to raise,
not a bug to silently work around here.

Finally, confirm no other Provider shows any sign of a mark -- there is
nothing to toggle on an application or a window row (`mark` is unfilled
there), so this is confined by construction rather than by a check that can
fail at runtime; the manual step is only to confirm Tab does nothing when one
of those is highlighted, the same as any other unfilled slot.

Closes: checkboxes 6 and 7.
