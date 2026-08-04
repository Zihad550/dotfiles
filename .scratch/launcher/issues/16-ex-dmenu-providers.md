# 16 — Ex-dmenu Providers

**What to build:** The things that were shell scripts driving a dmenu become Providers reachable from the Launcher, and the dmenu Surface stops existing. The indirection menu that only listed the other scripts disappears entirely.

**Blocked by:** 06 — Core Action vocabulary.

**Status:** done — all six closed on the host, across four rounds. The last one
covered the polkit switch and the two extractions; see **Host round 4** under
**Manual verification**.

- [x] Dev servers, running processes, systemd units and zellij sessions are each a Provider
- [x] Their destructive Actions behave as the scripts did, including privilege handling for system units
- [x] Renaming a workspace is an Action on a workspace Entry, needing no external text prompt
- [x] The two scripts duplicating existing Providers are merged into them rather than ported as new ones
- [x] The script that existed only to list the other scripts is gone
- [x] No remaining script invokes the old launcher in dmenu mode

## Comments

Built as ticket 16. The three deletion checkboxes were closed by inspection
(`git rm` and `rg` across the repo); the three runtime ones were closed on the
host, steps 1–3 of **Manual verification** below, after the review round
described at the end of these comments.

**The five Providers** (`quickshell/.config/quickshell/launcher/modules/`):

- `Workspaces.qml` — every numbered workspace (specials excluded — see its
  header), switch on Return via the same `activate()` the bar's own
  Workspaces.qml uses, rename on Ctrl+R. The rename prompt is the Launcher's
  own Query line: new `prompting` machinery in Launcher.qml (a Provider-owned
  flag read like `nested`), prefilled with the plain name, Return applies via
  the script's Lua dispatch (`hl.dsp.workspace.rename`, quoted), Escape
  cancels, empty+Return resets to the plain id — the script's own branches,
  with its notify kept for the non-empty case. No external text prompt
  anywhere.
- `Processes.qml` — `ps -eo pid,comm,cmd,%cpu --sort=-%cpu`, the script's
  exact invocation; primary is `kill -9 <pid>`, its footer label says "kill".
- `Systemd.qml` — user and system `list-units` scopes; each row carries its
  scope in its sub-line and target, and the primary runs `systemctl --user
  restart` or a polkit-authorized `systemctl restart` off that scope — the
  privilege handling (the script's `sudo` and why it is not carried over is
  under **After round 2**). Both Actions close the Launcher and notify what
  happened — see **After round 3**.
- `DevServers.qml`, `Zellij.qml` — the static data lists, primary runs
  `df-launch-dev <url>` / `df-launch-special-app` by absolute path, exactly
  the script commands.

**None of the five is in the default pool.** They are reached by being entered
from the "?" list, the same mechanism ticket 18 gave themes and backgrounds,
and the argument is on Launcher.qml's `rankedRoutable`: each was a menu you
chose *before* you searched it, and ranking them against every keystroke put a
row whose Return is `kill -9` or a system-unit restart one tie away from a
Query that meant an application. They were placed in `pool` first, and careful
placement is only a way of making that unlikely.

Pure halves (`lib/`, node-tested): `workspaces.js`, `processes.js`,
`systemd.js`, `devservers.js`, `zellij.js`, plus the two shared modules the
review round extracted, `sequence.js` and `catalog.js` — 48 new tests, full
suite 375 passing.

**Deleted** (`git rm`): `bin/walker/{dev-servers, execute-command,
manage-processes, manage-systemd-processes, select-theme, system-menu,
zellij-sessions}` and `bin/df-hypr-rename-workspace`. `select-theme` and
`system-menu` were the two scripts duplicating existing Providers (Themes,
SystemMenu); `execute-command` was the indirection script. The remaining
`walker -m` pickers (themes/backgrounds/dirs/screenshots/files) are
deliberately left running by their own tickets — they are menu mode, not
dmenu mode, and ticket 19 retires walker wholesale.

**Bindings removed** (`hypr/.config/hypr/lua/bindings/system.lua`):
`SUPER+SHIFT+P` (Scripts → execute-command) and `SUPER+SHIFT+R` (Rename
workspace). The dmenu-mode invocations are gone with them; a `rg` for
`walker -d`/`--dmenu` now finds nothing.

### Host round 1 — Step 0 passed; the processes Provider came back empty

The first host round confirmed Step 0 (config loads, bindings gone) but the
processes listing was empty. Cause found and fixed: `ps` right-aligns the
pid column, so every real row leads with spaces
(`"  12086 devpod …"`), and `parseLine` split before trimming — the first
field came back `""`, the numeric-pid check dropped every row. The test
samples claimed to be "real ps lines" but carried no padding, which is why
the suite was green. `lib/processes.js` now trims before splitting (the
script's awk never hit this because awk rebuilds records with single-space
separators — the split collapses `cmd`'s internal runs the same way), the
samples are padded like real output, and a regression test pins the shape;
`lib/systemd.js` got the same trim for the same class of trap. Suite: 361
passing.

### Review round — four fixes, and the Providers moved out of the pool

A two-axis review (standards, spec) before the final host round. What it
changed:

- `Systemd.qml` — a respawn loop. Both listings' `onExited` called the whole
  `refresh()`, so each scope's exit restarted the other, found this one
  running, and armed its pending flag: unbounded, triggered by any
  `after: "refresh"` landing mid-listing. Split into `refreshUser()` /
  `refreshSystem()`, each flag re-arming only its own scope.
- `lib/workspaces.js` — `renameLuaArgv` escaped `"` but not `\`, so a name
  ending in `\` closed the Lua string early: the same break the quote escape
  exists to prevent, reached by the other character. Backslash is escaped
  first now (order matters — reversed, the quote pass doubles it), pinned by a
  test covering both characters together.
- `Applications.qml` — the Provider-slot registry now documents this ticket's
  six prompt slots, which it was silently missing.
- `tests/launcher/workspaces.test.js` — the `namesFor` helper was dead *and*
  broken (`.map` over `collapse`'s `{indices, scores}`); fixed and used, so
  workspaces has the "found by its texts" test the other four had.
  `CONTEXT.md` gained a **Prompt** term.

Then, on seeing them on the host: **all five moved out of `pool`** — see the
note above and Launcher.qml's `rankedRoutable`. Steps 1–3 below are rewritten
around entering each Provider from the "?" list.

Review findings deliberately not acted on: the silent `sudo` failure
(documented parity — the checkbox is "behave as the scripts did"; a comment
now records that the re-list is not confirmation), `listOf` duplicated from
`Windows.qml` and `catalogOf` duplicated across devservers/zellij (both small,
both fought the file-per-Provider style), and zellij's session-name
interpolation (latent only — the constraint is documented on the data
instead).

### Host round 2 — steps 1, 2 and 3 passed

All three runtime checkboxes closed.

### After round 2 — three changes taken from the review's "not acted on" list

Each was left undone in the review round above and then asked for directly.

**The system-unit restart is polkit's, not the script's sudo**
(`lib/systemd.js`). sudo asks for a password on a terminal and a detached exec
has none, so the script's own behaviour from a keybind was "works if
credentials happen to be cached, silently does nothing otherwise" — and
carrying it over carried over a failure nobody can see. Plain `systemctl
restart` as an ordinary user asks polkit for
`org.freedesktop.systemd1.manage-units`, and `hyprpolkitagent.service` (already
enabled by `setup/arch-hyprland/setup-packages/setup-hyprland`) raises a
password dialog with no terminal involved. The privilege *boundary* the
checkbox is about is unchanged — a system unit still needs authorization, a
user unit still does not. Not `pkexec`, which authenticates the whole command
as root and would say so instead of naming the unit.

**`listOf` extracted to `lib/sequence.js`.** It was the same nine lines,
comment included, in `Windows.qml` and `Workspaces.qml` — the QML-sequence to
real-array copy that two early host rounds died on. Both now import it; the
argument for why it exists lives in the new module's header. It is node-tested
despite being a QML concern: a QML sequence cannot be built under node, but an
array-*like* can, and being an array-like that `Array.isArray` rejects is
exactly the property that broke those rounds.

**`catalogOf` extracted to `lib/catalog.js` as `keyedCatalog`.**
`devservers.js` and `zellij.js` held the same thirteen lines. The shared
function takes the Provider's own `entryFor` as an argument — the QML calls
`Catalog.keyedCatalog(root.urls, Dev.entryFor, root)` — rather than either
module wrapping the other: a wrapper would be a function whose body only
forwards, and a lib module importing another lib module is not something
anything else here does. Each Provider's tests still call it with their real
`entryFor`, so what a dev-server row looks like is still pinned in
`devservers.test.js`. Both QML files log their row count and
`typeof entryFor` at startup, because a function passed between two imported
modules inside QML's engine fails as an empty list rather than as an error.

### After round 3 — a destructive Action has to say what it did

Host round 4 passed the three changes above, and turned up two faults in the
same place, both of them consequences of `after: "refresh"` plus
`execDetached`. Fixed together:

**The polkit dialog came up behind the Launcher.** The Launcher is
`WlrLayershell.layer: WlrLayer.Overlay` (`Launcher.qml`), which paints above
every ordinary window — and a polkit prompt is an ordinary window. Staying open
after a restart therefore guaranteed the password prompt was covered: it could
only be reached by dismissing the Launcher first, which took *two* Escapes,
since leaving a nested Provider is what the first one does. Restart now closes
(`after: "close"`), the same as kill.

**Neither restart nor kill said whether it worked.** The re-listing was never
confirmation — it is `--state=running`, which reads identically whether the
unit restarted or nothing happened at all — and `execDetached` discards the
exit code, so there was nothing to report even in principle. Both Actions now
run through a `Process` and turn its exit code into a notification
(`S.notifyArgv`, `Proc.notifyArgv`): plain on success, `--urgency=critical`
with the command's own stderr on failure. That separates outcomes that used to
be indistinguishable — restarted vs. dialog dismissed
(`Interactive authentication required`) vs. unit failed to start; killed vs.
already exited (`No such process`, ordinary given a seconds-stale listing) vs.
not yours to kill (`Operation not permitted`).

Both Providers hold the unit or process name on the Provider rather than
reading it off the Entry, because the Launcher has closed by the time the
Process exits, and both guard a second invocation while one is in flight so a
notification cannot be lost.

## Manual verification

Nothing below can run in this container — no compositor, no quickshell, no
Wayland (per `docs/agents/issue-tracker.md`). Three of the checkboxes above
were verifiable by inspection; the three these steps close are claims about
what actually happens on the host session, and **all three passed**. Each step
names the checkbox it closes, and the steps are kept current with the code
rather than as a record of what was run — step 2 in particular was rewritten
after round 4, when restart and kill gained their notifications.

### Step 0 — the config loads and the removed bindings are gone

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
hyprctl dispatch exec true   # reload hyprland.lua for the removed bindings
```

**Pass:** `Configuration Loaded`, no QML errors (`Workspaces is not a type`
or similar would mean a module file is not being found), and `hyprctl reload`
completes without complaining about `system.lua`.

### Step 1 — the five Providers are reachable (checkbox 1)

```bash
sleep 1000 &
hyprctl workspaces -j | jq -r '.[] | select(.id > 0) | "\(.id) \(.name)"' | head -3
systemctl --user list-units --type=service --state=running --no-legend --no-pager | head -1
```

All five are reached by being **entered from the "?" list**, not by typing
into the default view — they are out of `pool` for the reason argued on
Launcher.qml's `rankedRoutable`, and an ex-dmenu row is never a tie away from
a Query that meant an application. So each check below opens the Launcher
(`SUPER+SPACE`), types `?`, chooses the Provider, and searches inside it;
Escape backs out to the default view.

0. Type `?` — **pass:** rows for `workspaces — Switch to a workspace`,
   `processes — Kill a running process`, `systemd — Restart a systemd
   service`, `dev servers — Open a dev server`, `zellij — Attach to a zellij
   session`, alongside the rest. **Pass, equally important:** with the
   Launcher freshly open and nothing typed, *no* process, unit, session, dev
   server or workspace row is in the list, and typing an application name
   brings back applications and windows only.
1. Enter `dev servers`, type `5175` — **pass:** a row
   `https://localhost:5175 — dev server`; Return opens it on the localhost
   special workspace (the `df-launch-dev` dance).
2. Enter `zellij` — **pass:** three rows `work`, `project`, `dev — zellij
   session`.
3. Enter `processes`, type `sleep` — **pass:** a row `sleep` with sub-line
   `sleep 1000 (…% CPU)`.
4. Enter `systemd`, type the unit name from the third command (e.g.
   `pipewire.service`) — **pass:** a row `pipewire.service — user ·
   <description>`.
5. Enter `workspaces`, type one of the names from the second command —
   **pass:** a row `3-(dev) — N windows` (or similar), sub-line naming the
   count and `active` if it is the current one. Special workspaces are *not*
   rows, deliberately (see Workspaces.qml's header).

### Step 2 — the destructive Actions run the scripts' commands (checkbox 2)

```bash
sudo -k    # no cached credential needed — a system unit is authorized by polkit's dialog
```

Every Action here closes the Launcher and reports its outcome as a
notification — see **After round 3**. The notification *is* the pass
condition; the command below each step only corroborates it.

1. Enter `processes` from the `?` list, type `sleep`, press Return on the
   `sleep 1000` row. **Pass:** a `Process killed — sleep` notification, and
   `pgrep -f '^sleep 1000'` prints nothing.
2. Note `systemctl --user show -p MainPID --value <user-unit>` for the unit
   from step 1, then enter `systemd` and restart it through the Launcher.
   **Pass:** `Service restarted`, no dialog at all (a user unit needs no
   authorization), and the MainPID changed.
3. Still inside `systemd`, type `ssh.service` (or any running system unit),
   press Return. **Pass:** the Launcher closes and the polkit dialog is
   visible *immediately* — not behind the Launcher, which is what the overlay
   layer used to do — and after authenticating, `Service restarted` and
   `systemctl show -p MainPID --value ssh.service` has changed.
4. Repeat step 3 and **dismiss** the dialog instead. **Pass:** a critical
   notification quoting systemctl's own `Interactive authentication required`,
   and the MainPID is unchanged.
5. Restart the same unit twice in quick succession, then leave the Launcher
   open a few seconds. **Pass:** `pgrep -fc 'systemctl.*list-units'` stays at
   0 between opens — the two listings do not respawn each other (the
   `refreshUser`/`refreshSystem` split).

### Step 3 — the rename prompt is the Launcher's own Query line (checkbox 3)

```bash
hyprctl workspaces -j | jq -r '.[] | select(.id > 0) | "\(.id) \(.name)"' | head -1
```

1. Open the Launcher, enter `workspaces` from the `?` list, type the name of a
   workspace from the command above,
   arrow to its row, press `Ctrl+R`. **Pass:** the Query line now holds the
   workspace's *plain* name (`dev` for `3-(dev)`), the list is hidden, the
   footer reads `⏎ rename · esc cancel`.
2. Edit the name, press Return. **Pass:** a "Workspace renamed" notification
   appears, and `hyprctl workspaces -j | jq -r '.[].name' | grep <id>` shows
   `<id>-(<newname>)`; the Launcher returns to the search Query it had.
3. `Ctrl+R` again, then Escape. **Pass:** the prompt cancels, the workspace
   name is unchanged, the search Query is restored.
4. `Ctrl+R` again, clear the field, Return. **Pass:** the workspace resets to
   the plain id and no notification appears — the script's empty branch.
5. Press `SUPER+SHIFT+P` and `SUPER+SHIFT+R`. **Pass:** nothing happens —
   those bindings are gone, and renaming happens only from a workspace row.

### Host round 4 — the three post-round-2 changes

Steps 0–3 above passed as written and are not re-run except where named here.

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
df-qs-restart launcher --log
sudo -k     # drop any cached credential -- the point is that one is not needed
```

1. **The extractions did not empty anything** (`listOf`, `keyedCatalog`). In
   the log: `dev servers Provider built 3 row(s); entryFor is a function` and
   the same for zellij. **Pass:** both say `function` and a non-zero count. A
   `undefined` there is the passed-function shape failing, and it would
   otherwise present only as an empty list.
2. Open the Launcher and check windows and workspaces still list at all — type
   an open window's name in the default view, and enter `workspaces` from `?`.
   **Pass:** rows in both. These are the two files `listOf` moved out of, and
   a broken copy reads as "nothing is open", which is a legitimate state and
   so says nothing on its own.
3. **The system-unit restart prompts instead of failing silently** (checkbox
   2, re-run under polkit). Note `systemctl show -p MainPID --value
   ssh.service`, then enter `systemd` from `?`, type `ssh.service`, press
   Return. **Pass:** a polkit password dialog appears — with no cached sudo,
   which is the whole change — and after authenticating, the MainPID has
   changed. **Also pass:** dismissing the dialog leaves the MainPID alone.
4. Restart a *user* unit the same way. **Pass:** no dialog at all, MainPID
   changed — a user unit needs no authorization, and that boundary is what the
   checkbox is about.
