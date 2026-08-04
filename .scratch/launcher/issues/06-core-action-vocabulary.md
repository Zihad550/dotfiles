# 06 — Core Action vocabulary

**What to build:** The same key does the same kind of thing in every Provider. A Provider fills named slots rather than inventing its own key bindings, so muscle memory transfers as Providers are added.

**Blocked by:** 04 — Type to filter, Enter to launch an application.

**Status:** done — all six closed on the host across two rounds, steps 0–4 then
step 5.

- [x] Primary, secondary and back Actions are declared once by the shell and filled by Providers
- [x] The same key performs the same kind of Action in every Provider
- [x] Available Actions and their Provider-supplied labels are visible without guessing
- [x] A Provider may declare an extra Action beyond the core set when it genuinely needs one
- [x] An Action can request that the Launcher close, refresh its Entries, or stay open unchanged
- [x] A Provider that leaves a slot unfilled does nothing on that key rather than erroring

## Comments

Written from the devcontainer, closed from the host in two rounds of one step
each — no round spent on a defect. Nothing was ticked before that: unlike ticket
05, there is no checkbox here that is closable by inspection. Every one of them
is a claim about a key press producing or not producing an effect, and the two
ways this can be wrong — a chord that reaches nothing, and an Action that runs
but is invisible — both look exactly like the Launcher ignoring you.

**`Toplevel.close()` exists and is spelled `close`.** The one thing that could
not be checked before it shipped came back yes on the first press: the window
closed, the Launcher stayed open, and the `no close() on the Wayland handle`
branch never fired. That branch and its key dump stay — the cost is nothing and
the question would come back with any Quickshell upgrade — but the API is
answered, and any Provider after this one can call `close()` on a Wayland
toplevel without hedging.

**The host run, in one line:** it reloaded cleanly (`7 window(s), 7 with a
Wayland handle (ToplevelManager has 7)`, no QML error), the footer named each
Provider's own Action, the keys did what it said, typing was unaffected, the two
unbound chords did nothing and logged nothing, and Escape still dismissed. One
round, no defects — which is worth contrasting with ticket 05's four, and the
reason is the seam: everything that could have been wrong about *which key means
what* was already a named test before the config was stowed. What the host
verified was only that Qt delivers the events this code assumes, which is the
part no container can answer.

One thing the run turned up that is **not** this ticket's, and was fixed
alongside it: the `no window has a Wayland handle` warning from `Windows.qml`
fired during startup, at `0 with a Wayland handle (ToplevelManager has 1)`. See
the correction appended to ticket 05 — the short version is that no snapshot of
those three counts can separate "not linked yet" from "never will be", so the
key dump moved to `focusWindow`'s fallback branch, where the fault has a
consequence.

`lib/actions.js` + `tests/launcher/actions.test.js`, 22 tests; 63 across the
suite, `node --test "tests/launcher/*.test.js"`, all passing in the container.

### The vocabulary is walker's, deliberately

`Return`, `shift Return`, `Escape`, and an outcome per Action — because that is
what muscle memory is currently trained on. It is not invented here: every one
of these is in `walker/.config/walker/config.toml:29-49`, which is the file this
rewrite is replacing.

One thing is renamed. Walker's `after` takes `Close` / `AsyncReload` /
`Nothing`; the outcomes here are **close / refresh / stay**. `AsyncReload` names
walker's implementation rather than what it does, and `Nothing` is ambiguous
between "the Action did nothing" and "the Launcher does nothing next", which is
the exact distinction this ticket turns on.

The default outcome differs per *slot*, which is a decision rather than a
detail: primary and secondary default to `close`, and **back defaults to
`stay`**, because going back is a move within the Launcher and cannot default to
closing the thing it moves within. Ticket 12's directories Provider is the first
to fill that slot, and a uniform `close` default would have been a trap sprung
there rather than here.

### What a Provider declares, and what it deliberately cannot

Documented at the top of `Applications.qml`, alongside the rest of the Provider
interface:

```qml
readonly property var actions: ({
    primary: { label: "launch", invoke: entry => root.launch(entry) }
})
```

**A Provider never names a key.** It names a slot, a label and what to run. That
is the whole ticket: the key lives in one table in `lib/actions.js`, so Return
launching an application, switching to a window and — in ticket 13 — copying a
screenshot is structurally true rather than three files agreeing by luck.
`Applications.activate()` and `Windows.activate()` are gone; they are `launch()`
and `focusWindow()` now, reached through the table.

An extra Action *may* name a chord, because that is what an extra is — an Action
outside the shared vocabulary, which nothing may assume means the same thing in
the next Provider. It is the only place a Provider names a key, so it is also
the only place the Provider can get one wrong, and two ways of getting it wrong
are dropped with a warning:

- **claiming a core chord**, which would silently shadow the slot it claims —
  the one failure this module exists to prevent;
- **a chord no key press can produce** — `Ctrl+w`, `Shift+Ctrl+W`, `F2`,
  `Ctrl+Delete` all look plausible and are all dead. This is the same
  indistinguishable failure reached from the Provider's side, and it is worse
  than the first: the footer would *advertise* the key, and pressing it would
  do nothing. `isChord` is the round trip — what the keyboard emits and what a
  Provider may declare are asserted to be one set.

Dropped, not thrown: a throw inside a QML binding takes the whole merged list
down, which ticket 05 paid for once already.

### Both Providers fill primary and nothing else, and that is the point

Applications: `launch`. Windows: `switch to`. The labels differing is the
visible proof the vocabulary is per Provider — arrowing from a window row to an
application row changes the footer while the key stays `⏎`.

**Secondary is unfilled in both, on purpose, and it is a demonstration rather
than a gap** — checkbox 6 is exactly this. The candidates for an application's
secondary are launching a second copy, which is what primary already does now
that focusing an existing window is the windows Provider's job, and the desktop
entry's own actions ("New Private Window"), which are a *list* and would need
somewhere to show it. Inventing one to fill the slot would have made the slot
mean "whatever was left over", which is the failure mode the slots exist to
prevent.

Back is unfilled too, and that turns out to be free: **"an unfilled slot does
nothing" and "Escape still dismisses the Launcher" are the same line of code.**
The dispatcher accepts a key event only when the chord resolved to an Action, so
an unfilled Escape goes unaccepted and propagates up to the FocusScope's
`Keys.onEscapePressed`, which is what has always dismissed. Ticket 12 fills the
slot and Escape becomes "up a directory" there and nowhere else, with no special
case anywhere.

### The rule that decides whether the Launcher is typeable

`Keys.onReturnPressed` and friends are gone in favour of one `Keys.onPressed`
that builds a chord from the raw event. Two reasons, and the first is the one
that cannot be answered from a container: whether the specific handlers still
fire with a modifier held is a question, and a chord built from `key` and
`modifiers` makes it not one. The second is that there is no
`Keys.onCtrlWPressed` to add, so without this an extra Action is unreachable and
checkbox 4 is a lie.

**The event is accepted only when the chord resolved.** That single rule makes
three separate promises true at once — printable keys keep reaching the Query
field, an unfilled slot does nothing, and Escape still dismisses. Getting it
wrong makes the Launcher untypeable, which is why step 2 of the verification is
typing rather than pressing anything.

Two keys are deliberately unreachable as chords, and both are named tests:

- **A letter is Query text unless Ctrl or Alt is held.** Shift is deliberately
  not enough — Shift is how a capital is typed, so a rule taking *any* modifier
  would swallow every capital letter, and with no rule at all a Provider binding
  `w` would swallow every `w`. Either way it presents as a broken keyboard.
- **Backspace is never a chord**, modified or not. It belongs to the Query, and
  ticket 11 spends it on deleting back past a prefix.

`Tab` is reserved rather than mapped. **CONTEXT.md names four Core Actions and
this ticket names three** — the fourth is marking, which ticket 13 owns, and
leaving it out is deliberate rather than an oversight: marking is *state* that
outlives the keypress (which Entries are marked, cleared when the Launcher
closes) rather than something done to an Entry, so it does not arrive through
this table. Worth resolving in CONTEXT.md next time `/domain-modeling` runs;
flagged here rather than edited unilaterally.

### The footer, and why the checkbox exists

A row of `⏎ launch`-style hints along the bottom of the card, from the
*highlighted* Entry's Provider — because that is whose Provider the keys will
reach. Chord in the accent colour, label muted, `Theme.hintFontSize`.

`listMaxHeight`'s `chrome` grew to match, guarded on `footer.visible`: an
invisible child takes no room in a Column but still has a height. Omitting that
would run the card off the bottom edge of the 1366x768 output that calculation
exists for, and only on that output — which is why it is called out here rather
than left to be noticed.

### The pointer goes through the same door

The delegate's click used to call `activateEntry`; it now calls
`runAction(entry, Actions.chordFor("primary"))`. A click carries no modifiers,
so it asks for the *slot* by name and gets the chord back from the same table
the keyboard reads. That is what stops clicking and pressing Return from quietly
diverging as Providers fill more slots.

### What is left, and why it is a decision rather than a task

Checkboxes 4 and 5 — an extra Action beyond the core set, and an Action asking
for something other than `close`. `close` is what both Providers' primary
Actions ask for; `refresh` and `stay` are declared, tested at the seam, and
asked for by nothing.

Both are *capability* claims — "a Provider **may** declare an extra", "an Action
**can** request" — and the capability exists and is under test. What is missing
is a Provider that wants one. That cannot be manufactured honestly: filling a
slot to close a checkbox is how a slot comes to mean "whatever was left over",
which is the failure the whole vocabulary exists to prevent.

Two candidates, and they are not equally good.

**Closing a window, from the windows Provider.** The only Action in either
existing Provider that *changes what the list should say*, which is the entire
reason `refresh` exists — every other Action here is "act on this and go away".
Structurally it is also an extra rather than a core slot, and that is a claim
about meaning, not about spare keys: `secondary` is "the other obvious way to
act on this Entry" everywhere it will be filled (ticket 13 — primary copies the
image, secondary copies the path), and destroying a window is not another way of
switching to it. So it exercises exactly the two things left open, for the right
reasons in both cases.

What holds it back is `Toplevel.close()`, which **cannot be verified from the
devcontainer** (no `quickshell`, no `.qmltypes`), and ticket 05 spent four host
rounds on exactly one unverified API assumption. The host run above narrows it —
all 7 toplevels carry a Wayland handle, so a `close` request would reach the
compositor if the binding exposes one — but the *property name* is still
unconfirmed, and a `typeof` guard means a wrong name warns and does nothing,
which leaves `refresh` unexercised anyway. It also binds a destructive,
unconfirmable Action to a key, which is a poor thing to be the first extra.

**Ticket 13's screenshots Provider**, whose secondary ("copy path") and mark are
*specified requirements of a ticket* rather than an Action invented to fill a
box. It is the better closer for checkbox 4 on merit: the Provider genuinely
needs the Action, which is the literal wording of the checkbox.

The recommendation was to leave 4 and 5 open and let 13 close them. **Overruled:
close-window was asked for and built.** What follows is what that decision
actually bought and cost, which is worth recording either way.

### Ctrl+W closes the highlighted window

`Windows.qml` declares one extra:

```qml
extras: [{ chord: "Ctrl+W", label: "close window",
           invoke: entry => root.closeWindow(entry), after: "refresh" }]
```

**It asks rather than forces**, and the word carries the semantics. This is the
`close_requested` event of `zwlr_foreign_toplevel_handle_v1` — the same request
a titlebar's X sends. The client decides: an editor with unsaved work may put up
a dialog and stay, and that is correct rather than the Action failing. Nothing
kills a process, deliberately — an Action one keystroke away from a list you are
typing into must not be able to lose someone's work.

**No Hyprland fallback**, unlike `focusWindow`. The alternative is
`dispatch closewindow address:0x…`, and ticket 01 found this machine runs
Hyprland's Lua config where a bare dispatcher string is a syntax error. A window
with no Wayland handle is left un-closable and says so. For focusing, "might
work" was worth the risk; for a destructive Action it is not.

**`close()` was the one unverifiable piece** — no `quickshell` in the container,
so the property name came from the protocol rather than from the binding. It
shipped behind a `typeof` guard with a one-shot key dump in the failing branch,
so a wrong name would warn, name what the object does have, and close nothing
rather than throw inside an Action. **The host answered yes on the first press**
and the branch never fired; `wayland.close()` is settled for every Provider
after this one.

**What `after: "refresh"` actually buys**, stated precisely because it is easy to
over-claim: not the list updating. The catalog is a binding over live compositor
state, so the Entry vanishes on its own the moment the window goes. What the
outcome buys is the Launcher **staying open** — closing windows is the one Action
here you plausibly do twice in a row, and dismissing after it would make the
second one a whole new open. The refresh is a nudge for a missed event, and
fire-and-forget on purpose: the close is a request the client may take a moment
to honour, so a re-query landing before the window is gone is expected.

`tests/launcher/actions.test.js` carries the declaration verbatim as a named
test. The Provider is QML and cannot be loaded under node, so that test is the
only thing other than a key press that catches a typo in the chord or the
outcome — and a chord typo is the failure that advertises a key in the footer
and does nothing when pressed.

68 tests, all passing in the container.

## Manual verification

**All steps ran on the host and passed** — 0–4 in one round, 5 in a second after
close-window was built. Kept below as the record of what was checked.

Steps 0–4 close **2, 3, 6, and the half of 1 that is demonstrable**. Checkbox
1's "filled by Providers" is evidenced for `primary` only, because `secondary`
and `back` are deliberately unfilled; its "declared once by the shell" half is
closable by inspection of `core()` in `lib/actions.js`. Step 5 closes **4 and
5**.

Everything below runs on the Arch host, in a Hyprland session. Steps 1 and 2 are
the ones that matter; the rest are quick.

### 0. Stow, restart, and confirm it reloaded at all

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
sleep 2
qs -c launcher log | tail -20
```

**Expected:** the windows Provider's usual line
(`windows Provider sees N window(s), N with a Wayland handle …`) and **no QML
error**.

This step exists because a QML error keeps the *previous* config alive rather
than crashing, so a Launcher that behaves exactly as it did before this ticket
has probably not reloaded. This ticket touches every file in the config, and
`Keys.onPressed`, the `actions` property literal and the footer's Repeater are
all new shapes here — **paste any error back and stop**; every step below would
fail for that one reason.

### 1. The footer names the Actions, in each Provider's own words

**SUPER + ALT + SPACE**, then arrow down until the highlight crosses from a
window row to an application row and back.

**Expected:** a hint row along the bottom of the card reading `⏎ switch to` over
a window and `⏎ launch` over an application — the symbol unchanged, the words
changing with the Provider. Nothing else in the row: secondary and back are
unfilled, so they are not advertised.

Then confirm the key agrees with what the footer says: press **Enter** on each
and check it switches to the window / launches the application, exactly as
before this ticket. Then **click** an Entry with the mouse and check it does the
same thing Enter does.

If the footer is missing entirely but Entries are listed, `highlightActions` is
empty — paste back what the card looks like. If the card runs off the bottom of
the screen, that is `listMaxHeight`'s `chrome`.

Closes: checkboxes 2 and 3, and the `primary` half of checkbox 1.

### 2. Typing still works, and an unfilled key does nothing

With the Launcher open, type a real query — several letters, including a
backspace or two.

**Expected:** every character lands in the Query and the list narrows. This is
the step that catches the dispatcher accepting events it should not: the failure
is a Launcher that opens and cannot be typed into.

Now, **with an application highlighted** — not a window — press **Shift +
Enter**, then **Ctrl + W**. These are two different cases and only the first is
checkbox 6: Shift+Enter is a core slot the Provider left **unfilled**, while
Ctrl+W is a well-formed chord **that Provider has not bound** — different paths
to the same required nothing, and the second also proves an unbound modifier
chord does not leak a `w` into the Query.

> Run this over an **application** row. Ctrl+W over a *window* now closes it —
> that is step 5, and it is also the proof that the same chord is unbound in one
> Provider and bound in another without either knowing about the other. (When
> this step first ran, nothing bound Ctrl+W anywhere and either row would do.)

**Expected:** nothing at all happens, either time. The Launcher stays open, the
highlight stays where it is, the Query is unchanged, and:

```bash
qs -c launcher log | tail -5
```

**Expected:** no new line, and in particular no error or warning. "Does nothing"
and "does nothing *quietly*" are separate claims and this is the second one.

Closes: checkbox 6.

### 3. Escape still dismisses, over both Providers

Open the Launcher, highlight a **window**, press **Escape**. Open it again,
highlight an **application**, press **Escape**.

**Expected:** it dismisses both times. Neither Provider fills the back slot, so
this is the unfilled-slot rule and the dismissal being the same behaviour — if
Escape ever stops dismissing, that is the dispatcher accepting a chord that
resolved to nothing.

Closes: checkbox 6 again, from the other side. It is deliberately *not* evidence
for the `back` half of checkbox 1 — nothing here fills that slot, and ticket 12
is where it first will.

### 4. Nothing regressed under the keys that were already working

Open the Launcher, press **Down** twice, then **Up** once, then **Enter**.

**Expected:** the highlight lands on the **second** Entry from the top (down to
the second, down to the third, back up to the second) and Enter acts on that
one. The arrow handlers were left alone but now
sit alongside a generic `Keys.onPressed` on the same field, and which of the two
Qt delivers first is a Qt implementation detail this code is written not to
depend on — this step is what says it does not.

### 5. Ctrl+W closes a window, and the Launcher stays open

**Added after steps 0–4 passed, and since run: passed.** Restow and restart
first, since `Windows.qml` changed:

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland && df-qs-restart launcher
sleep 2
qs -c launcher log | tail -5
```

**Expected:** the usual settled `N window(s), N with a Wayland handle` line and
no QML error, as in step 0.

Now open a **scratch window you do not mind losing** — a fresh terminal with
nothing running in it is ideal. Open the Launcher and highlight it.

**Expected first, before pressing anything:** the footer reads
`⏎ switch to   Ctrl+W close window`. Over an application row it still reads
`⏎ launch` alone. That contrast is checkbox 4 — a Provider declaring an Action
beyond the core set, advertised in its own words, and invisible where it does
not apply.

Press **Ctrl + W**.

**Expected:** the terminal closes, **the Launcher stays open**, and the Entry
disappears from the list. The staying open is checkbox 5 — an Action asking for
something other than `close`. Highlight another disposable window and press it
again without reopening: that back-to-back case is the whole reason the outcome
is `refresh` rather than `close`.

Then, the part that says it *asks* rather than forces: open an editor with
unsaved changes (or anything that confirms on quit), highlight it, press
**Ctrl + W**.

**Expected:** its own "save changes?" dialog appears and the window stays.
That is correct behaviour, not a failed Action — this sends the same request the
titlebar's X does and nothing here kills a process.

```bash
qs -c launcher log | tail -5
```

**The failure to watch for**, and the one thing that could not be checked from
the container: a line reading `cannot close <name> -- no close() on the Wayland
handle`, followed by `Wayland Toplevel keys: […]`. That means the method is not
spelled `close` on this Quickshell build — **paste the key list back** and it is
a one-line fix. Nothing is closed and nothing is broken in that case; the Action
warns and does nothing.

Closes: checkboxes 4 and 5.
