# 23 — The first corpus text is a promise nothing checks

**What to build:** Ticket 20 made the *order* of a Provider's corpus texts
change what the Launcher ranks. Every Provider currently honours that order by
hand. Make it something a Provider cannot get wrong silently.

**Blocked by:** None. Ticket 20 created the rule; this is the part of it that
was left resting on authors remembering.

**Status:** done — all four checkboxes closed: 1–3 by test, 4 verified on the host 2026-08-03.

- [x] A Provider that lists an alias before its Entry's name fails something, rather than quietly ranking worse
- [x] The four keyless multi-text Providers stop hand-rolling the `texts`/`owners` loop
- [x] The rule is stated once, where a new Provider will meet it, rather than in a comment on `prepare()` a new Provider need never read
- [x] Nothing about ranking changes — this ticket is a guard, and the suite it is added to should not move
## What the rule is

`prepare()` derives `names[]` by marking the first text it sees for each owner:

```js
var owner = owners ? owners[i] : i;
names[i] = seen[owner] !== true;
seen[owner] = true;
```

and only a text flagged that way can earn `EXACT_WEIGHT`. So position 0 within
an owner's run means *this is what the Entry is called* and every later position
means *this is an alias people might type*.

Before ticket 20 that array order carried no meaning at all. Each text was
scored independently and `collapse()` kept whichever scored best per owner, so
`[title, appId, shortId]` and `[shortId, appId, title]` ranked identically. The
order was simply the order somebody happened to push things in.

## Where this came from

Ticket 20's review round. Both review axes independently found the same three
Providers emitting `[slug, displayName]` — `lib/themes.js`, `lib/backgrounds.js`
and `lib/providerlist.js`. Written back when order was free, and harmless then.
After ticket 20 the same line silently meant "this theme is *named* `rose-pine`
and merely knows the string `Rose Pine`", which is backwards from what the row
displays: typing `rose pine`, the string actually on screen, earned nothing
while the slug did.

Fixed in ticket 20, along with a false claim in `prepare()`'s own comment that
"every Provider here already builds" the right shape. Three of them did not.

## What is true today

Audited after that fix. Every Provider puts the Entry's own name first:

| Provider | corpus texts | name first |
| --- | --- | --- |
| `lib/windows.js` | `[title, appId, shortId]` | yes — title is `entry.name` |
| `lib/systemd.js` | `[unit, stem, description]` | yes — `name: unit.unit` |
| `lib/workspaces.js` | `[name, id]` | yes |
| `lib/processes.js` | `[process.name, cmd]` | yes |
| `lib/menus.js` | `[declared.name, ...keywords]` | yes |
| `lib/directories.js` | `[leaf, relativePath]` | yes, and argued for in its own header |
| `lib/themes.js`, `lib/backgrounds.js`, `lib/providerlist.js` | `[displayName, slug]` | yes, since ticket 20 |
| `lib/catalog.js` `ownedCatalog` | `entry.name`, then the extras | yes, structurally |

So there is nothing to fix in ranking. **This ticket buys nothing today and
should not be opened expecting a visible change.**

## Why it is still worth a ticket

The rule is enforced by nothing but each author having happened to write it that
way. Five Providers — `windows.js`, `systemd.js`, `workspaces.js`,
`processes.js`, `menus.js` — hand-roll their own `texts`/`owners` push loop, and
fifteen QML modules re-pair `prepare(built.texts, built.keys, built.owners)` by
hand. Every one of those loops is now deciding which text is an Entry's name,
mostly without saying so.

The realistic failure is a Provider added later, or an existing `textsFor`
reordered for an unrelated reason. What that costs is not a crash: the Entry
just ranks a little lower than it should when someone types its whole name.
That reads as "the launcher's ranking feels a bit off" rather than as a bug with
a cause — which is the exact failure mode `tests/launcher/matching.test.js`
opens by naming, "a wrong ranking looks like a preference, not a fault", and the
reason that seam has tests at all.

## The shape of the fix

`lib/catalog.js` already holds two builders and its header already explains why
these five are not among them: `keyedCatalog` is one text per Entry,
`ownedCatalog` is several *with* keys, and processes, systemd, workspaces and
windows are "a third shape that stays in their own modules" — several texts and
no key, since a pid, a workspace id and a window are all gone by the next open.
That reasoning was sound before order meant anything. Ticket 20 is the new fact
that reopens it.

Three directions, cheapest first:

1. **A third builder.** `ownedCatalog` without the keys, taking each Provider's
   own `entryFor`/`textsFor` the way the existing two do — the QML composes
   them, since a lib module cannot import a sibling (`lib/files.js:20-26`
   explains why, and `lib/catalog.js`'s header repeats it). That removes four of
   the five hand-rolled loops and makes `entry.name` the first text
   structurally, the way `ownedCatalog` already does.
2. **A guard in `prepare()`.** It already walks every text; it could check that
   each owner's first text matches that Entry's name — except it is handed
   `texts`, not `entries`, and does not know what an Entry is. Giving it that
   knowledge to check one invariant is probably worse than direction 1.
3. **A shared test helper.** One assertion — "this Provider's first text per
   owner is its Entry's `name`" — run from each Provider's own test file over
   its real `catalogOf`. Cheapest of the three, catches a regression rather than
   preventing it, and does nothing for a Provider whose author does not add the
   assertion.

1 and 3 compose, and probably should. Whoever takes this should decide whether
`menus.js` belongs in the builder too — it carries keys, so it may just be an
`ownedCatalog` caller already, and reading it is the first step.

## Manual verification

Almost all of this closes under `node --test "tests/launcher/*.test.js"` — the
rule is pure JavaScript and needs no compositor. Checkbox 4 is the one that
wants care: the suite stood at **377 passing** when this ticket was written, and
a refactor that changes that count has changed behaviour, which this ticket is
not for.

The one host check, once the refactor lands:

```bash
cd ~/dotfiles && scripts/stow/stow-base && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, no QML error, and each touched Provider still
lists its Entries — the four hand-rolled loops feed `Windows.qml`,
`Systemd.qml`, `Processes.qml` and `Workspaces.qml`, so a mistake in the
rewiring shows as one empty Provider rather than as a broken Launcher. Type a
window title, a unit name, a process name and a workspace name and confirm each
still finds its Entry, and that typing one in full still puts it first.

## Comments

### 2026-08-03 — implemented as directions 1 + 3

- `lib/catalog.js` grows a third builder, `keylessCatalog(items, entryFor,
  textsFor)` — ownedCatalog without the keys, for exactly the four Providers
  the ticket names. The rule is now stated once, in that file's header, and
  `prepare()`'s own comment defers to it instead of re-stating it.
- `lib/windows.js`, `lib/workspaces.js`, `lib/processes.js` and
  `lib/systemd.js` each replace their hand-rolled `catalogOf` with an
  `entryFor` + `textsFor(item, entry)` pair, composed by `keylessCatalog` in
  the QML (`Windows.qml`, `Workspaces.qml`, `Processes.qml`, `Systemd.qml`).
  `Systemd.qml` keeps its two-scope concat with the owner offset, now over
  two `keylessCatalog` calls. Each module's "no Entry Key" reasoning moved
  onto its `entryFor`.
- `tests/launcher/catalog-check.js` is the shared guard: `nameFirst(built,
  nameOf?)` asserts each owner's first corpus text is its Entry's name
  (case-insensitively, since `prepare()` lowercases), folded into an existing
  test in every multi-text Provider's own file — the four above plus themes,
  backgrounds, providerlist, directories and menus. Directories is the
  deliberate exception and passes `entry => D.leafOf(entry.name)`. Verified
  that a misordered corpus fails it. Deliberately not named `*.test.js` so it
  is not a suite of its own.
- `menus.js` keeps its own `catalogOf`, with the decision argued in its
  header: it validates declarations and collects `problems`, a shape
  `ownedCatalog`'s unconditional build cannot take, and forcing it would move
  the validation into the QML.
- **Checkbox 4, the count:** 377 → **379**, all green. The delta is exactly
  the two new `keylessCatalog` contract tests in `tests/launcher/
  catalog.test.js` (the same place `keyedCatalog`'s contract lives). No
  existing assertion changed; every ranking expectation in the suite still
  passes as written. If 377 must be restored, deleting those two tests is
  the whole of it. The host check below is what closes the checkbox.

### Host handoff — closes checkbox 4

The node suite is green; the refactor reaches the host only through QML
composition, so run the ticket's own block:

```bash
cd ~/dotfiles && scripts/stow/stow-base && scripts/stow/stow-hyprland
df-qs-restart launcher --log
```

**Pass:** `Configuration Loaded`, no QML error, and each touched Provider
still lists its Entries — a mistake in the rewiring shows as one empty
Provider rather than a broken Launcher. Type a window title, a unit name, a
process name and a workspace name and confirm each still finds its Entry,
and that typing one in full still puts it first.

### 2026-08-03 — host check passed, closes checkbox 4

Ran the block above on the host: stow, `df-qs-restart launcher --log`,
`Configuration Loaded`, no QML error, all four providers list their Entries,
and typing a window title, a unit name, a process name and a workspace name
each finds its Entry with the full-name match first. Ranking unchanged, as
the ticket promised.
