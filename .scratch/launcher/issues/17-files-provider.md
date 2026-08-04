# 17 — Files Provider

**What to build:** Find a file inside a matched folder without navigating to it first.

**Blocked by:** 11 — Prefix routing.

**Status:** done — all four checkboxes closed on the Arch host, and closed a second time across the re-run **Manual verification** demanded by the code review. See **Comments**.

- [x] Typing a folder name lists matching folders each followed by their contents
- [x] An empty Query lists nothing, as it does today — this is deliberate, not a bug
- [x] Primary opens the file in the editor; secondary offers a choice of what opens it
- [x] Shares the directory data source rather than building a second index

## What was built

`lib/files.js` + `tests/launcher/files.test.js` (27 tests), `modules/Files.qml`,
and the wiring in `modules/Launcher.qml` (one new Provider in `rankedRoutable`,
an `ordered` branch in `scoredEntries`, the `Files` component bound like
`Directories`). 376 tests across the suite, `node --test
"tests/launcher/*.test.js"`, all passing in the container. Ported from
elephant's own files Provider — `menus/dotfiles_files.lua` and
`menus/dotfiles_file_opener.lua` — rather than invented.

Checkbox 4 is closed here: `Files.qml` reads `Dirs.cachePath` through
`Dirs.parseCache`, the same file and the same parser `Directories.qml` uses,
watched by a second `FileView` on the same path — no second index anywhere in
`lib/files.js`.

### The one structural difference: an `ordered` catalog

Every other catalog is a corpus scored by `lib/matching.js` on every
keystroke. The files *listing* cannot be: its Entries come in an order score()
cannot express — each matched folder immediately followed by its own contents —
and a child that matches the Query well would be ranked up and out from under
its parent if every Entry were scored independently. So that branch of the
catalog is `{ entries, ordered: true }`, the first on the interface:
`scoredEntries` in `Launcher.qml` skips rank() for it and hands every Entry an
equal score, which is what makes merge() keep encounter order — the catalog's
own order. Sound only because such a catalog never merges with another
Provider: files is prefix-only (`~`, the same character walker's own config
already routes to `menus:dotfilesFiles`,
`walker/.config/walker/config.toml:84-87`), so `activePool` is `[files]`
whenever it is ranked at all. The chooser branch is *not* ordered — it carries
an ordinary `Matching.prepare` corpus, exactly as the directories chooser does,
so typing narrows the five commands. The interface doc in `Applications.qml`
gained a paragraph for all of this, and `CONTEXT.md` an **Ordered Provider**
glossary entry.

Nothing bounds an ordered catalog's length for it: merge() keeps only its first
`DEFAULT_LIMIT` (200) Entries and there are no scores to decide which, so a
Provider that can produce many has to cap them itself. Hence `MAX_CHILDREN`
(16) below — without it a single folder holding 200 files would take the whole
budget and hide every folder matched after it, which elephant never had to
worry about because it re-ranks whatever `GetEntries` returns.

### Folder-first selection, then one `find` per Query

The folders come from the shared cache synchronously — matching is the lua's
own: plain substring, spanning whole paths only when the Query contains `/`,
four ranks (exact leaf, leaf prefix, leaf substring, anywhere in the path),
ties by shallower relative path then lexicographic, capped at `MAX_DIRS` (40).
Their contents are the immediate children of the top `MAX_EXPAND` (10) matched
folders, read by a single `find -printf '%y %p\n'` — one fork for ten folders,
children parsed into a parent-keyed map, at most `MAX_CHILDREN` (16) of each
folder's listed, by path. Folder rows render instantly; contents pop in when
the find lands. `40 + 10 × 16 = 200` is exactly merge()'s limit, so every
matched folder always survives to the list.

The find is re-asked on a keystroke *and* on the cache changing under it: this
Provider does not own the refresh, so a scan landing after the Query was typed
would otherwise leave folder rows with no contents until the next keystroke.

**Stale-by-design and safe by construction:** the finder keeps at most one
process in flight (a request during a run sets a pending flag that drains,
through `Qt.callLater`, once the process has actually settled — draining in
`onExited` directly would re-set the flag against a process still marked
running and strand it), and a listing left over from an older Query is
harmless —
the catalog only consults children of folders the *current* Query matches,
and those children are still that folder's children. The alternative —
discarding a stale run — would make the list flicker empty between
keystrokes.

### The actions, ported from dotfiles_files.lua's default and the APPS table

Primary: `zeditor` over `ssh://devcontainer.devpod<path>` for a mirrored path
(under `~/dev`, `~/dotfiles`, `~/.agents`), local otherwise. Secondary opens
the chooser (Shift+Return): Zed, VSCode, Cursor, Neovim, Reveal in Files —
the same five-command shape as the directories chooser, with the two
differences the opener lua itself carries: `%DIR%` is the file's *parent*
(never the file where a directory is expected), and Reveal in Files
(`nautilus --select`) has no remote command, so it reveals locally even for a
mirrored path. Neovim's remote form is shell-escaped, the fidelity gap ticket
12's review found, closed the same way here. Entries carry no Entry Key —
files are not Frecency-tracked, the same as the lua.

## Manual verification

Closes: checkboxes 1, 2, 3. Checkbox 4 is closed by inspection (the code
above) and step 0 confirms it behaviorally. Everything below runs on the Arch
host, in a Hyprland session, with the launcher on `SUPER+SPACE`.

### 0. Stow, restart, and read the two diagnostic lines

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
sleep 3
qs -c launcher log | grep -E "directories|files"
```

**Expected:** two lines naming the same cache file with the same count —
`launcher: directories Provider sees N path(s) in /home/<user>/.cache/df-dir-picker/folders.list` and the identical `launcher: files Provider sees N path(s)` line. No QML error anywhere in the log; a `Files is not a type` or anything naming `Files`/`Dirs` is the file not being found as a sibling.

Closes: the behavioral half of checkbox 4 — one file, two readers, same count.

### 1. Folder-name listing, and the empty Query

Open the Launcher and type `~` alone.

**Expected:** nothing listed — no folders, no contents, no fallback pool. This is checkbox 2, deliberate (the same as today).

Now type `~dot` (or another prefix matching a folder name you know is cached).

**Expected:** the matching folder row appears immediately — its full path relative to `$HOME`, trailing `/` — followed a beat later by its immediate contents (one level only), each a full relative path, folders with trailing `/`. Folder rows render before their contents; that gap is the find, not a bug.

Type a name you expect several folders to match, e.g. `~backend` where a directory is actually named `backend`.

**Expected:** folders actually named `backend` come first, then ones merely starting with it, then ones merely containing it; equal ranks in order of depth (shallower first). A folder and a file of the same name both appear, the folder first with its trailing `/`.

Closes: checkbox 1.

### 2. The primary Action, the chooser, and back

Type enough to find a file under `~/dotfiles` and press **Return** on it.

**Expected:** Zed opens on `ssh://devcontainer.devpod<path>` (check Zed's remote indicator) and the Launcher closes. Repeat with a file under a non-mirrored root (`~/Downloads`, say): **Expected:** Zed opens the local path, no `ssh://`.

Press **Shift+Return** on a file instead.

**Expected:** the Launcher stays open and the list becomes five rows — Zed, VSCode, Cursor, Neovim, Reveal in Files — with the Query field empty. Each row's subtext is the target it will open: `ssh://devcontainer.devpod<path>` for a mirrored file, the plain path otherwise, except Reveal in Files which always shows the plain path.

With the chooser open, type `vs`.

**Expected:** the five rows narrow to VSCode. This is the review fix — the chooser used to be an `ordered` catalog and typing did nothing to it. Clear the Query again before continuing; the five rows come back.

Press **Escape**.

**Expected:** the folder listing returns, still filtered by what you typed — not the full list and not the default pool. This is the save/restore behaviour; if the default pool appears instead, `savedQuery` is not being restored.

Re-open the chooser and press **Return** on Neovim.

**Expected:** ghostty opens, `ssh -t devcontainer.devpod "cd <parent> && exec nvim <path>"` for a mirrored file, local ghostty `--working-directory=<parent>` otherwise — the file opens in its parent's working directory. Repeat with Reveal in Files: **Expected:** nautilus reveals the file, local even for a mirrored one.

Then, with the chooser open, **Escape** twice.

**Expected:** the first Escape returns to the folder listing, the second dismisses the Launcher entirely.

Finally, open the chooser and dismiss the Launcher *without* pressing Escape (click outside the card). Reopen it.

**Expected:** a clean listing, not a stale chooser — the same dismissal race ticket 12's review found, closed the same way here (`active` clearing `openFor`).

Closes: checkbox 3.

### 3. A cache that lands *after* the Query is typed

The one race the earlier pass could not stage. Throw the cache away, restart,
and type before the rescan finishes:

```bash
rm -f ~/.cache/df-dir-picker/folders.list
df-qs-restart launcher --log
```

Now open the Launcher immediately and type `~dot` — within a second or two of
the restart, before the background scan lands.

**Expected:** nothing at first (the cache is empty). Then, when the scan lands,
the matching folder rows appear **and their contents fill in with them** —
without you touching the keyboard again.

**The failure this tests for:** folder rows appearing on their own and staying
contentless until the next keystroke. That was the behaviour before the review
fix (`onPathsChanged` re-asking the finder, not just the keystroke). If the
scan lands too fast to see the gap, type a slower Query (`~b`, then extend it)
right after the restart and watch the same thing.

Closes: the re-run half of checkbox 1.

## Comments

### Host verification — all three runtime checkboxes, one pass, no defects

Reported as a blanket pass, the same way tickets 09, 11 and 12 closed their
own runtime checkboxes:

- **Checkbox 1** — typing a folder name listed the matching folder followed by
  its immediate contents, and the rank order held (exact-named folders first,
  then prefix, then substring; shallower first).
- **Checkbox 2** — `~` alone listed nothing, no fallback pool.
- **Checkbox 3** — primary opened the file in Zed (ssh for mirrored paths,
  local otherwise); Shift+Return opened the five-row chooser without closing
  the Launcher; Escape returned to the still-filtered listing; Neovim opened
  in the file's parent; Reveal in Files stayed local; Escape-twice and
  dismiss-mid-chooser both behaved. No defects raised anywhere.

All four checkboxes closed. Nothing from either code-review finding — the
sync-chain note and the `seen` dedupe comment — surfaced on the host.

### Two-axis code review, after the host pass — seven fixes, one non-finding

A `/code-review` of the ticket's own code. Everything below is already applied;
the sections above were rewritten to match.

**Spec axis.** Three real defects, none of them reachable by the manual
verification that closed the ticket:

- The listing was re-asked on a keystroke only. Since this Provider does not
  own the refresh, a scan landing after the Query was typed left folder rows
  with no contents until the next keystroke. `onPathsChanged` now re-asks too.
- `onExited` drained `listingPending` in place, which takes
  `scheduleListing`'s `finder.running` branch if the process is still marked
  running — the flag is re-set and no further exit is coming to clear it, so
  the queued listing is stranded. Drained through `Qt.callLater` now.
- Nothing bounded the listing's length, and an ordered catalog has no scores
  for merge() to truncate by, so one folder holding 200 files hid every folder
  matched after it. New `MAX_CHILDREN` (16) caps each expanded folder's
  contents; `40 + 10 × 16` is exactly merge()'s limit.

The fourth spec finding was **not** a defect. The review read
`dotfiles_files.lua:152`'s `Keywords = { leaf, rel }` as elephant filtering
children against the Query, and the port dropping that. It does not: a listed
child's `rel` always contains the Query as a substring (its parent matched on a
substring of its own `rel`, and the child's `rel` extends it), so the keyword
filters nothing out — it exists to stop children being filtered out, which is
what the lua's own comment on that line says. What elephant does do with those
scores is *re-rank*, which is the order this port deliberately keeps.

**Standards axis.** Four:

- `Files.qml`'s chooser branch claimed to be "the same shape Directories.qml's
  own chooser branch is" and was not — it was `ordered`, so typing filtered
  nothing. It now carries a `Matching.prepare` corpus, which is what makes the
  comment true rather than deleting the claim.
- `ordered` was new vocabulary in three files and in no glossary. `CONTEXT.md`
  gained **Ordered Provider**; the interface doc in `Applications.qml` gained
  the length caveat.
- The header's case for duplicating `relOf`/`isMirrored`/the rest from
  `directories.js` was "nothing in this repo's lib/ imports a sibling", which
  reads as a convention worth breaking. Replaced with the actual constraint:
  `.import` is a syntax error under node exactly as `.pragma library` is, and
  every file here loads under both. The duplication stays.
- Six exports no consumer uses, dropped; `listingPending` moved above its uses;
  a comment that wrapped mid-identifier reflowed; the three longest comment
  blocks trimmed of restated argument.

376 tests across the suite, all passing in the container.

**Reopened to `needs-info`.** The host pass above predates these changes, and
two of them alter behaviour it covered, so checkboxes 1 and 3 are unticked
again. Checkbox 2 is untouched (the empty-Query branch did not change) and
checkbox 4 still stands on step 0, which nothing here affects.

**Manual verification** gained the two steps that cover the difference: typing
inside the chooser (step 2 — the five rows must now narrow, where before they
did not) and a cache landing after the Query is typed (step 3, new). The
`Qt.callLater` drain is the one fix with no manual step — it is a race between
a keystroke and a `find` exit that the block cannot stage reliably.

### Host re-verification — all three steps pass, no defects

Reported as a blanket pass, the same shape as the first one:

- **Step 0** — the two diagnostic lines still name the same cache file with the
  same count. Checkbox 4 stands.
- **Step 1** — folder-name listing and the empty Query unchanged by the review.
  Checkbox 1 back.
- **Step 2** — the primary Action, the chooser, Escape, and back all behave as
  before, and the new part holds: typing inside the chooser narrows the five
  rows. Checkbox 3 back.
- **Step 3** (new) — a cache landing after the Query is typed fills the folder
  rows' contents in with them, no extra keystroke needed. The `onPathsChanged`
  fix confirmed on the host.

All four checkboxes closed again. Nothing left open on this ticket: the three
spec fixes and the four standards fixes are in, the suite is green at 376, and
the one fix with no manual step (`Qt.callLater`) is argued rather than
observed — recorded here as such rather than as a verified claim.
