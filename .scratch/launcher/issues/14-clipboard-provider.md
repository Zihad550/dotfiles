# 14 — Clipboard Provider

**What to build:** Clipboard history reachable from the Launcher, replacing the separate tool behind its own keybind.

**Blocked by:** 11 — Prefix routing.

**Status:** verified on host — every checkbox below was exercised for real,
not just under test. See **What was built** and **Manual verification**.

- [x] Clipboard history appears as Entries, most recent first
- [x] Selecting an Entry puts it back on the clipboard
- [x] The existing dedicated keybind opens the Launcher directly on this Provider
- [x] Image entries are distinguishable from text rather than shown as noise
- [x] Long entries are truncated for display without corrupting what is pasted

Two host-only bugs surfaced during verification and were fixed outside this
Provider's own files:

- **The image checkbox failed against real image data at first**: a browser's
  "Copy Image" puts more than one representation on the clipboard (an
  `image/png` and a `text/html` snippet), and the single unqualified
  `wl-paste --watch cliphist store` in `autostart.lua` was free to negotiate
  either one — it was picking the HTML. Split into two watchers, each pinned
  with `--type`, in `hypr/.config/hypr/lua/autostart.lua`.
- **The dedicated keybind did nothing at first**: `SUPER + CTRL + V` was
  already bound to `voxtype record start` in
  `hypr/.config/hypr/lua/bindings/utilities.lua`, predating this ticket, and
  Hyprland fired that instead of the clipboard manager bind on the same
  combo. Disabled in favor of the clipboard manager.

Also added, past the five checkboxes, at the user's request: a `clear
history` extra Action (`Ctrl+X`) running `cliphist wipe`, refreshing the list
once the wipe actually finishes rather than racing it. See `clearCommand` in
`lib/clipboard.js` and the `wiper` Process in `Clipboard.qml`.

And a `delete entry` extra Action (`Alt+D` -- not `Ctrl+D`, which Qt's own
text-field editing claims as "delete character forward" before the chord
ever sees it) running `cliphist delete` against the highlighted Entry alone.

`cliphist delete`'s own `--help` line reads as if the id were a plain
argument (`cliphist delete id`), but on a real host that invocation hangs
forever: `delete`, like `decode`, actually reads the id-and-preview line off
stdin, and passing the id as an argument instead leaves it waiting on stdin
it was never given. `deleteArgv` pipes `target.raw` through the same way
`copyArgv` already does, and completes.

Refresh is queued rather than dropped if it lands while `finder` (the
listing Process) is already mid-run -- both `wiper` and `remover` trigger a
refresh from their own `onExited`, and one of those landing during an
in-flight `open()` refresh would otherwise silently leave a just-deleted
entry on screen. See `deleteArgv` in `lib/clipboard.js`, the `remover`
Process, and `refreshPending` in `Clipboard.qml`.

## What was built

`lib/clipboard.js` + `tests/launcher/clipboard.test.js` (20 tests, three of
them added for `clear history`/`delete entry`), `modules/Clipboard.qml`,
the wiring in `modules/Launcher.qml` and `shell.qml`, the keybind switch in
`hypr/.config/hypr/lua/bindings/clipboard.lua`, and two pieces of
infrastructure this ticket implies but its checkboxes don't state: `cliphist`
added to `setup/arch-hyprland/packages/pacman-packages`, and its watchers
(`wl-paste --type text|image --watch cliphist store`) added to
`hypr/.config/hypr/lua/autostart.lua`.
249 tests across the suite, `node --test "tests/launcher/*.test.js"`, all
passing.

**cliphist, not elephant's own clipboard daemon, is what stores history.**
Elephant has one (`internal/providers/clipboard/clipboard.go`) — a
`wl-paste --watch` loop feeding a gob file — but the spec says outright
"Elephant is not retained as a backend", and ticket 19 deletes it. Writing a
second clipboard-history daemon into this shell would be real infrastructure a
ticket whose checkboxes are all about display and paste has no business
growing. cliphist is walker's own tool for this
(`walker/.config/walker/config.toml:102`) and is exactly the "Providers
fetching their data through a process" pattern the spec already endorses for
the dmenu scripts — the same shape `screenshots.js` is, with `find` swapped for
`cliphist list`. **Consequence acted on in this ticket, the same move ticket
09 made for `libqalculate`:** `cliphist` was not installed anywhere this repo
manages, so it moved into `packages/pacman-packages` and its watcher into
`autostart.lua` — otherwise this Provider opens to a permanently empty history
on a fresh machine, and worse, silently, since `ready: true` never says so.
**Elephant's existing clipboard history is not migrated.** It lives in a gob
file only elephant's own code reads; a fresh cliphist store starts empty the
first session this ships.

**No Entry Key, and this ticket reaches that conclusion from a new angle.**
Screenshots.qml's own header made the case once already: a key would let a
re-copied Entry climb above ones copied since, turning "most recent first"
into "most used first" the moment Frecency has anything to accumulate. Here
it is sharper, because re-pasting the same clipboard entry is not an edge
case — pasting your own email address five times is five genuine choices of
the same row, not a bug to guard against — so the failure mode this avoids is
not rare. `Matching.prepare(built.texts, null)`, no `keys`.

**Ranked, unlike calc and websearch — reachable and *searched* through its own
prefix.** Clipboard has a real `catalog`, the same shape directories and
screenshots have, so typing after `$` fuzzy-matches history content rather
than only ever showing the full unranked list. Kept out of `pool` for the same
reason directories is: scoring the whole history against every keystroke of
every other Query costs time no unrelated Query should pay, and walker's own
config reaches clipboard only through its `$` prefix too
(`CONTEXT.md`'s own Language section already names the character). Added to
`rankedRoutable`, which is what makes it get `refresh()` on every open the
same way directories and screenshots do, and what makes prefix routing and
`Routing.problems()`'s load-time collision check see it.

**The corpus text is the full preview, not the truncated display name** — so
narrowing past character 80 still matches, even though the row on screen cuts
off there. An image's corpus text is the plain word `"image"` rather than
cliphist's own bracket-marker text, so typing "image" finds it and the
marker's own punctuation is not something a Query has to happen to contain.

**Checkbox 4 — image entries read as "Image", not as cliphist's own
`[[ binary data … ]]` marker.** `entryFor` recognises the marker
(`BINARY_RE`) and turns it into `name: "Image"`, `subtext` carrying whatever
cliphist itself said between the brackets (size, format) rather than being
dropped. Printing the marker verbatim would be exactly the noise the checkbox
forbids, not a fix for it.

**Checkbox 5 is closed by identity, not by the truncation function on its
own.** `truncate()` (80 characters, collapsing embedded whitespace including a
genuine newline in a multi-line text entry) governs only what an Entry
*displays*. What a paste sends to the clipboard is `raw` — the whole
`cliphist list` line, id and preview together, untouched — so a paste can
never be shorter than what was actually copied; the two are structurally
different values from the moment `parseLine` produces them, not one value
edited down and back up.

**Why `raw` is the whole line, and not just an id.** `cliphist decode` reads a
line off its own stdin in the same id-then-preview shape `cliphist list`
printed it in — the way every integration script (rofi, wofi, walker) pipes a
picker's *chosen line* straight into `decode`, not an id passed as an
argument. `copyArgv` is `printf "%s\n" "$1" | cliphist decode | wl-copy`, with
`raw` travelling as `$1` — never interpolated into the script string, so a
copied line carrying a quote or a `$(` cannot break out of it, the same
reasoning as `calc.js`'s own `copyArgv`.

**Checkbox 2 for an image needs a temp file, not a straight pipe — and its own
function, not a flag on `copyArgv`.** `wl-copy` with no `--type` defaults to
plain text, which would put image bytes on the clipboard under the wrong mime
type — every image-consuming paste target would refuse them. The mime type has
to be sniffed off the actual bytes (`file -b --mime-type`), the same approach
`screenshots.js`'s own `copyImageArgv` already uses on a real file — but
`cliphist decode`'s output has no file of its own to sniff until one is made,
so `copyImageArgv` decodes to a `mktemp` file first, sniffs that, and copies
from it, removed by `trap … EXIT` regardless of how the pipeline ends. Split
from `copyArgv` into its own function during review — the two pipelines share
nothing but `raw`, so a boolean flag choosing between them was picking between
two unrelated scripts rather than varying one, and `screenshots.js` already
established the two-function shape for exactly this split (`copyImageArgv` /
`copyPathsArgv`, no flag). **The image pipeline is the one line of runtime
behaviour this ticket is least sure of without a host** — see Manual
verification, step 3.

**No `mark`, no `secondary`, no `layout`.** Elephant's own clipboard provider
offers delete, pin, edit and an images-only mode; none of that is asked for by
this ticket's five checkboxes, so none of it is ported. Said here rather than
left to be found, the same house style as 09's dropped calc-history Action and
11's dropped menu prefix.

**`Launcher.openOn(prefix)`, the dedicated keybind's own entry point —
checkbox 3.** Opens (or leaves open, if already open), sets the Query to the
Provider's own prefix, and calls `highlightFirst()` explicitly rather than
leaving it to the Query field's own `onTextChanged` — the same reason
`reset()` already calls it explicitly after `setQuery("")`: assigning text
that is already there fires no change signal, so pressing the dedicated
keybind a second time in a row would otherwise leave the highlight wherever it
last was.

**A nested Provider outranks routing, and `openOn` found that the hard way in
review.** `activePool` (`Launcher.qml`) gives a nested Provider the whole pool
regardless of what the Query says — ticket 12's own rule, so that typing "/"
while directories' chooser is open cannot un-nest it. `openOn("$")` setting the
Query to `"$"` does not by itself touch that: pressed while the chooser is
open, the Query would have silently become `"$"` underneath a view still
locked to the chooser, missing checkbox 3's whole promise in exactly the one
case a routed prefix alone cannot reach. Fixed by dismissing first when
`root.nestedProvider !== null` — `dismiss()` is what already closes a chooser
today (`Directories.qml`'s own `active: root.visible` clears `openFor` the
moment the Launcher goes invisible), so this reuses that existing path rather
than reaching into a Provider's own nested state from outside it. Skipped when
nothing is nested, which is every ordinary press of the keybind, so the common
case pays no extra flicker.

`shell.qml` gets a second `GlobalShortcut` (`appid: "launcher"`,
`name: "clipboard"`) alongside `"toggle"`, and
`hypr/.config/hypr/lua/bindings/clipboard.lua`'s `SUPER+CTRL+V` now dispatches
`hl.dsp.global("launcher:clipboard")` in place of the old
`df-launch-walker -m clipboard` exec — the line that actually closes
"replacing the separate tool behind its own keybind." `df-launch-walker`
itself is untouched; deleting walker's own helper scripts is ticket 19's.

## Manual verification

Nothing below can run in this container: `cliphist`, `wl-paste` and `wl-copy`
are all absent from it (confirmed by `which`), and the pure module's 20 tests
already close everything that does not require them — the parsing, the
image-marker recognition, the truncation, and the argv shapes. Every checkbox
here was a claim about what actually happens on the Wayland session; all five
are now checked above, run for real on the Arch host, along with the two
extras added after.

### Step 0 — the watcher exists and the config loads

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
hyprctl dispatch exec true  # reload hyprland.lua if bindings changed without a full restart
pgrep -a cliphist
```

**Pass:** `Configuration Loaded`, no QML error (`Clipboard is not a type` would
mean the new file is not being found as a sibling), and `pgrep` shows
`wl-paste --watch cliphist store` running. If the watcher line is missing from
a running session, log out and back in, or run it by hand once to confirm the
command itself is right before chasing the autostart wiring.

### Step 1 — history appears, most recent first

```bash
printf 'first' | wl-copy && sleep 1
printf 'second' | wl-copy && sleep 1
printf 'third' | wl-copy
```

Open the Launcher and type `$`.

**Pass:** three rows, `third` above `second` above `first`. **Closes checkbox
1** — and is also the check on `parseListing`'s own assumption that
`cliphist list` prints newest-first with no re-sort needed here: if the order
comes back reversed or shuffled, that assumption is what broke, not the
parsing.

### Step 2 — selecting an Entry pastes it back, text

With the three rows from step 1 still showing, arrow to `second` and press
Return.

```bash
wl-paste
```

**Pass:** `second`, and the Launcher closed. **Closes checkbox 2** for text.
Then re-copy something with a quote and a `$(` in it deliberately —
`printf 'a "quote" and $(a subshell)' | wl-copy` — reach it through `$`, and
paste it back the same way. **Pass:** the exact string, unmangled — the check
that `raw` truly never touches the command string as text.

### Step 3 — selecting an image Entry pastes it back as an image, not as text

```bash
grim -g "$(slurp)" - | wl-copy
```

(or copy any image another way). Open the Launcher, type `$`, and find the row
reading `Image`.

**Pass:** the row says `Image`, not a `[[ binary data … ]]` line — closes
checkbox 4 together with step 4 below. Press Return, then:

```bash
wl-paste --list-types
```

**Pass:** `image/png` (or whatever format was copied) is listed, **not**
`text/plain`. This is the step most likely to fail: if `--type` is missing or
wrong, `wl-paste --list-types` reading `text/plain;charset=utf-8` for what was
plainly an image is the failure `copyArgv`'s temp-file-and-`file`-sniff path
exists to prevent. Confirm the pasted bytes are still a valid image by piping
`wl-paste -t image/png` (or the format shown) into a file and opening it.
**Closes checkbox 2** for images.

### Step 4 — image entries read as entries, not as noise

Already exercised by step 3's first pass condition. Confirm once more
alongside several text entries in the same list: scrolling through `$` should
read as "some rows are `Image`, subtext a size and a format; the rest are
text, previews"— never a row showing `[[ binary data` verbatim. **Closes
checkbox 4.**

### Step 5 — long entries are truncated for display, and paste whole

```bash
python3 -c "print('x' * 500)" | wl-copy
```

Open the Launcher, type `$`. **Pass:** the row shows a single line ending in
`…`, not 500 characters wrapped or overflowing the card. Press Return:

```bash
wl-paste | wc -c
```

**Pass:** `500` (or 501 with a trailing newline, depending on how the shell
above added one) — the full string, not the ~80-character truncated display
text. **Closes checkbox 5.**

Also copy something with an embedded newline —
`printf 'line one\nline two' | wl-copy` — and check it through `$`. **Pass:**
the row reads as one line (`line one line two`, collapsed), and `wl-paste`
after selecting it prints the original two lines back, newline intact.

### Step 6 — the dedicated keybind opens straight to this Provider

Close the Launcher entirely (Escape from a default, unrouted view, so nothing
carries over). Press `SUPER+CTRL+V`.

**Pass:** the Launcher opens with the Query already `$` and the clipboard list
showing — no keystroke needed to reach it. **Closes checkbox 3.** Then, with
it still open on `$`, press `SUPER+CTRL+V` again.

**Pass:** nothing changes — still on `$`, highlight still on the first row.
The point of this second press: `openOn` calls `highlightFirst()` explicitly
because assigning a Query that is already there fires no change signal on its
own, and this is what proves that call is doing something rather than being
dead code.

Then the case review found: type `/` to open directories, arrow to any
directory and press `Shift+Return` to open its "open with" chooser (still
nested inside it — do not press Escape). With the chooser visibly still open,
press `SUPER+CTRL+V`.

**Pass:** the chooser closes and the Launcher lands on `$` with the clipboard
list showing, the same as the first part of this step. **Fail** would be the
chooser still showing while the Query field itself reads `$` underneath it —
the exact gap `openOn`'s dismiss-first branch exists to close.

### Step 7 — nothing else moved

Type `fir`, `zed`, `1234*7`, and an empty Query.

**Pass:** each is exactly what it was before this ticket — clipboard is
reachable only through `$`, and does not appear, rank, or cost anything on a
Query that never asked for it.

Paste back: the `pgrep` line from step 0, and a pass/fail line for steps 1–7.
