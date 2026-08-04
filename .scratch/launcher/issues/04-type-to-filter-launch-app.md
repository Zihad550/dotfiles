# 04 — Type to filter, Enter to launch an application

**What to build:** The first complete path through every layer. Open the Launcher, type a few characters, watch installed applications narrow, press Enter, the application starts. Carries the matching and ranking module and its tests, because this is the ticket that first needs them.

**Blocked by:** 03 — Launcher window opens and dismisses.

**Status:** done — verified on the host.

Unknown 2 in ticket 01 came back **yes**, so this is the small version: `Quickshell.DesktopEntries` supplies names, icon-theme names, `runInTerminal` and an `execute()`, with no hand-rolled `.desktop` parsing.

**Amended after the first host run.** `execute()` exposes `runInTerminal` but does not act on it, and does not expand a shell `~` — so terminal applications and every webapp launched to nothing. Terminal wrapping and argument fixing are the Provider's job, not the API's. Ticket 01's unknown-2 answer is corrected accordingly.

**One constraint from ticket 01, and it is the trap here:** `DesktopEntries.applications` populates **asynchronously** — 0 entries at `Component.onCompleted`, 84 two seconds later. The applications Provider must react to the model changing rather than snapshotting `.values` at startup, and the matching corpus must be re-prepared when it does. Getting this wrong gives an empty Launcher and no error. The array is `.values` (`rowCount()` also works; there is no `.length`).

- [x] Typing narrows a list of installed applications
- [x] Consecutive and word-boundary matches rank above scattered ones
- [x] Enter launches the highlighted application
- [x] Up and Down move the highlight; the list follows
- [x] Matching and ranking live in a module free of QML types, loadable by a standalone runtime
- [x] Tests at that module cover match versus reject, ranking order, bounded top-N agreeing with a full sort, and tie stability
- [x] Only the visible portion of results is rendered, and ranking does not fully sort the whole match set
- [x] Typing does not block the bar, OSD or notification rendering

## Comments

The seam landed early, because it is the only part of this ticket that a
devcontainer can verify and the only part where a bug is invisible in use.

`quickshell/.config/quickshell/launcher/lib/matching.js`, tested by
`tests/launcher/matching.test.js` — 17 tests, `node --test "tests/launcher/*.test.js"`.

The scorer is written fresh, not ported from the benchmark probe in
`quickshell/.config/quickshell/test/shell.qml`. That one ranked `/s/r/c` above
`src` for the query `src`, because three boundary bonuses beat a
three-character run. The fix is that consecutive runs are superlinear
(`8 * runLength`) while a boundary is a flat 6, plus an `indexOf` fast path so
a contiguous hit is scored as one rather than walked greedily. There is a test
naming that exact case, and it fails against the old scorer.

What is verified here, and what is not:

- **Verified**: match versus reject, case-insensitivity, consecutive and
  boundary above scattered, exact-prefix above segment-initials, shorter
  haystack wins ties, bounded top-N equals a stable full sort across ten
  queries and three limits, encounter order preserved on ties, and narrowing a
  previous result set equalling a full scan.
- **Not verified — needs the host**: the timing half of "typing stays
  responsive". The structural half is covered (top-N never sorts the full match
  set, and equals the full sort's first N), but `~/.cache/df-dir-picker/folders.list`
  does not exist in the container and `test/shell.qml` is emphatic that a
  synthetic corpus lies for this scorer.
- **Not verified — needs the host**: that the file imports under QML at all.
  See unknown 3 in ticket 01 and the `launcher-probe` config.

`rank()` already takes a `usage` option so that ticket 07 fills a parameter
rather than reshaping the API these tests are written against. The no-Frecency
and no-Entry-Key paths are tested now; the blend itself is 07's.

### The UI, written second

`launcher/modules/Applications.qml` is the Provider, and
`launcher/modules/Launcher.qml` grew the Query line, the Entries and the
keyboard routing over them. Written from the devcontainer, so nothing that
needs a running instance is ticked.

**The async trap is answered by a binding, not a lifecycle hook.** `catalog` is
a single `readonly property var` that filters `DesktopEntries.applications.values`
and calls `prepare()` in the same expression, so the corpus is re-prepared
whenever the model repopulates. Nothing reads `.values` in
`Component.onCompleted`.

It is *one* property rather than a separate `entries` and `corpus` on purpose:
the indices `rank()` returns are only meaningful against the entry list the
corpus was prepared from, and two bindings off the same model can be observed
half-updated. `results` reads `apps.catalog` exactly once for the same reason.

Decisions worth knowing about, none of them in a checkbox:

- **Matching is on `name` alone.** Folding in the comment or generic name
  inflates the haystack, and `score()`'s length tie-break would start ranking
  verbose entries below terse ones — a regression invisible except as "the
  ordering feels off".
- **Entry Keys are the desktop entry ids**, supplied now. They are stable
  across restarts, which is the condition the spec puts on supplying them, so
  ticket 07 fills the `usage` parameter rather than adding a key source.
- **`noDisplay` entries are filtered.** Implicit in "installed applications".
- **Icons, on the attestation of the bar rather than of ticket 01.** These were
  deferred at first: `IconImage` means importing `Quickshell.Widgets`, and a
  type that does not resolve is a compile error for the whole file, which
  presents as the Launcher silently not opening. But the risk was already
  retired — the bar's `dotfiles/modules/NotificationItem.qml` imports
  `Quickshell.Widgets` and calls `Quickshell.iconPath(name, true)` and
  `IconImage`, and it is running on the host. Same three, same idiom, including
  the second argument that turns a theme miss into an empty string rather than
  a broken image. `Theme.entryIconSize` was already there for it.

  The icon slot is reserved whether or not the icon resolves — an invisible
  Item still anchors — so an application with no icon does not pull its row out
  of line with the rest.
- **`canNarrow`/`narrowFrom` are not wired.** They exist and are tested for
  ticket 12's ~17,000-entry corpus; against ~84 applications they are state
  with nothing to buy.
- **The pointer works: hover tints, click activates.** Not in a checkbox, and
  originally left out on scope grounds — but a launcher where clicking a
  visible Entry does nothing reads as broken, so it went in on request.

  Hover paints its own weaker tint instead of moving `currentIndex`. Moving it
  would let a stationary pointer fight the keyboard: delegates are recreated
  under the cursor on every keystroke, so `entered` fires without the pointer
  going anywhere, and the highlight would jump back under the mouse mid-type.
  Both indicators are visible at once, with the keyboard's the louder, because
  Enter always acts on that one and a click always acts on what was clicked.
  Both go through one `activateEntry()`, so the two input paths cannot drift.
- **Two distinct empty states** — "Waiting for applications…" when the corpus
  itself is empty, "No matches" when the Query matched nothing. On the host
  that is the difference between *the binding never re-evaluated* and *the
  filter is wrong*, which one blank card would hide.

Also added `Theme.muted`, for the placeholder, the rule under the Query line
and the Entry sub-line a later ticket will want.

### One scoring defect, found by review and fixed

`score()` claimed a contiguous hit was always the best path through a haystack
and skipped the scattered walk on that basis. It is not. `"alpha beta"` scores
18 for the query `ab` across its two word initials; the literal `ab` at the end
of `"alpha beta ab"` is worth only 16 — so taking the fast path made an Entry
score *lower* for containing the query outright, and `"alpha beta ab"` ranked
below an Entry containing strictly less.

Fixed by scoring both paths and keeping the better one. The index-0 fast path
survives, because there the contiguous path provably is the best: it holds the
largest position bonus available and its run bonus is quadratic in the needle
while every alternative trades run length for a flat 6 per boundary. That is
the case the fast path was for — typing the start of a name — so the extra walk
only happens on a mid-string hit.

Covered by a seventeenth test. It fails against the old scorer.

**One consequence ticket 12 needs to know about.** The fast path now covers
index-0 hits only, so a mid-string contiguous hit costs an `indexOf` *and* a
scattered walk. Free against ~84 applications. Against the ~17,000-entry
directory corpus it is not — paths hit mid-string constantly, and the incumbent
is already 46–61ms per keystroke. Ticket 12's timing bar must be measured
against this scorer, not against the number in the spec, or the difference will
be rediscovered as a mystery regression.

This is not a regression from the UI work; the module landed earlier in this
same ticket. It is the exact class of bug the seam exists to catch, and it was
invisible in use.

### Three defects in the UI, also from review

- **The card could run off the bottom of a short output.** `Theme.maxHeight`
  bounds the list, not the card; adding the Query line, the rule and the
  padding puts the card's bottom edge past a 768px screen, where a sixth of the
  height is already gone before it starts. `root.listMaxHeight` now bounds the
  list by what is actually left below the card as well as by taste.
- **The highlight could sit scrolled off the top after the Entries *grew*.**
  Resetting `currentIndex` to 0 does not scroll the view back, and backspacing
  after arrowing down is exactly that case. `highlightFirst()` now positions
  the view too — deferred through `Qt.callLater`, because it runs before the
  ListView's model binding has caught up and would otherwise act on the
  previous content.
- **`results` is on CONTEXT.md's avoid-list for Entry.** Renamed to
  `rankedEntries`.

### The launch prefix: decided, `uwsm-app --`

Every launch goes through `uwsm-app --`, which is what elephant autodetects and
prefixes with today, so this is parity rather than a new idea. The application
becomes its own systemd unit under `app.slice` instead of a child of the
Launcher process:

- **It outlives the Launcher.** Without this, `df-qs-restart launcher` takes
  every application started from it down too — several times an hour during
  this rewrite.
- **`app.slice` is scheduled against `session.slice`**, where the compositor
  and the bar live, so a heavy application cannot starve the thing drawing the
  screen. This is resource isolation, not speed: nothing launches faster, but a
  busy application stops making everything else stutter.
- **The OOM killer and `uwsm stop` act on one application** rather than on the
  session.

Cost is a fork, an exec and a D-Bus round trip per launch, paid while the
Launcher is already dismissing — nothing waits on it. That is a different thing
from the per-*open* fork the spec rejects for the keybind, which is on the path
you do wait on.

**The consequence worth noting:** a launch prefix cannot be handed to
`execute()`, so getting one means building the command here for *every* launch,
not just for terminal entries and webapps. `commandOf()` went from a fallback
to load-bearing, which is what makes the `command=` paste-back in step 3b worth
doing rather than optional.

`execute()` survives as a fallback for an entry that yields no command at all —
unscoped, but launching beats doing nothing. It logs a warning when it happens.

**Possibly a simplification later:** `uwsm-app` accepts a desktop entry id
directly (`uwsm-app -- yazi.desktop`) and does its own terminal handling
through `xdg-terminal-exec`. If that works it would subsume the terminal wrap
and the argv building both. Not taken now — it is unverified, and this ticket
has already been bitten twice by assuming an API does something it does not.

### Closed on the host

All eight checkboxes are ticked. The host run also settled the last thing
ticket 01 left open: **`matching.js` does import under QML** — unknown 3's QML
half, which both files here depend on and whose failure would have looked like
the Launcher simply not opening. That unknown is now closed by use rather than
by the probe.

Three defects were found by running it, all fixed and described above: terminal
applications, webapps, and the missing pointer support.

### Two things still unconfirmed, neither blocking

Both are recorded because they are invisible until they bite, not because they
are suspected.

- **The shape of `entry.command`.** `commandOf()` still carries both an array
  branch and a string branch. Launching works, but a one-word `Exec` survives
  either path identically, so "everything launches" does not say which ran. The
  string branch splits on spaces and would mangle a quoted argument. If an
  application with a quoted `Exec` argument ever launches wrong, that is this;
  one `console.log(JSON.stringify(entry.command))` settles it and the dead
  branch can then go.
- **`Path=` / the working directory.** Elephant sets the process's working
  directory from the entry's `Path=`. Now that `execute()` is bypassed for
  every launch, an application declaring one starts wherever the Launcher was,
  and whether Quickshell even exposes the field is unestablished. Nothing in
  daily use has shown it, so it is a known gap rather than a fix.

### One loose end, not touched

`quickshell/.config/quickshell/launcher-probe/` is still stowed. Ticket 01 says
it "goes away with this ticket" — ticket 01, not this one — and it is
harmless while it sits there unstarted. Left alone rather than deleted as a
side effect of 04.

## Manual verification

**Done — all steps passed on the host.** Kept below as the regression pass for
the next ticket that touches the Launcher; tickets 05 and 07 both change what
is in this list and how it is ordered.

The module's own checkboxes are closed by `node` and need no host. The rest are
runtime and did.

**Runs anywhere, including the devcontainer** — the seam, which is where a
wrong ranking hides:

```bash
cd ~/dotfiles && node --test "tests/launcher/*.test.js"
```

**Expected:** 17 pass, 0 fail.

Everything below is on the host.

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
```

**0. Anything at all appears.** Open the Launcher without typing.

**Expected:** the card shows the Query line and a list of every installed
application, each with its icon.

Icons are the one thing here whose API ticket 01 never probed — it is borrowed
from the bar's notification popups. Expect most rows to have one; a few
applications ship no `Icon=` or name one the current icon theme lacks, and
those should show a blank slot with the name still aligned with every other
row, not a broken-image glyph and not a row shifted left.

If it reads **"Waiting for applications…"** and stays that way, the corpus is
empty — either `DesktopEntries` did not populate or the `catalog` binding never
re-evaluated, which is this ticket's named trap. If the Launcher does not open
at all, the config failed to load; `df-qs-restart launcher -l` prints why, and
the first suspect is the `matching.js` import (unknown 3's QML half, still
unverified).

**1. Typing narrows, Enter launches, Up/Down move.** Type a few characters of
an installed application.

**Expected:** the list narrows as you type; Up and Down move the highlight,
wrap at both ends, and the list scrolls to follow; Enter starts the highlighted
application.

Then the case that breaks a launcher quietly: type enough to get ten or so
matches, press Down a few times to highlight something far down, then type one
more character so the list drops to two or three.

**Expected:** the highlight is back on the first Entry and Enter launches
*that*. A stale highlight here launches the wrong application, or nothing.

Then the same thing in the widening direction, which is the one that is easy to
miss: arrow down far enough to scroll the list, then **backspace**.

**Expected:** the view scrolls back to the top with the highlight visible on
it. A highlighted Entry you cannot see is the failure here — Enter would still
launch the right thing, which is what makes it easy to ship.

Finally, type something that matches nothing (`zzzz`).

**Expected:** "No matches", not "Waiting for applications…". The two mean
different things and step 0 depends on telling them apart.

**2. Ranking is sane on the real corpus.** The node tests prove ordering
against fixtures; this is the check that it *feels* right against your actual
installed applications. Type a full application name.

**Expected:** the exact match is first, not something scattered that happens to
contain the same letters. If an obvious exact match ranks below a scattered
one, that is a scoring defect — capture the query and the two entries, it is
reproducible as a node test.

**3. A terminal application launches, and so does a webapp.** Both failed on
the first host run and both are now handled here rather than by `execute()`, so
this step tests our wrap, not Quickshell's.

Launch `yazi` (`Terminal=true`), then any webapp installed by
`df-webapp-install`.

**Expected:** yazi opens inside a `$TERMINAL` window — ghostty unless the
session exports something else — and the webapp opens its browser window.

A terminal application that flashes and vanishes means the wrap did not apply;
a webapp that does nothing at all means the `~` in its `Exec=` line was still
taken literally.

**3b. Nothing launched unscoped.** A search for the fallback firing, which would
mean an Entry launched outside its session scope:

```bash
qs -c launcher log | rg "launching unscoped"
```

**Expected:** nothing.

**3c. Applications are in the session scope, not under the Launcher.** This is
the whole point of the prefix. Launch something, then:

```bash
systemd-cgls --user-unit app.slice | rg -i <the app>
df-qs-restart launcher                 # the app must survive this
```

**Expected:** it appears under `app.slice` as its own unit, and it is still
running after the restart. If instead it dies with the Launcher, the prefix is
not being applied.

**4. Typing does not stall the bar, OSD or notifications.** This is the whole
reason the Launcher is a separate process, so it is worth checking under load
rather than idle. With the Launcher open, in another terminal:

```bash
notify-send "stall check" "the bar clock must keep ticking"
```

Then hold a key down in the Launcher to generate continuous keystrokes, and
watch the bar's clock and the notification animation.

**Expected:** neither hitches. A visible stall would mean the separation is not
doing its job.

**5. Ticket 03 did not regress.** This ticket introduces the first state that
survives an open, so its clearing is worth re-checking. Type a query, press
Escape, reopen.

**Expected:** an empty Query and the full list, not what you last typed.

**5b. The pointer.** Move the mouse over the list, then click an Entry.

**Expected:** the Entry under the pointer takes a faint tint while the
keyboard's highlight keeps its stronger one — both visible at once — and
clicking launches the Entry you clicked, not the highlighted one. Then type
with the pointer resting over the list: the highlight must stay on the best
match and not jump back under the cursor.

**6. The card fits the output.** Only interesting if you have a short screen or
an external monitor at a lower resolution — the list is bounded by the space
left below the card, not only by `Theme.maxHeight`. Open the Launcher with an
empty Query on each output.

**Expected:** the card's bottom edge is on screen with a margin, on every
monitor.

**Not closable yet — this is ticket 12's, not this one's.** The timing bar
against the ~17,000-entry directory corpus needs
`~/.cache/df-dir-picker/folders.list` and the directories Provider. The bar is
the incumbent end to end, not 60fps.

Ticket 05 adds the windows Provider on top of this, which is the first thing
that makes the score pool global rather than one Provider's. Step 2's ranking
check is the one to repeat then: a window and an application competing for the
same query is exactly where a global pool goes wrong.
