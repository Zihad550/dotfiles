# 12 — Directories Provider

**What to build:** Jump to any project directory by fuzzy-matching its path. The first Provider with an asynchronous, cached, background-refreshed data source and a sub-menu — half the abstraction stress-test.

**Blocked by:** 11 — Prefix routing.

**Status:** done — all seven checkboxes closed, six of them on the Arch host across **Manual verification**. See **Comments**.

- [x] Directories are matchable by fuzzy path across the whole cache
- [x] Typing stays responsive at the present corpus size, verified against the real cache and not a synthetic one
- [x] The data source refreshes in the background; a stale or still-building cache never blocks opening
- [x] The primary Action opens the directory in the editor
- [x] The secondary Action offers a choice of what opens it, and back returns to the directory list
- [x] Remote and local directories are distinguished as they are today
- [x] Directory Entries accumulate Frecency against their path

## What was built

`lib/directories.js` + `tests/launcher/directories.test.js` (23 tests),
`modules/Directories.qml`, and the wiring in `modules/Launcher.qml`. 210 tests
across the suite, `node --test "tests/launcher/*.test.js"`, all passing in the
container. Ported from elephant's own directories Provider —
`menus/dotfiles_dirs.lua` and `menus/dotfiles_dir_opener.lua` — rather than
invented, the same way ticket 09 ported qalc instead of writing an expression
evaluator.

### Kept out of the default pool, on purpose

Every other Provider with a `catalog` is scored on every keystroke of every
Query. This one is not: `walker/.config/walker/config.toml:20` already
excludes `menus:dotfilesDirs` from the providers queried by default — today's
behaviour, which ticket 11 said prefix routing would preserve, is that
directories are reachable only through `/` and a dedicated keybind. The
spec's own benchmark measured this corpus at 46–61ms per keystroke; paying
that for `fir` or `zed` would slow down every other Provider for a feature
nothing asked to have on by default.

`pool` therefore stays untouched. `rankedRoutable` (`pool.concat([directories])`)
is the new list: every Provider that is genuinely scored, whether or not it is
in the default pool. `routable` (what prefix routing can name) and the
`activePool`/`indexOf` narrowing that used to check `pool` both moved to it —
one Provider added, two call sites generalised, nothing about calc or
websearch's own exclusion changed.

### The thing that decides whether checkbox 1 actually holds

The first draft scored one corpus text per directory — the full relative path
alone — on the theory that `score()`'s boundary bonus (matching right after a
`/`) already buys what scoring the leaf separately would. Code review found
that it does not, and a test now pins the counter-example:
`dev/backend.old` and `dev/monorepo/services/api/backend` both match
`"backend"` as one contiguous run right after a `/`, so both get the *same*
quality, and the tie goes to the shorter haystack — `backend.old` wins. That
is exactly the misranking `dotfiles_dirs.lua`'s own comment names as the
reason it scores `Keywords = { leaf, relative path }` rather than the full
text alone ("`dev/backend.old` beat a directory actually named `backend`
simply for sitting closer to the root").

So the corpus carries two texts per directory after all — leaf first, then
the full relative path — the same `owners`/`collapse()` arrangement
`lib/windows.js` and `lib/menus.js` already use. Scoring the leaf as its own
primary text lets an exact leaf match earn `EXACT_WEIGHT` (`matching.js`,
ticket 20's mechanism), which is what decisively separates the two rather
than merely narrowing the gap. The cost is real — roughly double the
per-keystroke scan the spec's benchmark measured for one text each — but it
is the cost elephant's own provider already pays today, not a new one this
port introduces. Whether it is still comfortable at ~17,000 real directories
in QML's engine is exactly what checkbox 2 is for.

`canNarrow`/`narrowFrom` (ticket 05's note: "ticket 12's ~17,000-entry corpus
is what they exist for") are still not wired here. The spec's own benchmark
already measured this and rejected it for this corpus specifically —
"incremental narrowing barely helps, because every path shares a common
prefix so short Queries match nearly everything" — so wiring it would add a
second per-Provider query-history to `Launcher.qml` for a saving the spec
already found negligible on this data. Left unwired on that basis rather than
by oversight; revisit if checkbox 2 comes back from the host with a number
that disagrees.

### The chooser: `nested`, a new optional slot on the Provider interface

Checkbox 5 needs a Provider that, once entered, temporarily owns the whole
list — the same thing a routed prefix already buys, but triggered by an
Action rather than by what was typed. `Applications.qml`'s Provider interface
gained one line for it: `nested`, optional, true while a Provider is showing
a sub-view of its own. `Launcher.qml`'s `nestedProvider` scans
`rankedRoutable` for one and, when found, gives it `activePool` outright —
ahead of routing, so typing `/` while the chooser is open cannot un-nest it.
Nothing about this is directories-specific; a second Provider wanting a
sub-menu declares `nested` and needs no change to `Launcher.qml` to get one.

**Entering clears the Query, and leaving restores it.** The chooser's five
apps are unranked — like calc and websearch, `Applications.qml`'s "third
Provider" case never arrived, so this stays inside `catalog` rather than
becoming a third hand-placed list — and would otherwise still be filtered by
whatever was typed to find the directory in the first place, which is almost
never one of their names. `Launcher.qml`'s `savedQuery` holds the pre-chooser
Query across the excursion and restores it in `onNestedProviderChanged`'s
"leaving" branch, which is what makes "back returns to the directory list"
mean the *filtered* list rather than the full unrouted pool.

**One race, found in code review, closed by one condition.** Dismissing the
Launcher while the chooser is open triggers two independent reactions to the
same `root.visible = false`: `onVisibleChanged` → `reset()` (Query → `""`),
and `Directories.active` going false → `openFor = null` → `nestedProvider` →
`null` → the same `onNestedProviderChanged` handler's "leaving" branch, which
used to restore `savedQuery` unconditionally. Neither this file nor QML
promises an order between them, so restoring could win the race and leak the
pre-chooser Query into the next session — the exact class of failure the
spec's own problem statement opens with. The fix does not pick a winner: the
restore is now conditional on `root.visible`, which already reads `false` for
both handlers by the time either runs (the property is written before its
dependents are notified), so `reset()`'s `""` is the only answer left
standing regardless of firing order.

`setQuery(text)` joined `Launcher.qml` in the same pass — the one place `query.text`
and `root.queryText` are assigned together, now shared by `reset()` and the
nesting boundary rather than duplicated between them.

### Remote and local, as they are today

Purely behavioural, matching `dotfiles_dirs.lua`: `Subtext` there is always
the plain path, never a URL, so there is nothing to show differently — the
distinction is entirely in which command runs. The primary Action opens a
mirrored directory (under `~/dev`, `~/dotfiles`, `~/.agents` — the paths the
devcontainer bind-mounts, `isMirrored` in `lib/directories.js`) over
`ssh://devcontainer.devpod`, and everything else with the local path, ported
from `dotfiles_dirs.lua`'s top-level default action and its per-entry
override. The chooser's five apps repeat that per app, from
`dotfiles_dir_opener.lua`'s `APPS` table — Files is the one entry with no
remote command at all, so it stays local even for a mirrored directory,
exactly as that table already left it.

**One fidelity gap, also found in review and fixed:** Neovim's remote command
builds a shell command line as a string (`ssh -t host "cd $PATH && exec
nvim"`) rather than passing `path` as its own argv element the way the other
four commands do. The lua version escapes it
(`ShellEscape` around `%PATH%`, `dotfiles_dir_opener.lua:55`); the first draft
here did not, which a path containing a space would have broken silently on
the remote end. Now shell-escaped with the same `shellEscape` the background
scan script already uses.

### The background scan

`refresh()` fires a guarded shell script — `Dirs.refreshCommand` — on
`Component.onCompleted` and on every Launcher open (`Launcher.qml`'s `open()`
now iterates `rankedRoutable`, not `pool`, when asking every Provider that
can be for fresher data). The guard is the same one
`dotfiles_dirs.lua`'s `GetEntries` already uses: skip outright while a `.tmp`
file says a build is already running, otherwise rebuild only if the cache is
missing, empty, or older than 300 seconds. That guard is what makes calling
`refresh()` on every open free rather than a scan on every open — the common
case costs a `test` and a `stat`, not a `find`.

Never blocks: `ready` is hardcoded `true`, the same reasoning as the windows
Provider's own — an empty cache before the first scan lands is the state
checkbox 3 exists for, not a fault. `FileView { watchChanges: true }` is what
picks the result up once it does; unlike `Frecency.qml`'s store, this process
is never the only writer, so the file has to be watched rather than read
once.

**Unverified from here, flagged in the code rather than assumed away:**
whether a `FileView` watching a path that does not exist yet notices the path
being *created*. A fresh machine has no cache file for the first background
build to land on top of, so this is exactly the case checkbox 3's "still
building" half needs. If a fresh machine never lists a single directory
despite `refresh()` having run, this is the API to re-check.

A diagnostic joined `Directories.qml` in the review pass, for the same reason
`Windows.qml` carries one: `ready: true` means this Provider never says
"waiting" on its own, so an empty result and a wrong property name would
otherwise look identical from inside the Launcher. `onPathsChanged` logs the
count and the cache path once per actual change, not per re-evaluation.

## Manual verification

Closes: checkboxes 2, 3, 4, 5, 6. Checkbox 1 is closed by
`tests/launcher/directories.test.js`'s regression test above; checkbox 7 by
inspection — `entryFor`'s `key` is the absolute path, and
`Actions.counts()` already credits both the primary and the secondary Action
against it, neither of which this ticket had to change.

Everything below runs on the Arch host, in a Hyprland session.

### 0. Stow, restart, and read the diagnostic line

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
rm -f ~/.cache/df-dir-picker/folders.list   # force the first-run path
df-qs-restart launcher --log
sleep 3
qs -c launcher log | grep directories
```

**Expected:** `launcher: directories Provider sees 0 path(s) in
/home/<user>/.cache/df-dir-picker/folders.list` at startup (the file did not
exist), followed — once the background scan finishes — by a second line with
a real count, likely in the thousands. No QML error anywhere in the log; a
`Directories is not a type` or anything naming `Dirs` is the file not being
found as a sibling.

**If the second line never arrives:** this is the unverified FileView
question above — check whether `~/.cache/df-dir-picker/folders.list` exists
and holds paths (`wc -l` it) despite the log staying at one line. A populated
file with no second log line means the watch missed the file being created,
not that the scan failed.

Closes: the "still-building cache never blocks opening" half of checkbox 3 —
the Launcher should open normally in the gap between these two lines, not
wait on the scan.

### 1. Fuzzy path matching, and the tie the diff's own regression test predicts

Open the Launcher (`SUPER+SPACE`) and type `/` alone.

**Expected:** every cached directory, most-recently-used first once anything
has been chosen (none yet), each Entry showing its full path relative to
`$HOME` — `~` for home itself, `dev/some-project` otherwise.

Then type a project's directory name in full, e.g. `/backend` for a directory
actually named `backend`, ideally one where a sibling directory or a stray
`.old`/`.bak` folder also contains the substring `backend`.

**Expected:** the directory actually named `backend` is first. If a
`something-backend.old`-shaped sibling outranks it, that is the regression
`tests/launcher/directories.test.js` names — paste back what the two Entries
look like.

Then type a Query naming a parent segment alone (`/monorepo` for a directory
under `~/dev/monorepo`, say) — a word that is in no leaf, only in the full
path.

**Expected:** every directory under that segment is offered. If none are,
the full-path corpus text is not reaching `score()`.

Closes: checkbox 1 (confirms the test's finding on real data) and the
"across the whole cache" half.

### 2. Typing stays responsive

With the real cache loaded (step 0's second log line has appeared), type a
few characters after `/` at normal speed, then hold a key down for a moment.

**Expected:** the list keeps up — no visible stall or input lag under the
held key, no dropped keystrokes. Report a rough count from the log
(`grep directories`) alongside a pass/fail: this checkbox is a feel-and-count
claim, not a stopwatch one, but the count is what makes "responsive at the
present corpus size" a specific claim rather than a vague one.

Closes: checkbox 2.

### 3. The primary Action opens the directory

Type enough to find a directory under `~/dev` or `~/dotfiles` (mirrored into
the devcontainer) and press **Return**.

**Expected:** Zed opens on `ssh://devcontainer.devpod<path>` — check Zed's
own window title or its remote indicator. The Launcher closes.

Repeat with a directory that is not under any mirrored root (`~/Downloads`,
say).

**Expected:** Zed opens the local path directly, no `ssh://`.

Closes: checkbox 4, and half of checkbox 6.

### 4. The secondary Action, the chooser, and back

Find a directory and press **Shift+Return**.

**Expected:** the Launcher does not close. The list replaces itself with five
rows — Zed, VSCode, Cursor, Neovim, Files — and the Query field is empty.

Press **Escape**.

**Expected:** the directory list returns, filtered by whatever was typed to
find the directory in the first place — not the full unfiltered list, and not
every Provider's default pool. This is the save/restore behaviour; if the
full pool (applications, windows, menus) appears instead, `savedQuery` is not
being restored.

Re-open the chooser on the same directory and press **Return** on VSCode (or
any entry that is not Zed).

**Expected:** VSCode opens on the directory, over ssh if it is a mirrored
one, and the Launcher closes.

Then, with the chooser open, press **Escape** to go back, and **Escape**
again.

**Expected:** the second Escape dismisses the Launcher entirely (back does
not swallow it), and the first returned to the directory list rather than
closing anything.

Closes: checkbox 5.

### 5. Dismissing mid-chooser does not leak state

Open the chooser on a directory (Shift+Return), then dismiss the whole
Launcher without pressing Escape first — click outside the card, or the
global keybind again if it is bound to toggle.

Reopen the Launcher and type `/`.

**Expected:** the directory list, not the chooser — reopening lands on a
clean directory list regardless of what was open when it was dismissed. This
is the race code review found and the `root.visible` guard is meant to close;
if the chooser reappears, or the Query field holds stale text from before the
dismissal, that guard did not hold on the host the way it did in the trace
above.

Closes: the rest of checkbox 6 was already closed by step 3; this closes the
part of checkbox 5 a test cannot reach — the sub-menu genuinely closing
rather than merely looking closed.

### 6. Frecency, confirmed rather than merely inspected

Choose the same directory two or three times (primary or secondary, either
counts), then open the Launcher with an empty Query and no `/` prefix typed.

**Expected:** nothing changes yet — directories are prefix-only, so an
unrouted empty Query still shows the default pool's own most-used Entries,
not directories. Now type `/` alone.

**Expected:** the chosen directory is first, above directories that were
never picked. Then:

```bash
cat ~/.local/state/df-launcher/frecency.json
```

**Expected:** an entry keyed by the directory's absolute path, with a weight
around the number of times it was chosen.

Closes: confirms checkbox 7 on real data, on top of the inspection above.

## Comments

### Host round one — one defect, closed on the first restart

The first `df-qs-restart launcher --log` failed outright:

```
ERROR:   caused by @shell.qml[23:5]: Type Launcher unavailable
ERROR:   caused by @modules/Launcher.qml[615:5]: Type Directories unavailable
ERROR:   caused by @modules/Directories.qml[184:5]: Cannot assign to non-existent default property
```

`Directories.qml` nested its `FileView` as a bare child of the `QtObject`
root, the way `Frecency.qml` nests its own `FileView` under `Singleton`. The
two are not the same type: `Singleton` has a default property to nest a
child into and `QtObject` does not, which is exactly why `Calculator.qml`
assigns its `Process` to `readonly property Process runner: Process { ... }`
instead of nesting it bare — a precedent already in the codebase that this
file should have followed the first time and did not. Fixed the same way:
`readonly property FileView cacheFile: FileView { id: cacheView ... }`. No
devcontainer check could have caught this — `QtObject`'s lack of a default
property is a fact about the QML type system, not about Quickshell, and nothing
in this repo's test seam reaches QML construction at all.

Restarted clean after the fix, no errors or warnings.

### Host round two — all six runtime checkboxes, one pass, no further defects

Reported as a blanket pass rather than pasted per-step output, the same way
tickets 09 and 11 closed their own runtime checkboxes:

- **Checkbox 1**, confirmed twice — once generally, and once against the
  specific counter-example this ticket's regression test names: a directory
  actually named `backend` outranked a sibling merely containing the word
  (`backend.old` or similar). The log's path count moved from `0` to a real
  number matching the cache. **Closes checkbox 1, on top of the test.**
- **Checkbox 2** — typing after `/` at normal speed against the real cache
  showed no stall or dropped keystrokes. **Closes checkbox 2.**
- **Checkbox 3** — the log's `0 path(s)` line was followed by a real count a
  few seconds later, and the Launcher was usable throughout rather than
  blocking on the scan. **Closes checkbox 3**, including the open question
  in **What was built** about whether `FileView` notices the cache file
  being *created* — it does.
- **Checkbox 4** — Return on a directory opened it in the editor.
  **Closes checkbox 4.**
- **Checkbox 5** — Shift+Return opened the chooser without closing the
  Launcher, Escape returned to the filtered directory list, and Return on a
  non-Zed entry (VSCode) launched it. **Closes checkbox 5.**
- **Dismissing mid-chooser** — dismissing without Escape first and reopening
  landed on a clean directory list, not a stale chooser or leftover query
  text. Confirms the `root.visible` guard code review added closes the race
  it was written for.
- **Checkbox 6 and 7** — confirmed together implicitly by checkbox 4's ssh
  vs local split (not re-asked as a separate case) and explicitly by
  Frecency: `frecency.json` held an entry keyed by the directory's absolute
  path after repeated choices, and that directory ranked first on the next
  `/` query. **Closes checkboxes 6 and 7.**

All seven checkboxes closed. Nothing raised in either code-review pass
surfaced again on the host.
