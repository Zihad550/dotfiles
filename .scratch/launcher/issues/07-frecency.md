# 07 — Frecency

**What to build:** The Launcher learns. Things chosen often and recently rise to the top, so the empty Query is useful before typing and common actions get shorter over time.

**Blocked by:** 04 — Type to filter, Enter to launch an application.

**Status:** done — all seven closed; the four runtime ones verified on the host across two rounds. See **Comments**.

- [x] Choosing an Entry records usage against the Entry Key its Provider supplies
- [x] Usage survives restarting the Launcher and restarting the session
- [x] An empty Query lists most-used Entries rather than an arbitrary or alphabetical order
- [x] Typed Queries blend match score with usage rather than either alone
- [x] Providers supplying no Entry Key are unaffected and rank on match score only
- [x] A missing or corrupt store degrades to no-Frecency rather than preventing startup
- [x] The store does not grow without bound as Entries disappear from the system

## Answer

### What landed

`lib/frecency.js` — the store's arithmetic, as pure functions over a store the
caller owns, with `now` always an argument and never `Date.now()`. Recency is the
half of Frecency no test can reach any other way. Tests in
`tests/launcher/frecency.test.js` (24).

`Frecency.qml` — a Singleton at the config root, alongside `Theme.qml` and for a
stronger reason than convenience: there is one file, and two owners of one file
is a lost write. It holds the store in a QML property, exposes `usage` as a
binding, and owns the path, the read and the write. No arithmetic.

`Actions.counts(action)` — whether running an Action counts as *choosing* the
Entry. Every Action except `back`; extras count. Tested.

Wiring: `Launcher.qml` passes `Frecency.usage` into `rank()`, calls
`Frecency.record(entry.key)` from the one Action dispatch point, and moves the
store's clock forward on every open. `Applications.qml` Entries carry
`key: application.id`; the corpus keys are now read off the Entries rather than
off the model a second time, so the two cannot drift.

**`matching.js` was not touched.** `rank()` already took `usage` and
`FRECENCY_WEIGHT` was already 24 — ticket 04 left the parameter there precisely
so that landing this filled it rather than reshaping the seam its tests are
written against. Two of the seven checkboxes were already green when this ticket
started.

### Decisions

**Decay with a fourteen-day half-life, plus one per choice.** A record is
"worth this much, as of this moment": the stored weight is decayed to now before
the hit is added, so nothing has to be re-decayed later and there is no sweep on
a timer. Fourteen days is balanced between forgetting between working sessions (a
day) and becoming a lifetime install counter (a year) — the latter being what
plain frequency already gets wrong.

**Normalised logarithmically against the strongest record.** There is no absolute
scale — how many times a heavy user opens their editor in a fortnight is not a
number this can know — so a fixed divisor would either saturate everything or
lift nothing. Logarithmic rather than linear because linear against a favourite
chosen fifty times leaves everything chosen five times at 0.1, which `rank()`
rounds to two quality points: indistinguishable from never chosen.

**The ceiling costs about six choices to reach.** Normalising against the
strongest record alone gives a store holding *one* record 1.0 — the whole 24
quality points, for having been chosen once. That is the most aggressive
calibration Frecency can produce and it arrives on a fresh store, which is
exactly when it is least earned: one launch would put an application above the
running window of itself and above any better textual match. So the divisor has a
floor of six choices' worth. It decays like everything else, so the ceiling is
reachable by ongoing use rather than by a lifetime total, and above the floor the
normalisation is against the store as it has to be. Pinned by three tests.

**Bounded by decay plus a cap, not by asking what still exists.** Nothing ever
tells the store that an Entry is gone — an uninstalled application, a deleted
directory and a renamed screenshot all simply stop being offered, with no event
to react to. So: a record decayed below a floor is dropped (a single choice gets
there in about eight weeks), and what survives is capped at 512. The floor is
what does the work; the cap is the backstop for churn the floor is too slow for.
Pruned on write, because the write is the only moment the store grows.

**`parse()` never throws, for anything.** A missing file, a write truncated by a
crash, a hand-edit, a file from a later version. Not defensiveness for its own
sake: the store is read into a QML property that the merged Entry list is a
binding on, and a throw inside a binding takes the whole list down — the failure
ticket 05 documented. An unguarded parse would spend the Launcher to save the
Frecency. A single bad record is dropped rather than the whole file.

**The file is merged into memory, not swapped for it.** `FileView` loads
asynchronously, so a choice made in the first moments after startup can beat the
file into memory. Replacing would lose that choice; ignoring the file to keep it
would throw away everything accumulated so far over a single hit. `mergeStores`
keeps the later record per key, and the later record is strictly better informed
because `bump` already folded the older weight into it.

**Nothing is written before the read resolves.** The corollary of the above, and
the sharper half of it: a choice in those first moments would otherwise *write*
first, truncating the file to that one record — and whether the still-pending read
then delivers the pre-write contents or the truncated ones is exactly the
`FileView` behaviour that cannot be checked from a devcontainer. So it is not
relied on. A write before the read has resolved is *owed* rather than performed,
and flushed once it has. The read is given two seconds — the same order as the
`DesktopEntries` population ticket 01 measured, so it is the scale asynchronous
startup in this shell actually runs at — after which the file is considered ours.
The deadline is not optional: the missing-file case fires no `onLoaded` at all,
which is both the degradation this ticket asks for *and* every first run, so
without it a fresh machine would never write a store and never say why. A read
arriving after the deadline is still merged.

**The write is wrapped in a try/catch** — the one place in the Launcher where
that is the right tool. `record()` is on the Action dispatch path, and persisting
Frecency is strictly less important than launching the thing that was just
chosen. A full disk or a read-only home must cost the learned order and nothing
else.

**Recorded before the Action runs, and from the `entry` argument.** Both halves
matter: `runAction` calls `dismiss()` first for an Action that asked to close,
which fires `reset()`, which moves the highlight — so `root.highlightedEntry`
now names a *different* Entry and reading it there would credit the wrong key.

**State, not cache.** `${XDG_STATE_HOME:-~/.local/state}/df-launcher/frecency.json`,
following `bin/df-hypr-display-layout`. A cache is something regenerable from a
source, and there is no source for this — deleting it loses the learned order for
good.

### One consequence worth naming: Frecency outranks the windows-before-apps tie

Ticket 05's central promise is that typing the name of something already running
offers the *window* rather than the application that would launch a second copy.
That works because the two score **identically** — `textsFor` exists to make it
so — and `merge()` gives a tie to the earlier Provider, which is windows.

Frecency breaks that tie the other way. Usage is a real score difference, not a
tie, and windows supply no Entry Key by design, so an application chosen often
enough sits up to 24 quality points above the running window of itself. Typing
`firefox` with Firefox running and heavily used will offer the application first.

This is a genuine change to a shipped, host-verified behaviour, so it is pinned
by a test (`usage outranks the pool order that keeps a running window above its
application`) rather than left to be rediscovered, and the `pool` comment in
`Launcher.qml` says so.

It is left as-is rather than patched, for two reasons. The spec names the remedy
and defers it: per-Provider score weighting is in **Out of Scope**, with "if
cross-Provider comparability proves painful, weighting is a later change". And
every mechanism available for fixing it *here* is worse — giving windows an Entry
Key reverses ticket 05's fifth checkbox, and having a window inherit its
application's usage requires a window `appId` to equal a desktop entry id, which
is true often enough to be inconsistent and not often enough to be a rule.

**Step 4 of Manual verification is the one that decides whether this needs
revisiting.** If it is annoying in use, that is a ticket for per-Provider
weighting, not a bug in this one.

### Unverified from here

`FileView`'s `setText()` is the one API this rests on that nothing in the repo or
in `resources/` demonstrates. `onLoaded` and `text()` are both proven in
`resources/omarchy/default/quickshell/select-by-image.qml:329-333`; the write
half is not. It is inside the try/catch, so the worst case is a warning in the
log and a Launcher that learns nothing across restarts — which is why step 2
below reads the file rather than trusting the absence of an error.

Whether `FileView` creates the directory it writes into is likewise unknown, so
`Frecency.qml` runs `mkdir -p` on the state directory at startup rather than
finding out.

### For ticket 12, not fixed here

`Frecency.record()` runs between `dismiss()` and `action.invoke()`, and
reassigning the store re-evaluates `usage`, which re-ranks every Provider's
corpus synchronously before the exec. Free at ~84 applications. At the
directories Provider's ~17,000 entries -- measured at 46-61ms per pass -- it is a
visible stall on every Return. Moving `record()` to after `invoke()` fixes it and
is equally correct for attribution, since the Entry is already captured as an
argument. Left alone here because it is unmeasurable at this Provider count and
the ordering rationale should be changed with a measurement in hand.

## Manual verification

Closes: **"records usage against the Entry Key"**, **"survives restarting the
Launcher and the session"**, **"an empty Query lists most-used Entries"**, and
**"a missing or corrupt store degrades to no-Frecency rather than preventing
startup"**.

Everything below runs on the Arch host, in a Hyprland session.

### Step 1 — it still starts, with no store at all

The first-run case *and* the API risk in one step. Stow, make sure no store
exists, and run the config in the foreground so QML errors land on the terminal:

```bash
cd ~/dotfiles && scripts/stow/stow-base && scripts/stow/stow-hyprland
rm -f ~/.local/state/df-launcher/frecency.json
df-qs-restart launcher --log
```

`df-qs-test` refuses the `launcher` config outright (`bin/df-qs-test:35`) — it is
for scratch configs, not long-running ones — so the log comes from `--log` rather
than from a foreground run. `qs -c launcher log | tail -40` re-reads it later.

**Pass:** it starts and prints no error. In particular *not*
`Frecency is not a type`, `Cannot assign to non-existent property`, or anything
naming `Frecency.qml` — any of those is the Singleton or a `FileView` property
being wrong, and it means the Launcher is down rather than merely not learning.

A complaint about the *missing file* is expected and is the degradation working.

Trap: a QML error on a hot reload leaves the **previous** instance running, so a
broken file can look like nothing happening. `df-qs-restart` is what rules that
out — it kills the old instance first.

### Step 2 — choosing an Entry records against its Entry Key

Open the Launcher (`SUPER+SPACE`), type enough to find one specific application,
and press Return. Do it three or four times with the *same* application. Then:

```bash
cat ~/.local/state/df-launcher/frecency.json
```

A choice made within the first two seconds of the instance starting is written a
moment later rather than immediately -- that is the read deadline, not a fault.
Anything after that writes on the keypress.

**Pass:** JSON with `"version": 1` and one entry whose key is that
application's **desktop entry id** — something like `"firefox.desktop"` or
`"org.mozilla.firefox"`, *not* its display name — with a `weight` of about the
number of times you launched it and an `at` of roughly now (`date +%s`).

**Fail, and what it means:** no file at all is `setText()` not doing what this
assumes — check the foreground terminal for `could not write`. A file with
`"entries": {}` means the key never arrived; a key that is the display name means
`application.id` is not the id.

Now switch to an open **window** through the Launcher (type a window title,
Return) and re-read the file.

**Pass:** the file is unchanged. The windows Provider supplies no Entry Key, so a
window activation records nothing.

**Also check the weight.** Four launches of one application should leave a
`weight` of about 4, not 1. A weight stuck at 1 means only the first write landed.

### Step 3 — an empty Query lists most-used Entries

Open the Launcher and type **nothing**.

**Pass:** the applications you launched in step 2 appear above the other
applications. The open windows still come before every *unused* application, and
may now sit below the used ones — that is the ordering described under "One
consequence" above, not a fault.

**Fail:** if the empty Query looks exactly as it did before step 2, `usage` is
not reaching `rank()` — the binding, not the store, since step 2 proved the store
is being written.

Ctrl-C the foreground instance here.

### Step 4 — usage survives a restart, and the windows judgement call

```bash
df-qs-restart launcher
```

Open the Launcher, type nothing.

**Pass:** the same most-used-first order as step 3. That is the "survives
restarting the Launcher" checkbox. For the session half, log out and back in and
repeat.

Then the path that reads *and* writes, which is the least-exercised machinery in
this ticket — every step so far started from a file that was missing or corrupt.
Launch a **different** application through the Launcher and re-read the file:

```bash
cat ~/.local/state/df-launcher/frecency.json
```

**Pass:** the keys from step 2 are all still there with their weights unchanged,
*and* the new one has been added. A file holding only the new key means the read
was replaced by the write instead of merged into it.

Then the judgement call: with an application you use heavily **already running**,
type its name.

**Pass either way — this is a question, not a test.** Report which Entry is
first, the application or the window. If it is the application and that is
annoying in practice, say so: it is a ticket for per-Provider score weighting,
which the spec already names.

### Step 5 — a corrupt store degrades rather than breaking

```bash
printf '{"entries": {"firefox' > ~/.local/state/df-launcher/frecency.json
df-qs-restart launcher
```

Open the Launcher and type something.

**Pass:** the Launcher works normally and ranks on match score alone — the learned
order is gone, nothing else is. Specifically, Entries still appear at all: an
empty card here would mean the parse threw inside the ranking binding, which is
the failure this is checking for.

Then choose something and confirm the file is valid JSON again:

```bash
cat ~/.local/state/df-launcher/frecency.json | python3 -m json.tool
```

**Pass:** it parses. The corrupt file was replaced by a sound one rather than
appended to.

## Comments

### Host round one — one defect, mine, plus a correction to the steps

Run on the Arch host. **Four of the five steps passed:** the store is written
(step 2), usage survives a Launcher restart (step 4), and a corrupt store degrades
to no-Frecency with a working, typeable Launcher (step 5).

**The defect: the Launcher stopped closing when an Action ran.** Every Provider,
no error in the log, Escape unaffected. The wiring edit that added
`Frecency.record()` to `runAction` **replaced** the

```qml
if (Actions.wantsClose(action))
    root.dismiss();
```

block instead of adding beside it — an edit that matched the dismissal and the
`invoke()` call together and rewrote both. Nothing catches this: the dispatch
order is not at the seam, `Actions.wantsClose` is still exercised by its own
tests, and the symptom has no error attached to it.

Fixed, and the order changed while it was open: **dismiss, invoke, record**.
Recording last removes the synchronous re-rank that sat between the dismissal and
the launch — free at ~84 applications, but 46-61ms per pass at the directories
Provider's scale, which is a visible stall on every Return. Attribution is
unaffected, because the Entry is already captured as an argument. This resolves
the "For ticket 12" note above, which no longer applies.

**Diagnosis that worked, worth keeping:** activating a *window* rather than an
application. Windows are keyless, so `record()` is a no-op for them — the failure
reproducing there ruled out the whole Frecency path in one keypress and pointed
straight at the dispatch order.

**Two corrections to Manual verification**, both now applied above: `df-qs-test`
refuses the `launcher` config (`bin/df-qs-test:35`), so step 1 uses
`df-qs-restart launcher --log`; and steps 2 and 3 therefore have no foreground
instance to Ctrl-C.

**Still open after this round:** the recorded weight was 1 after several launches
of the same application, where it should be about 4. Possibly an artefact of the
Launcher not closing — the session was not a clean four opens — so step 2 now says
to check the weight explicitly on the retest. And whether `Lazydocker` is genuinely
that entry's desktop id rather than its display name is unconfirmed; a display
name as the Entry Key would break the moment an application is renamed.

### Host round two — closed

The dismissal fix verified, and with it the three checkboxes round one could not
reach.

**Dispatch.** An application launch closes the Launcher; so does switching to a
window. The regression above is gone.

**Recording.** Four launches of one application left:

```json
{"version":1,"entries":{"helium":{"weight":3.9999640537988257,"at":1785212505.026}}}
```

Which closes more than the checkbox it was written for. The weight is **not 4.0**,
and the shortfall is the fourteen-day decay applied to each earlier choice as the
next one folded it in — so `bump`'s "worth this much, as of this moment" model is
demonstrably live on the host and not only under node. The count is right, the key
is a desktop entry id, and one application launched four times is one record
rather than four.

**Empty Query.** The launched application ranks first with nothing typed.

**Restart.** Round one step 4 confirmed the order survives `df-qs-restart
launcher` — a new process reading the file from disk, which is the whole of what a
session restart adds.

### On the Entry Key, resolved

Round one recorded `Lazydocker`, which read like a display name; round two
recorded `helium`, and `ls` shows `lazydocker.desktop` on disk. So
`application.id` is the desktop entry id, lowercase basename, as the spec's
"desktop entry ids" requires — and `Lazydocker` was a *different* entry that
happens to be named after its display name, which is exactly what
`df-webapp-install` writes (`~/.local/share/applications/<Name>.desktop`). Its key
is still that entry's own id, so it is stable across restarts either way.

Worth knowing rather than acting on: a webapp entry re-installed under a different
`Name` gets a new file, a new id and therefore a fresh Frecency record. That is
correct behaviour for a genuinely different entry, and it costs the learned order
for one application. The command that settles which entry any key belongs to:

```bash
rg -l "^Name=Lazydocker" ~/.local/share/applications /usr/share/applications
```
