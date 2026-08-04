# 05 — Windows Provider

**What to build:** Type the name of something already running and switch to it instead of launching a second copy.

**Blocked by:** 04 — Type to filter, Enter to launch an application.

**Status:** done — all five checkboxes closed, the four runtime ones verified on the host across steps 1–4 of **Manual verification**.

Three things carry forward from it. `Applications.qml` is the shape a Provider
currently has — a `catalog` binding of `{ entries, corpus }` plus an
`activate()` — but deliberately not a general interface, because this is the
second Provider that gets to say what the interface should be. The score pool
becomes global here for the first time, so `rankedEntries` in `Launcher.qml`
has to merge two catalogs rather than read one. And `rank()` already handles a
Provider supplying no Entry Key, which is this one — window identity does not
survive a relaunch, so it opts out and ranks on match score alone.

- [x] Open windows appear as Entries, matchable by title and by application
- [x] Activating an Entry focuses that window, including on another workspace
- [x] The list reflects windows opening and closing without restarting the Launcher
- [x] Special and scratchpad workspaces are handled rather than silently missing
- [x] The Provider declares no Entry Key, since window identity does not survive a relaunch

## Comments

Written from the devcontainer, and closed from the host. The first four
checkboxes all describe something running; they are ticked on steps 1–4 of
**Manual verification** passing on the Arch host — windows listed above the
applications and matchable by title and by application, Enter focusing a window
on another workspace, the list following windows opening and closing without a
restart, and a hidden `special:note` scratchpad both listed and focusable. The
fifth is not a runtime claim — it is what the Provider passes to `prepare()`,
`null` where the applications Provider passes desktop entry ids (`Windows.qml`,
the `corpus:` line) — so it was closed by inspection rather than left open on a
technicality.

Step 1 took four host rounds, all of them spent on one defect that had nothing
to do with the Provider. That is the section worth reading if you are here for
anything other than the Provider itself.

### What the Provider is built on, and why that choice is defensible from here

`Hyprland.toplevels` for the list, `toplevel.wayland.activate()` for the Action.

The activation half is the one that matters and it is settled from primary
sources rather than assumed. `wayland.activate()` is the
`zwlr_foreign_toplevel_handle_v1` `activate` request; Hyprland answers it with
`CWindow::activate(true)`
(`resources/Hyprland/src/protocols/ForeignToplevelWlr.cpp:31`), which reaches
`CFocusState::rawWindowFocus`, which has an explicit branch for a window whose
workspace is not visible (`src/desktop/state/FocusState.cpp:163`) — and inside
that branch, an explicit case for a special workspace, which it opens on the
current monitor (`:167`). So "focuses it, including on another
workspace" and the special-workspace case are the compositor's own code, not
something built here. Handles are created for every mapped window regardless of
workspace (`windowValidForForeign` is `validMapped && !isX11OverrideRedirect`),
so scratchpad windows are in the list rather than silently missing. This is also
the protocol elephant's own windows Provider uses.

`hyprctl dispatch focuswindow` is deliberately **not** the fallback: ticket 01
established that this machine runs Hyprland's Lua config, where hyprctl
evaluates its argument as Lua and a bare dispatcher string is a syntax error.
`bin/df-launch-special-app` carries the same scar tissue.

**The listing half is the unverified one, and it is written to fail softly.**
Nothing in `Windows.qml` names a Hyprland or Wayland *type* — every access is a
`var` binding with optional chaining and a `lastIpcObject` fallback. A type name
that does not resolve is a compile error for the whole file, which presents as
the Launcher silently not opening; ticket 04 nearly paid that price over
`IconImage`. Written this way, the worst case is a Provider that contributes no
Entries.

That claim had one hole, found in review: a renamed `values` would throw inside
the catalog binding, leave `catalog` undefined, and take the *whole* merged list
down with it — applications included — which is worse than the failure being
guarded against. Closing it with `Array.isArray` is what then cost two host
rounds; see below. The check is now on `length`, which is the property actually
being relied on.

Which creates its own trap — an empty list means "nothing is open" *and* "the
property name is wrong" — so the Provider says which, in two log lines: one at
startup naming whether `Hyprland.toplevels` resolved at all, and one on every
change of the window *count* (not on every re-evaluation; a browser retitling
itself would otherwise fill the log). Step 0 of the verification block is
reading them.

### The thing that decides whether this feature works at all

A window's title is long ("05 — Windows Provider — Zed"); an application's name
is short ("Zed"). `score()` ends in a length tie-break, so scored naively a
window ranks *below* the application that would launch a second copy of it —
which is the exact outcome this Provider exists to prevent, and it would read as
a preference rather than as a fault.

So a window gets three corpus texts, scored separately and collapsed back to one
Entry, never concatenated into one haystack:

- its title,
- its application id (`org.mozilla.firefox`),
- and the last segment of that id (`firefox`).

Elephant scores the same first two separately and keeps the better
(`internal/providers/windows/setup.go:207`). The third text is ours, and it is
what delivers the ticket's promise: typing `firefox` scores the text `firefox`
exactly as it scores the application named `Firefox`, and the pool order —
**windows before applications** — puts the running window on top. That pool
order is now load-bearing rather than incidental, and it is also the entire
ordering for an empty Query, where everything scores 0 until Frecency lands in
ticket 07.

### The seam grew two functions and a second file

`matching.js` gained the two pure pieces this ticket needs:

- **`collapse(corpus, result)`** — corpus texts back to Entries, keeping each
  Entry's best text. Inert for a corpus prepared without `owners`, so the
  applications Provider is unaffected. `prepare()` takes `owners` as a third
  argument.
- **`merge(results, limit)`** — the global score pool: several Providers'
  rankings interleaved on raw score, ties going to the earlier Provider. Sound
  because there is one scorer and one scale, which is what the spec's "global
  score pool" assumes.

And a second module, `lib/windows.js`, holds the Provider's pure half —
`nameFor`, `textsFor`, `subtextFor`, and `catalogOf`, which assembles the whole
catalog from what the compositor reported. It is split out for the same reason
`matching.js` is: the ranking claim above lives in *which strings a window is
matched against*, and in use a wrong answer there looks like a preference.
`Windows.qml`'s binding is now three defensive field reads and a call to it, and
`tests/launcher/windows.test.js` calls the same function rather than
reimplementing the loop — a test that hand-copies what it checks passes happily
while the QML drifts away from it. "A running window outranks the application
that would launch another copy" is a named test.

A third module joined them later, out of the defect below: `lib/highlight.js`,
which owns where the highlight goes when the Entries change under it. Same
reason again — it is a rule about intent, and a wrong answer reads as the
Launcher preferring something rather than as a fault.

41 tests, `node --test "tests/launcher/*.test.js"`, all passing in the
container.

### The Provider interface, since this ticket owns it

Documented at the top of `Applications.qml`. A Provider is a `QtObject` with
`label`, `ready`, `catalog` and `activate()`; an Entry is
`{ name, subtext, icon, provider, target }`.

Two decisions inside that worth stating:

- **An Entry carries its own Provider.** That is what lets one merged list be
  dispatched correctly — `Launcher.activateEntry` stays one function, and
  `apps.activate(entry)` is gone. It also matches CONTEXT.md: a Provider is
  responsible for saying what can be done with its Entries.
- **`ready` is per Provider, not global.** Zero applications is a fault; zero
  windows is an answer. The window's empty state now names whichever Providers
  are pending ("Waiting for applications…") instead of hardcoding one.

`target` is the Provider's own object — a `DesktopEntry`, a toplevel — and
nothing outside the Provider touches it.

Four terms got resolved here and are documented only in code and in this ticket:
the Provider interface itself, a **corpus text** (what an Entry is *found* by,
of which it may have several — deliberately not called a row, which CONTEXT.md
lists as a term to avoid for Entry), **subtext**, and **target**. They are
candidates for `CONTEXT.md` or an ADR next time `/domain-modeling` runs.

### Three consequences in `Launcher.qml`, none of them in a checkbox

- **The highlight no longer resets when the Entries change.** It could not stay
  that way: with a live Provider in the pool the Entries change on their own, so
  a background window finishing a page load would have yanked the highlight back
  to the top mid-arrow. Resetting to the best match now hangs off the *Query*
  changing; the Entries changing keeps the highlighted Entry by identity, and
  falls back to holding its position.

  The highlight is also no longer *stored* on the `ListView`. `model` is handed
  a brand-new array on every re-rank — which is now something that happens on
  its own — and a view given a new model may move `currentIndex` itself, which
  would reintroduce the same defect from the other side. `root.highlightIndex`
  is the intent, the view follows it (re-asserted through `Qt.callLater`, after
  the model has landed), and the delegate paints from it, so what is highlighted
  is always what Enter acts on.
- **Entries are two lines** when a Provider supplies a sub-line. For a window
  that is the application id and the workspace — `org.mozilla.firefox ·
  workspace 3`, or `ghostty · special:note`, which is the part that says the
  window you are about to switch to is on a scratchpad rather than in front of
  you. `Theme.entryHeight` went 40 → 44 to fit two lines; an application's row
  is unchanged, because an invisible child takes no room in a `Column`.
- **The placeholder said "Search applications"**, which stopped being true. Now
  "Type a name…", which stays true as the pool grows — and avoids `search`,
  which CONTEXT.md lists as a term to avoid for Query.

### One risk that is invisible until it bites: the focus race

`activateEntry` dismisses the Launcher *before* running the Action, which for a
window means the layer surface goes away and then the activate request goes out.
The claim that this is safe rests on both travelling the same Wayland connection
in that order, so the compositor refocuses whatever was focused before and
*then* honours the activate.

Elephant does not get that guarantee — it is a separate process with its own
connection — and sleeps before focusing "to avoid potential focus issues", a
configurable delay defaulting to 100ms
(`internal/providers/windows/setup.go:117`). If step 2 below lands focus on the
window you came *from* instead of the one you picked, this assumption is what
broke, and a delay in `activateEntry` is the remedy. Noted in the code at the
call site.

### Two things deliberately left unexercised

- **`activate()`'s second branch.** If a toplevel exposes no Wayland handle,
  the Provider calls `activate()` on the Hyprland object instead and logs that
  it did. Nothing in the verification below reaches it — it exists so that a
  window with no handle is focusable rather than dead, and if the warning ever
  appears in the log, that branch has become worth verifying.
- **`canNarrow`/`narrowFrom`** are still unwired, as ticket 04 left them.
  Against ~84 applications and a handful of windows they are state with nothing
  to buy; ticket 12's ~17,000-entry corpus is what they exist for.

### Two host runs, and the answer: `values` is not an Array

The first run said `Hyprland.toplevels is present` and `0 window(s)`, which
looked like the model existing but not populating. It was not. A third round of
diagnostics, printing shapes rather than counts, settled it:

```
launcher probe: Hyprland.toplevels -- values is object -- rowCount: 0   (startup)
launcher probe: Hyprland.toplevels -- values is object -- rowCount: 8   (3s later)
launcher probe: Hyprland.workspaces -- values is object -- rowCount: 8
launcher probe: Hyprland.monitors  -- values is object -- rowCount: 1
```

Nothing was wrong with the API, the IPC connection or the environment
(`HYPRLAND_INSTANCE_SIGNATURE` is exported into the unit; `refreshToplevels` is
a function and was called). **The fault was the guard added in review:**

> `values` is a QML **sequence**, not a JavaScript Array. `Array.isArray()`
> returns **false** for it, even though it has `length`, indexing, `map` and
> `filter` and behaves like an array everywhere else.

That is why the bar's `Hyprland.workspaces.values.filter(…)` has always worked,
and why an `Array.isArray` check here reported zero windows against a model
whose `rowCount()` was 8. The guard was added to close a real hole — an
exception in the binding takes the whole merged list down, applications included
— and it closed it by making the Provider silently empty instead, which is the
same failure it was written to prevent, arrived at from the other side.

The check is now for the shape actually needed — something with a numeric
`length` — and copies it into a real array (`listOf`). The lesson is worth
carrying to ticket 12 and every Provider after it: **never `Array.isArray` a
Quickshell model's `values`.**

Two other things the same runs settled, both from the shape dump:

- **The model populates asynchronously**, `rowCount` 0 → 8, exactly as
  `DesktopEntries` does. The catalog was already a binding, so this needed no
  change — but it confirms ticket 04's constraint applies to every Quickshell
  model, not just that one.
- **`ToplevelManager` exists** (`toplevels`, `activeToplevel`) and populates
  identically. So the Wayland model was never the missing ingredient. The
  union-of-both-models experiment that theory produced is gone; the Provider
  reads `Hyprland.toplevels` alone, which is the one that also knows about
  workspaces, and takes the Wayland handle off each toplevel for activation.
  That keeps the verified activate path without a second source, and removes the
  duplicate-Entry hazard a union carries when the link between the two models is
  absent.

### The Wayland handle: read the model, and wait for it

Dropping the union dropped the only read of `ToplevelManager`, and the next run
came back with 8 windows and **0 Wayland handles** — so every activation would
have taken the unverified fallback.

Two things had to be true, and both are now:

- **Something has to read `ToplevelManager` for it to run at all.** Quickshell
  links each `HyprlandToplevel` to its Wayland counterpart, but a singleton only
  starts when something reads it, and nothing else in this config does. That is
  the entire job of the `waylandCount` property — it exists to keep the model
  running, and deleting it as unused silently gives the handles back up.
- **The link is made last.** The final run shows the order plainly: windows
  arrive 1→7, then `ToplevelManager` fills 1→7, then the handles link 1→7 behind
  it. A log line keyed on the window count alone reported "0 with a Wayland
  handle" and then never spoke again, which read as a permanent fault and was
  really a snapshot taken three phases too early. The line is now keyed on all
  three numbers, and a change in the Wayland model alone can trigger it.

The property name was right all along — `wayland` is in `HyprlandToplevel`'s key
list, alongside `address`, `handle`, `title`, `activated`, `urgent`,
`workspace`, `monitor` and `lastIpcObject`.

**Settled state on the host: `7 window(s), 7 with a Wayland handle
(ToplevelManager has 7)`.** Every Entry activates through the verified path.

The keys-dump warning that found this now fires only when the Wayland model has
toplevels while no window links to one — the state that is genuinely wrong,
rather than the startup phase where no window has linked *yet*.

**Corrected during ticket 06 — that condition was wrong.** A host run there
showed it firing on an ordinary healthy restart, at
`0 with a Wayland handle (ToplevelManager has 1)`. The claim above assumed the
two models fill in sequence: Wayland model, then links. They fill
**concurrently**, and the links are made one at a time behind both, so the log
walks `0 handles / ToplevelManager has 1` … `0 handles / ToplevelManager has 7`
before the first link appears. Every one of those states satisfies the
condition.

The deeper point, and the one worth carrying: **no snapshot of those three
counts can separate "not linked yet" from "never will be".** The difference
between the phase and the fault is *time*, and a counter does not have it. This
is the same lesson as the one above — a number is not a shape — one level up: a
shape observed at one instant is still not a history.

So the key dump moved to where the fault has a consequence rather than where it
is first visible: `focusWindow`'s fallback branch, printed once per session off
the toplevel actually being activated. That fires on a real activation, long
after any startup phase, and exactly when a window is about to be focused
through the unverified path. `report()`'s three numbers still say plainly
whether the handles arrived; they just no longer editorialise about it.

### The defect that was blocking this: the highlight walked, and the view followed

**Symptom, on the host:** restart the Launcher, press the keybind — applications
are listed, windows are not. Dismiss and press it again and the windows are
there, for that open and every one after. Left open, they also appear on their
own after a while.

**The cause is one rule applied where it does not belong.** `keepHighlight`
keeps the highlighted Entry *by identity* when the list changes underneath,
which is right and deliberate: a background window retitling itself re-ranks the
pool several times a second, and without this the highlight would be yanked back
to the top mid-arrow. But at startup nobody has arrowed anywhere. The
applications land first, the highlight defaults to the first of them, and then
six windows arrive *above* it. Identity did exactly what it was told — it
followed that application from index 0 to index 6 — and the view followed the
highlight, leaving the six window rows above the top edge of the list.

Nothing was missing, nothing was late, nothing was stale. The list was correct
and fully populated the entire time, and both the ranking and the view were
faithfully rendering a highlight that had walked.

**The fix:** `highlightPinned`. Identity is honoured only for a highlight the
*user* placed — an arrow key sets it, typing and `reset()` clear it. Otherwise a
re-rank goes back to the best match, which is what an untouched Launcher should
always be showing. The rule now lives in `lib/highlight.js` under test rather
than inline in the QML, for the same reason `matching.js` does: it is a rule
about intent, and a wrong answer reads as a preference rather than as a fault.
Six named tests, the first of which is this defect.

**Three rounds, two wrong diagnoses, and what actually ended them.**

1. *"The `rankedEntries` binding errored on its first evaluation."* Eliminated by
   inspection, from the symptom alone: the applications were listed, and a throw
   anywhere in that binding leaves it undefined and takes the *whole* merged list
   down, applications included.
2. *"The data was late."* The first log showed the windows arriving after all 84
   applications, which fitted a startup race exactly — and was wrong. Timestamps
   killed it: **the pool is complete at +127ms** and the open was at +90752ms,
   with all six windows already ranked ahead of the applications.
3. *"The `ListView` kept its own position across ninety model reassignments while
   unmapped."* Plausible, wrong, and expensive. It fell to printing the view's
   own position next to the Entry names.

Each round replaced a *number* with a *shape*, and the shape ended it:

```
pool at open +7458ms -- windows 6, applications 84 -> 90 entries ranked
  -- top: timer -s course 1h | New chat - Claude | t (contentY 264, currentIndex 6)
```

`contentY 264` is exactly six 44px rows, and `currentIndex 6` is the highlight
sitting on the seventh. Six windows at the top of the model, six rows scrolled
past, highlight on the first application. The answer was in that one line and in
no count that preceded it. **The lesson for every Provider after this one: a
list that is correct and a list that is scrolled are indistinguishable from
counts alone, and "the windows arrive last" is not the same claim as "the
windows arrive late".**

**Two other things stay, both worth their keep independently.**

- **The ranking no longer depends on a QML Item.** `rankedEntries` read
  `query.text` — a `TextInput` inside a window that starts `visible: false`.
  `root.queryText` is now a plain string the field drives, defaulting to `""`,
  which is what an untouched Launcher should rank against. Ranking is model
  logic; it should not have been reaching into the view for its input.
- **`refresh()` joined the Provider interface, optional**, called on every open.
  Applications has none — `DesktopEntries` populates once. The windows Provider
  re-queries the compositor. At a 127ms fill it buys nothing for *this* defect,
  and is kept for the case it was never about: a model that has drifted from
  reality because an event was missed.

`reassertView()` is kept too, but demoted to what it always was — belt and
braces around geometry that lands in two steps, not a fix for anything observed.

**The instrumentation that found it is gone**, as promised — the whole
`reportPool` block, its elapsed-ms clock and the per-open shape dump came out
when the checkboxes went in. What survives it is `lib/highlight.js` and its
tests, which is the durable form of the same knowledge: the rule that was wrong
is now stated once, in one place, with the failing case named.

`Windows.qml`'s own two lines stay. They are not leftovers from this hunt — they
answer "is the Provider inert or is nothing open", which is a question every
future Provider has, and step 0 of the verification below is reading them.

## Manual verification

Closes: the four open checkboxes.

Everything below runs on the Arch host, in a Hyprland session.

### 0. Stow, restart, and read the two diagnostic lines

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
sleep 2
qs -c launcher log
```

**Expected:** a stream of lines rather than one, because three things fill in
sequence — the windows, then the Wayland model, then the links between them. It
is the **last** line that means anything:

```
launcher: Hyprland.toplevels is present
…
launcher: windows Provider sees 7 window(s), 7 with a Wayland handle (ToplevelManager has 7) -- first: … [ghostty · workspace 1]
```

All three numbers should agree and match how many windows are actually open, and
the bracketed sub-line should name a real application id and workspace.

The failures, none of which look different from inside the Launcher: `is
unavailable` (the property name is wrong, the Provider is inert), a window count
that never moves off 0, or a settled line where the handle count stays **below**
the window count. That last one is not a failure of this step — those windows
still activate, through the fallback — but it means step 2 exercises the
unverified path, and a `no window has a Wayland handle` warning with a key list
will be in the log next to it. **Paste any of these back**; the steps below
would otherwise fail for an unrelated reason.

No QML errors either. A QML error keeps the *previous* config alive rather than
crashing, so a Launcher that behaves exactly as it did before this ticket has
probably not reloaded at all.

### 1. Windows appear, and are matchable by title and by application

Open two or three windows you can name, then **SUPER + ALT + SPACE**.

**Expected:** with an empty Query, every open window listed **first**, above the
applications, each on two lines — its title, and under it `<application id> ·
workspace <n>`.

Then type, in one go:

- part of a window's **title** (a word from a browser tab, say) → that window
  narrows in;
- the **application** name of something you have running — `firefox`, `zed`,
  `obsidian` → **the running window appears above the application entry of the
  same name.**

That second one is the whole ticket. If the application wins, the corpus text
that makes them tie is not being built — paste back what the two entries look
like.

Closes: checkbox 1.

### 2. Activating focuses the window, including across workspaces

Leave a window on workspace 3 and switch to workspace 1. **Stage the check
first** — it has to run without you touching a terminal, because focusing one to
type in it would make the terminal the answer:

```bash
(sleep 8; hyprctl activewindow -j | jq '{ class, title, workspace: .workspace.name }' > /tmp/df-launcher-focus.json) &
```

You now have eight seconds: open the Launcher, type enough to highlight the
window on workspace 3, press **Enter**, and leave it alone. Then:

```bash
cat /tmp/df-launcher-focus.json
```

**Expected:** the window you picked, on workspace 3 — and the compositor
switched to that workspace when you pressed Enter. If it names the window you
were on *before* opening the Launcher, that is the focus race described above,
not a broken Action. If it names your terminal, the eight seconds ran out; try
again.

Confirm keyboard focus too, not just the compositor's opinion of it: press the
keybind again on any window, type a word, and check it lands in the window you
picked rather than nowhere.

Closes: checkbox 2.

### 3. The list follows windows opening and closing

With the Launcher dismissed, open a new terminal. Open the Launcher.

**Expected:** the new window is in the list. Close it, open the Launcher again —
it is gone. No restart of the Launcher anywhere in this step.

```bash
qs -c launcher log | tail -5
```

**Expected:** a `windows Provider sees N window(s)` line for each change, with N
moving up and down.

Then the part a live Provider put at risk — a window retitling itself must not
steal the highlight. In a spare terminal:

```bash
while true; do printf '\033]0;noise-%s\007' $RANDOM; sleep 1; done
```

Open the Launcher, press **Down** twice, and watch for ten seconds without
touching anything.

**Expected:** the highlight stays on the third Entry. If it jumps back to the
top once a second, the arrow keys are no longer pinning it — `moveHighlight` is
the only thing that sets `highlightPinned`, and without it every re-rank is
entitled to go back to the best match. That is the *opposite* failure from the
one that blocked this ticket, and the pair of them is why both cases are named
tests in `tests/launcher/highlight.test.js`: "an untouched highlight goes to the
best match" and "a highlight the user placed follows its Entry".

Closes: checkbox 3.

### 4. Special and scratchpad workspaces

Press **SUPER + O** to bring up Obsidian on its scratchpad (`special:note`),
then press **SUPER + O** again to hide it. It is still running, just not
visible. Now open the Launcher and type `obsidian`.

**Expected:** the window is listed, with `special:note` in its sub-line rather
than a workspace number. **Being listed at all is what this checkbox is
about.** Press **Enter**.

**Expected:** the scratchpad opens on the monitor you are on, with that window
focused.

Repeat with **SUPER + M** (Thunderbird, `special:thunderbird`) if you want a
second one. A window that is running on a hidden scratchpad and does *not* show
up in the list at all is the failure this checkbox is about; showing up but
failing to focus is a different one, and worth reporting separately.

Closes: checkbox 4.
