# 09 — Calculator and web search Providers

**What to build:** Quick sums answered in place, and a Query that has no local answer sent out to the browser.

**Blocked by:** 04 — Type to filter, Enter to launch an application.

**Status:** done — all five closed, the four runtime ones verified on the host in
one round. No round spent on a defect; the one surprise in the output turned out
to be the verification block's own instruction. See **Comments**.

- [x] An arithmetic expression produces a result Entry
- [x] Activating the result puts it on the clipboard
- [x] A Query can be sent to a web search from the Launcher
- [x] Neither Provider accumulates Frecency, since neither produces recurring Entries
- [x] Neither floods the pool on Queries not meant for them — they match narrowly or not at all

## What was built

`lib/calc.js` + `tests/launcher/calc.test.js` (15 tests), `lib/websearch.js` +
`tests/launcher/websearch.test.js` (15), `modules/Calculator.qml`,
`modules/WebSearch.qml`, the wiring in `modules/Launcher.qml`, and the Provider
interface note in `modules/Applications.qml`, which had to grow the one variant
these two are. 174 tests across the suite,
`node --test "tests/launcher/*.test.js"`, all passing in the container.

**Neither Provider is ranked, and that is the ticket's one real design
decision.** Both generate their Entry *from* the Query, so there is nothing to
match them against: a corpus holding the Query holds a copy of the needle, and
`score()` gives a haystack equal to its needle both the highest quality there is
and the smallest length penalty there is. A web search row would therefore be
Entry #1 for every Query typed — `score("fir","fir")` is 37885 against
`score("firefox","fir")` at 37881 — which is exactly the flooding checkbox 5
forbids. So `Launcher.qml` places their Entries around the merged pool by hand
instead of scoring them, at the two ends elephant's own scores put them. Nothing
here produces a score, so "one scorer, one scale" is untouched rather than bent.

**The calculator goes above the pool and the web search below it**, which is not
symmetry for its own sake: elephant scores a calc result at `max_items + 1`
(`providers/calc/setup.go:234`), one above the cap on everything else, and a
websearch row at `1`. The first placement matters — appending the calculator
reads fine until an expression fuzzy-matches an application, and then Return
launches the application instead of copying the answer. `10 cm to inch` is not a
contrived Query.

**The web search is the Provider of last resort**, gated on `hasLocalAnswer` —
the ticket's own sentence, "a Query that has no local answer sent out to the
browser". Two things that gate had to account for:

- **A calculation still running counts as an answer.** qalc is a process, so
  there is a window between finishing typing `1234*7` and the answer arriving in
  which the calculator has no Entry. Without this the web search would own that
  window, be the only row, and therefore be highlighted — a Return landing in it
  opens Google instead of copying 8638. `Calculator.calculating` closes it.
- **A link does not wait for the gate at all.** Elephant scores a URL-shaped
  Query at 1000000 for the same reason: typing a URL is unambiguous. Offering to
  open a URL is behaviour walker has today, so leaving it out would be adding to
  a drop list the spec says has one entry on it — but it is worth naming as the
  one thing here no checkbox asked for.

One consequence worth stating: the "No matches" empty state is now unreachable
for any non-empty Query.

**Note for anyone re-reading elephant's websearch defaults.** `always_show_default`
and `engines_as_actions` carry `default:"true"` tags, and neither is what has
been running: `LoadConfig` seeds koanf from the *struct literal*
(`pkg/common/config.go:79`), where both are `false`, and this machine has no
`websearch.toml` to override them. With `engines_as_actions` false and more than
one Provider queried, elephant's websearch emits **nothing** but the URL row
(`providers/websearch/setup.go:264-284`) — a plain search is reachable only
through the `@` prefix. So the gate here is more generous than what it replaces,
not less, and the `@` prefix itself remains ticket 11's.

**qalc is kept.** Elephant's calc provider is "Calculator/Unit-Conversion" and
shells out to libqalculate (`providers/calc/setup.go:131`), so `10 cm to inch`
and currency conversion are things this answers today. Writing an expression
evaluator here instead would silently add both to a drop list the spec says has
exactly one entry on it (the symbol picker). Consequence acted on **in this
ticket**: `libqalculate` was installed only by
`setup/arch-hyprland/setup-packages/setup-walker`, which ticket 19 deletes, so it
moved into `packages/pacman-packages` — otherwise 19 silently breaks the
calculator on the next fresh machine.

**The narrowing rules are elephant's defaults**, since this machine never wrote a
`calc.toml` or `websearch.toml`: at least 3 characters and at least one digit for
calc (`min_chars`, `require_number`), Google and `xdg-open` for websearch. One
deliberate deviation, narrower rather than wider: a host needs a dot *and* an
alphabetic last label, because elephant's dot-only rule would offer `1.5` and
`3.14` as websites — the exact Queries the calculator exists for.

Two Actions from elephant are deliberately not ported: calc's save-to-history
(only reachable through the `=` prefix, which is ticket 11's, and no user story
asks for it) and websearch's engines-as-actions (there is one engine).

## Manual verification

Closes: **"An arithmetic expression produces a result Entry"**, **"Activating the
result puts it on the clipboard"**, **"A Query can be sent to a web search from
the Launcher"**, and **"Neither floods the pool on Queries not meant for them"**.

The last of those is closed by step 4 rather than by the tests, deliberately.
The *matching* rules are pure functions and are covered — 30 tests over which
Queries either Provider answers — but "does not flood the pool" is a claim about
what is on the screen, and where the two Providers sit is Launcher wiring that
no test in this container can exercise.

Everything below runs on the Arch host, in a Hyprland session.

### Step 0 — qalc exists

```bash
qalc -t "10 cm to inch"
```

**Pass:** `3.93701 in`. A `command not found` means the package move above has
not been applied to this machine yet — `sudo pacman -S --noconfirm libqalculate`
fixes it, and nothing below will work until it does.

### Step 1 — it still starts

```bash
cd ~/dotfiles && scripts/stow/stow-base && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, with no QML error. Two errors specifically are
what this step exists to catch, because both are APIs no devcontainer could
check:

- anything naming `StdioCollector`, `onStreamFinished` or `text` — the way the
  calculator reads qalc's output
- `Calculator is not a type` / `WebSearch is not a type` — the new files not
  being found as siblings

Trap: a QML error on a hot reload leaves the **previous** instance running, so a
broken file looks like nothing happening. `df-qs-restart` kills the old instance
first, which is what rules that out.

### Step 2 — an expression produces a result, and Return copies it

Open the Launcher (`SUPER+SPACE`) and type `1234*7`. Then **press Escape and
reopen it** before the next one, and again before the third: `10 cm to inch`,
then `100/3`. Clearing the Query between them is the whole point of doing three,
and the first run of this block did not — see **Comments**.

**Pass:** a row appears whose main line is the answer (`8638`, `3.93701 in`,
`33.33333`) and whose sub-line is the expression, with `⏎ copy result` in the
footer.

**The trap this second and third expression are here for:** if the answers ever
read as two results run together — `86383.93701 in` — the output buffer is not
being cleared between runs, which is a wrong answer shown confidently and the
one failure mode worth catching by eye. Report it rather than working around it.

Then press Return on the `100/3` row and paste somewhere:

```bash
wl-paste
```

**Pass:** `33.33333`, and the Launcher closed. **Closes checkboxes 1 and 2.**

Also type `-5*1`, press Return, and `wl-paste` again — **pass:** `-5`, not an
error and not empty. That is the negative result reaching `wl-copy` through
stdin rather than as something that looks like a flag.

**The race worth trying to lose on purpose.** Type `98765*4321` and press Return
as fast as possible after the last keystroke — no pause to read the row.

**Pass:** `wl-paste` gives `426724565`, and the browser did not open. Failing
here means the web search owned Return in the window before qalc answered, which
is what `Calculator.calculating` exists to prevent; it would show up as a Google
tab for the expression and an unchanged clipboard.

### Step 3 — a Query with no local answer goes to the browser

Open the Launcher and type `how tall is a giraffe`.

**Pass:** exactly one row, `Search: how tall is a giraffe`, sub-line `Google`,
footer `⏎ open in browser`. Return opens the browser on a Google results page
for that phrase. **Closes checkbox 3.**

Then type `github.com/quickshell-mirror/quickshell`.

**Pass:** the row reads `Open: https://github.com/quickshell-mirror/quickshell`
(not `Search:`), and Return opens that page rather than searching for the text.

### Step 4 — neither Provider is in the way

Checkbox 5, which only a screen can close. Type each of these and look at what is
*first*:

- `fir` → Firefox, or whichever browser is installed. **No `Search:` row at
  all** — something local answered, so the web search stays out.
- `zed` → Zed. Same: no search row.
- `1password` → the application. A digit and four characters, so the calculator
  did run qalc on it; qalc hands unparseable input back and that is thrown away,
  so **no calculator row**. Expected, not a fault: for the length of that run the
  web search is held back too, so a digit-bearing application name is one of the
  few Queries where a `Search:` row can appear a beat late.
- empty Query → the usual most-used Entries, with **no calculator or search row**
  at the bottom.

Then the case the calculator's placement exists for: type `10 cm to inch`.

**Pass:** the result row `3.93701 in` is **first**, above anything that happens
to fuzzy-match those letters, so Return copies the answer.

**Pass overall:** each first row is what it was before this ticket except where
an expression was typed, and the two new Providers are invisible except where
they were asked for. **Closes checkbox 5.**

## Comments

### Host round 1 — all four runtime checkboxes, one round

**Steps 0, 1, 3 and 4 passed as written.** qalc is present, the config loads with
no QML error — so `StdioCollector`, `onStreamFinished` and `.text` are the right
API, which was the largest unverifiable risk in this ticket — the browser opens
for a Query nothing local answers, a link opens as a link, and neither Provider
is in the way of `fir`, `zed`, `1password` or an empty Query. **Closes checkboxes
3 and 5.**

**Step 2 passed too, including the race.** The clipboard receives the result,
`-5*1` copies `-5` rather than failing on something that looks like a flag, and
Return pressed as fast as possible after the last keystroke of a long expression
copies the answer rather than opening a browser. **Closes checkboxes 1 and 2.**

**The one surprising output was the block's fault, not the code's.** Step 2 asked
for three expressions in a row and got back a single answer:

    (10348.11024 / 3)(100 in)

That is not two results run together — it is the correct answer to
`1234*710 cm to inch100/3`, which is the three expressions concatenated. The
instruction said "select all and type", the Query was never cleared, and qalc
faithfully converted 876140 cm into units of one-third-of-a-hundred inches:
344937.00787 in × 3 ÷ 100 = 10348.11024, exactly the number that came back.

Worth writing down because it *rules out* the failure the step was watching for.
A `StdioCollector` that accumulated across runs would have produced
`86383.93701 in` — two answers with no expression that yields them. One coherent
answer to one long Query is the opposite finding: the buffer is cleared between
runs, which was the trap this ticket could not close from the container.

The step now says to press Escape and reopen between expressions. `Ctrl+A` does
reach the field as an unresolved chord and fall through to Qt's own select-all,
so it was not wrong — but a verification step should not depend on a detail like
that being true.

### Follow-up raised in the same round

Typing `zed` offers the running Zed *window* above the Zed *application*, and the
application is what was wanted: the Query is exactly its name. That is ticket 05's
pool-order decision meeting a case it did not anticipate, not a fault in this
ticket. Split out as **ticket 20 — An exact name match outranks a window**.
