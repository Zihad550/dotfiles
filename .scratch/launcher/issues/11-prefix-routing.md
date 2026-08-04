# 11 — Prefix routing

**What to build:** A leading character narrows the Query to a single Provider, using the same characters as today so muscle memory carries over.

**Blocked by:** 04 — Type to filter, Enter to launch an application.

**Status:** done — all six closed, five of them on the Arch host across two
rounds. See **Comments**.

- [x] A leading prefix routes the Query to exactly one Provider
- [x] Prefixes are declared by the Provider itself, not registered in a central table
- [x] Today's prefix characters behave as they do now
- [x] Deleting back past the prefix returns to the default pool
- [x] A prefix matching no Provider is treated as ordinary Query text rather than swallowed
- [x] Two Providers claiming the same prefix is caught at load, not resolved silently

## What was built

`lib/routing.js` + `tests/launcher/routing.test.js` (11 tests), the wiring in
`modules/Launcher.qml`, and a `prefix` property on `Calculator.qml` and
`WebSearch.qml`. 190 tests across the suite, `node --test
"tests/launcher/*.test.js"`, all passing in the container.

**The mechanism is two pure functions, both stateless.** `route(providers,
queryText)` walks a list in pool order and returns the first Provider whose own
`prefix` the Query starts with, plus the Query with that prefix sliced off —
`{ provider: null, query: queryText }` unchanged for no match. `problems(providers)`
returns one message per prefix claimed by more than one Provider. Ported from
walker's own rule rather than invented: `resources/walker/src/data.rs:519-533`
does exactly this — first matching prefix wins, provider narrows to one, prefix
stripped before the Provider ever sees the query — which is where "today's
prefix characters behave as they do now" and "deleting back past the prefix
returns to the default pool" both come from. The second one specifically:
walker's `query()` is asked fresh on every keystroke and keeps nothing from the
one before, so a Query that no longer starts with a claimed prefix is simply
routed nowhere — no flag anywhere gets cleared, because none was set. `route()`
here has the same shape for the same reason, and checkbox 4 is closed by that
absence of state rather than by a rule that reacts to Backspace. (Backspace
itself was already unreachable as a chord — `lib/actions.js`'s note on
`chordOf`, from ticket 06: "it belongs to the Query, and ticket 11 spends it on
deleting back past a prefix." It reaches the TextInput and edits the field the
same as any other character; nothing about this ticket touches that.)

**Two Providers declare a prefix, and both are walker's own**: `=` on
`Calculator.qml`, `@` on `WebSearch.qml` — `walker/.config/walker/config.toml:92-98`.
Nothing else in the current pool gets one. `elephant`'s other prefixes
(`/` directories, `~` files, `.` symbols, `$` clipboard, `?` providerlist) name
Providers this port has not built yet; each lands with its own ticket (12, 14,
16, 18) and declares its own `prefix` when it does, which is the entire point
of checkbox 2 — nothing here has to change for that to work.

**The four static menus get no prefix, on purpose, and this is worth stating
because ticket 08 twice flagged the opposite as this ticket's job**
("Reaching one menu as a menu is ticket 11's prefix routing"; "Reaching one
menu on its own … is ticket 11"). No character for `menus:system` /
`menus:media` / `menus:other` / `menus:display` exists in walker's shipped
config — the `[[providers.prefixes]]` blocks there name `?`, `/`, `~`, `.`,
`=`, `@`, `$`, and none of those is a menu. So there is no established
character "today's prefix characters behave as they do now" could be
preserving, and inventing one is a UX decision (which letter, whether it is
worth training new muscle memory for) that this ticket's checkboxes do not
make and a routing mechanism should not make unilaterally. **Left open,
knowingly, rather than silently dropped** — reaching a single menu by its own
prefix is a real gap ticket 08 named twice and this ticket does not close; if
it is still wanted, it needs its own ticket to pick the character.

**How narrowing actually reaches calc and websearch, since neither is in
`pool`.** `Launcher.qml` now computes `routable` (`pool` plus `[calc,
websearch]`) and `routed` (`Routing.route(routable, queryText)`) once per
keystroke, then two things read off `routed`:

- `activePool` — `pool` unrouted, `[]` when `routed.provider` is calc or
  websearch (narrowed to a Provider `pool` cannot hold), `[that Provider]`
  otherwise. `scoredEntries` ranks `activePool` against `routed.query` instead
  of `pool` against `queryText` — the only change to ranking itself.
- `calc.queryText` and `websearch.queryText`, each bound to `routed.query` when
  nothing routed or routing named that Provider, `""` otherwise. `""` is what
  suppresses the one *not* named: `Calc.wanted("")` and
  `Web.entriesFor("", …)` are both already false on an empty Query, so
  narrowing needed no new rule in either module — an Entry routed away from
  is an Entry that Provider was never asked to produce.

**One consequence worth naming rather than leaving to be found:** routed to
`@`, `websearch.hasLocalAnswer` is always `false`, because `calc.entries` and
`scoredEntries` are both empty under that routing — so the search row shows
unconditionally rather than only when nothing else answered. That is not new
behaviour invented here; it is what ticket 09 deferred — "a plain search is
reachable only through the `@` prefix… the gate here is more generous than what
it replaces, not less, and the `@` prefix itself remains ticket 11's" — restored
by narrowing rather than by a special case in `websearch.js`.

**One more knock-on fix, not a checkbox but a direct consequence of narrowing:**
the empty-state message ("Waiting for …") now reads off `activePool` instead of
`pool`. Unchanged, a Query routed to `=` before `windows` finished populating
would have said "Waiting for windows…" — true of the full pool, meaningless for
a Query that was never going to consult it.

**Component.onCompleted, not a property binding, is what logs `problems()`.**
The natural first draft ran it inside `routable`'s own getter, which is
technically fine — `route()` and `problems()` both only read a `prefix` that is
already a settled literal on every current Provider — but it made "caught at
load" depend on which binding happened to evaluate `routable` first, which is
`calc`'s own `queryText` binding during `calc`'s construction. Moved to
`Component.onCompleted` so it runs once, after the whole tree exists, and reads
as "at load" because that is genuinely when it runs rather than an accident of
evaluation order.

## Manual verification

Closes the five runtime checkboxes: 1, 3, 4, 5, and re-confirms 6 against the
real pool rather than the synthetic collision `routing.test.js` exercises.
Checkbox 2 is closed by inspection above — no test can watch "nothing is
registered anywhere" fail to happen — but the "custom, invented providers"
test in `routing.test.js` is the closest a test gets to it.

Everything below runs on the Arch host, in a Hyprland session.

### Step 0 — it still starts

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, no QML error. The one new risk here a
container cannot check: `calc.queryText` and `websearch.queryText` are each
bound to an expression naming `root.routed`, which itself reads `calc` and
`websearch` by id — a binding loop or a `ReferenceError` on a not-yet-defined
id would show up right here, as a config that fails to load or a Launcher that
opens with nothing in it.

### Step 1 — the case this ticket exists for, and the gate it reopens

With Firefox (or whichever browser) closed enough that typing `fir` normally
offers it:

Type `fir`. **Pass, unchanged:** Firefox first, no `Search:` row — today's
behaviour, unrouted.

Then type `@fir`.

**Pass:** exactly one row, `Search: fir`, sub-line `Google`. **No Firefox row
at all.** This is the strongest single check available: it proves a prefix
narrows to one Provider (checkbox 1) and that `@` overrides the
nothing-else-answered gate ticket 09 deferred here, in one screen.

### Step 2 — the other established prefix

Type `=1234*7`.

**Pass:** the result row `8638` is the only row — no applications, no windows,
no menu entries fuzzy-matching the digits. **Closes checkbox 1** alongside step
1, and **closes checkbox 3** together with step 3: qalc's own gating (3
characters, at least one digit) is unchanged by being reached through a prefix,
so —

Type `=1` (two characters after the prefix, no third).

**Pass:** no result row. Same rule as an unrouted Query this short — `=1`
should behave exactly like `1` does today, which is nothing.

### Step 3 — deleting back past the prefix

Continuing from `=1234*7`, press Backspace eight times, one at a time, down to
an empty field, watching the list after each press.

**Pass:** the calculator row stays exactly as long as the text remaining after
`=` still qualifies (3+ characters, a digit) — `=1234*7` → `=1234*` → … down to
wherever it drops below three qualifying characters — and once the leading `=`
itself is deleted, the **full default pool returns**: windows, applications and
the four menus, ranked against whatever plain text is left, with no
special-case flicker at the moment the `=` disappears. **Closes checkbox 4.**

### Step 4 — an unclaimed prefix is not swallowed

Type `!nonexistent`.

**Pass:** the full pool is searched against the literal text `!nonexistent` —
"No matches", since no entry's corpus contains a `!`. The point is *what* was
searched, not what it found: the `!` stayed in the field rather than being
stripped and handed to nothing.

Confirm by then typing `!fir`. **Pass, and read this one carefully: "No
matches" is the correct result, not Firefox appearing.** `score()`
(`lib/matching.js`) requires every typed character to occur, in order, in an
entry's name — `!` is not a character `"firefox"` contains, so the match fails
on the very first character and nothing is offered. That failure is the proof:
if the router had a bug that silently stripped an unrecognized leading
character rather than leaving it in the Query, `!fir` would degrade to
searching `fir` and Firefox **would** show up — which is the swallowed
behaviour this checkbox forbids. Seeing nothing is what confirms the `!`
survived into the match. **Closes checkbox 5.**

### Step 5 — a genuine collision, provoked on purpose

`routing.test.js` proves `problems()` catches a collision in isolation; this is
the same claim against the real pool, which currently has none to catch.

```bash
$EDITOR ~/dotfiles/quickshell/.config/quickshell/launcher/modules/WebSearch.qml
```

Temporarily change `readonly property string prefix: "@"` to `"="`, save, then:

```bash
df-qs-restart launcher --log
```

**Pass:** the log shows
`launcher: prefix routing: "=" is claimed by both calculator and web search`
(or the two names in the other order, depending on pool position) at load,
**before** anything is typed. **Closes checkbox 6.** Revert the change
afterward and restart once more to confirm the warning is gone.

### Step 6 — nothing else moved

Type `zed`, `logout`, and an empty Query, the way ticket 09's own verification
did.

**Pass:** each is exactly what it was before this ticket — the application (or
window, per ticket 20's rule), the menu entry found by keyword, the usual
most-used Entries. Prefix routing is invisible on every Query that does not
start with `=` or `@`.

Paste back: the log lines from steps 0 and 5, and a pass/fail line for steps
1–4 and 6.

## Comments

### Host round 1 — in progress

**Step 4 passed.** `!nonexistent` and `!fir` both read "No matches" — the
correct result, since `!` is not a character any entry's corpus contains and
the router left it in the Query rather than stripping it. **Closes checkbox
5.**

**Step 5 passed.** `WebSearch.qml`'s `prefix` was temporarily set to `"="`,
colliding with `Calculator.qml`'s own — the log showed
`launcher: prefix routing: "=" is claimed by both …` at load, both names
listed, before anything was typed. Reverted to `"@"` and restarted again: log
clean, warning gone. **Closes checkbox 6.**

Every restart across steps 4 and 5 also reached `Configuration Loaded` with no
QML error, which is step 0's own pass condition — the `calc`/`websearch`
self-id binding shape loads cleanly.

### Host round 2 — steps 1–3, reported as a blanket pass

Reported working on the Arch host as a blanket pass rather than pasted
per-step output, which mirrors how ticket 10 closed its own runtime
checkboxes. `fir` offered Firefox with no search row and `@fir` narrowed to
exactly the one `Search: fir` row; `=1234*7` produced only the calculator's
result and `=1` produced none; backspacing `=1234*7` down to empty tracked the
calculator row correctly and returned to the full default pool the moment the
leading `=` was deleted, with no stuck state or flicker. **Closes checkboxes 1,
3 and 4.**

All six checkboxes are now closed. The one thing this ticket left open on
purpose rather than closing — a prefix for the four static menus — is not a
checkbox here; see "The four static menus get no prefix" above for why, and
for the pointer to where that gap actually lives if it's still wanted.
