# 20 — An exact name match outranks a window

**What to build:** Typing the whole name of a thing offers the thing itself
first. Today it offers a window that merely knows the word.

**Blocked by:** None — 05 and 07 are done and this changes what they decided.

**Status:** done — all four checkboxes closed. Reopened and re-closed by the
review round of 2026-08-01, which found three Providers listing their texts in
the wrong order and one overstated claim in checkbox 4; both are fixed and the
checkbox now says what holds. The host re-ran steps 1–4 and 6; step 5 stays
closed by test, as that step itself allows.

- [x] Typing an application's whole name offers the application above a running window of it
- [x] A Query short of the whole name still offers the running window first
- [x] A keyword or an id an Entry merely carries does not count as its name
- [x] Frecency outranks it once an Entry is actually a habit, so a rule added after ticket 07 does not reverse it — see **The frecency boundary** below for where "actually a habit" starts, which is not "chosen at all"

## Where this came from

Raised on the host during ticket 09's verification round: typing `zed` offered
the running Zed window above the Zed application, and the application was what
was wanted.

Not a fault in either Provider — both were doing what they were built to do.
The application's corpus is one text, its own name, `Zed`. A window's is three
(`lib/windows.js`): its title, its application id, and the short id — for
`dev.zed.Zed`, the text `Zed`. So `zed` is an exact match against both, they
score identically, and `merge()` gives a tie to the earlier Provider. Windows are
first in the pool, by ticket 05's decision, so the window won.

What the tie missed is that only one of the two is *named* Zed. The other is
called `dotfiles — Zed` and merely contains the word.

## The rule

An exact match against an Entry's **own name** — its first corpus text — is worth
`EXACT_WEIGHT` quality points, on top of what it already scores. Both halves are
load-bearing:

- **Exactness, not a Provider weighting.** The spec's named remedy for this was
  "per-Provider score weighting", which would put applications above windows for
  *every* Query. That is a bigger change than the case needs: typing `ze` should
  still offer what is already open, and it does.
- **The name, not any text.** A window's short application id, a menu entry's
  keyword and a desktop entry's id are ways *in*, not what the Entry is called.
  Counting them would make every alias in the corpus rank as though it were a
  name, which is the same tie one level down.

The name is a Provider's **first** corpus text, which makes text order load-bearing
in every `textsFor` in `lib/`. Three of them had it backwards — `themes.js`,
`backgrounds.js` and `providerlist.js` each listed the raw slug before the
formatted display name, so typing `Rose Pine`, the string the row actually
shows, earned nothing while `rose-pine` did. All three now put the display name
first, asserted in each Provider's own tests because a lib module cannot import
another (see `lib/files.js`) and so nothing central can enforce it. That every
other Provider is correct by authorship rather than by construction is
**ticket 23**, opened off this ticket's review round.

`EXACT_WEIGHT` is 12, deliberately below `FRECENCY_WEIGHT`'s 24. An exact name
settles a tie and beats a lightly-used competitor; it does not beat a habit, so
ticket 07's promise — the things chosen most often rise to the top — is not
quietly reversed by a rule added after it.

### The frecency boundary

"12 is below 24" is not by itself the promise that a habit wins, and the first
draft of this ticket read it as though it were. What `rank()` adds is
`round(usage * 24)`, and `usage` is a normalised `[0, 1]` rather than a count:
`usageOf` divides by a `CEILING_AT` floor of six choices, so **being the
most-used Entry in a store is worth about 0.36 — 9 quality points — until it has
been chosen roughly twice.** Below that, an exact name on something else wins.

That is the right place for the line rather than a leak, and `CEILING_AT`'s own
note in `lib/frecency.js` already argued for it: it exists so that "one launch
would put an application above the running window of itself" cannot happen. A
single choice is exactly the calibration frecency deliberately distrusts.

No value of `EXACT_WEIGHT` above 0 makes the stronger reading true, either — a
store whose strongest record has decayed near the floor scores its most-used
Entry 1 point — so the checkbox says what holds. Three tests in
`tests/launcher/matching.test.js` pin it: the ceiling case, the
`EXACT_WEIGHT/FRECENCY_WEIGHT` boundary, and where that boundary falls when the
usage number comes from a real store rather than a chosen constant.

## What this reverses

**Ticket 05 pinned the opposite for the case it was built around**, and that test
now asserts the new ordering with the reversal spelled out in it: typing
`firefox` puts the Firefox *application* above the running Firefox window, so
Return launches a second copy rather than switching to the one that is open.
Ticket 05's own words were "otherwise Enter launches a second copy, which is
exactly what the Launcher is supposed to stop".

That was a sound decision on paper and it is being changed on the strength of
use. What it costs is one row of travel: the window is directly below the
application, so switching is Return after one Down rather than Return. What it
buys is that typing something's whole name reaches the thing with that name. The
narrowing to *exact* Queries is what keeps the original intent alive everywhere
short of that — `firef` still offers the window first, and so does every partial
Query anyone actually types when they mean "the one I have open".

If it proves wrong in use, the smallest correction is to make `EXACT_WEIGHT` 0
in `lib/matching.js`, which restores ticket 05's ordering exactly and leaves
every test in the suite naming what changed.

## Manual verification

Closes all four checkboxes.

Everything below runs on the Arch host, in a Hyprland session, with Zed and a
browser open.

### Step 1 — it still starts

```bash
cd ~/dotfiles && scripts/stow/stow-base && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, no QML error. `lib/matching.js` is imported by
every Provider, so a fault here takes the whole list down rather than one row.

### Step 2 — the case this exists for

With Zed open, type `zed`.

**Pass:** the **Zed application** is first, the running Zed window directly below
it. **Closes checkbox 1.**

Then delete one character, leaving `ze`.

**Pass:** the **window** is first again. **Closes checkbox 2.**

### Step 3 — the reversal, in the case ticket 05 argued

With a browser open, type its whole name (`firefox`, `helium`, whichever is
running).

**Pass:** the application first, the window second. This is the behaviour change
to judge — if reaching an open browser by typing its full name is worse than
launching a fresh one, say so and this ticket is the thing to revert, not
ticket 05.

### Step 4 — a keyword is still not a name

Type `logout`.

**Pass:** `Relaunch` — the entry that carries `logout` as a keyword — appears as
it did before, and is *not* pushed above an Entry actually named for the Query.
There is no entry named `logout`, so what this is really checking is that nothing
moved. **Closes checkbox 3.**

### Step 5 — a habit still wins

Pick an application you launch constantly whose name *contains* another
application's whole name, if you have one — otherwise this is closed by the test
`a heavily used Entry still outranks an exact match on another` in
`tests/launcher/matching.test.js` and can be skipped here.

**Pass:** the one you always launch is still first. **Closes checkbox 4.**

### Step 6 — a theme is named by what its row says

Type a two-word theme name as displayed, e.g. `rose pine`.

**Pass:** that theme is first. This is the fix to the three Providers that had
their corpus texts the wrong way round; before it, only `rose-pine` scored as a
name.

## Found during this round: the preview split collapsed

Not a ranking bug and not this ticket's subject, but found by step 6 and fixed
alongside it, so it is recorded here rather than nowhere. It belongs to the
preview split of tickets 13 and 18; move it there if that reads better.

Narrowing a preview Provider's list to a single match shrank the whole card to
one row tall, and the preview image shrank with it — worst exactly when you had
finally isolated the picture you were looking for. Three bindings were chained
in `modules/Launcher.qml`:

```
preview.height     <- previewList.height <- min(count * entryHeight, listMaxHeight)
previewPane.height <- previewList.height <- ditto
```

The split now takes `root.listMaxHeight` directly, and `previewPane` follows the
split rather than the list, so the image keeps its size as the Query narrows.
`previewList` still sizes to its content, so the names column ends after the
last name and the leftover space falls below it instead of stretching the rows.
The ordinary `list` is untouched — growing and shrinking with its Entries is
right there.

No new binding-loop risk: `listMaxHeight` was already upstream of these heights
by way of `previewList`, so the proof written at `Launcher.qml:422` still holds.

Verified on the host, 2026-08-01. One thing deliberately left:
`Theme.previewImageSize` decodes at 480 while the pane can now be 560 tall, so a
tall image may upscale slightly. That was already true whenever several Entries
matched; the fix makes it the common case rather than the wide one, and it
looked right in use.
