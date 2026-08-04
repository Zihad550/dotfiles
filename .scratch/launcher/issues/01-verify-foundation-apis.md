# 01 — Verify foundation APIs

**What to build:** Confirmation of the four unknowns every later ticket rests on, recorded somewhere the next ticket can find them. No user-facing behaviour — this exists so that a wrong assumption costs a day rather than a rewrite.

**Blocked by:** None — can start immediately.

**Status:** done — all four answered; the two host-only ones closed by the probe.

- [x] Established whether a keyboard shortcut can be registered with the compositor from inside QML; if not, the IPC fallback is chosen and the cost noted
- [x] Established whether a desktop-entry API exists for listing applications, resolving icons, and launching with correct terminal handling
- [x] Confirmed one JavaScript file loads under both QML and a standalone runtime, with any interop shim inert under QML
- [x] Established how two Quickshell configs share a theme, given each config root is its own import namespace
- [x] Findings recorded in the repo, with any decision that changed from the spec called out explicitly

## Answer

### Where this was run

In the DevPod devcontainer (`REMOTE_CONTAINERS=true`, Ubuntu 26.04), not on the
Arch host. There is no `quickshell` binary, no `WAYLAND_DISPLAY`, no
`HYPRLAND_INSTANCE_SIGNATURE`, no `~/.config/theme` symlink and no
`~/.cache/df-dir-picker/folders.list` here. Unknowns 1 and 2 are therefore
**open**, with the commands that close them recorded below. Ticket 03 and the
applications Provider in ticket 04 are blocked on them; nothing else is.

### Unknown 3 — one JavaScript file under both QML and a standalone runtime

**Answered, and it changed a spec assumption.**

`.pragma library` is a hard `SyntaxError` under node — verified, it is not
valid JavaScript. So a single file loadable by both **cannot carry it**. The
spec assumed the shim would be the only accommodation needed; the real
constraint is the pragma.

Two consequences, both now baked into
`quickshell/.config/quickshell/launcher/lib/matching.js`:

- Without `.pragma library`, each importing QML document gets its own copy of
  the script scope. Harmless for pure functions, but it means **the module must
  never hold mutable module-level state**. The Frecency store (ticket 07) has
  to live in QML and be passed in, which is what `rank()`'s `usage` option is
  for.
- Only top-level `function` declarations are reliably reachable through a QML
  `import "…js" as X`, so everything a consumer needs is a function rather than
  a constant.

The interop shim is a CommonJS tail guarded on `typeof module !== "undefined"`,
which is inert under QML.

Verified here: the module loads under node and its tests pass
(`node --test "tests/launcher/*.test.js"`). **The QML half is unverified** —
see the host checks below.

### Unknown 4 — how two configs share a theme

**Answered from the repo; no runtime check needed.**

Each config root is its own import namespace, so `Theme.qml` genuinely cannot
be imported across configs. That turns out not to matter, because the theme
*definitions* are not in QML. `df-theme-generate` renders
`themes/templates/quickshell.json.tpl` into
`~/.config/themes/<name>/quickshell.json`, and `~/.config/theme` symlinks to
the active theme. `Theme.qml` is only a `FileView` reader over that one file.

So the Launcher config gets **its own `Theme.qml` reading the same generated
file** — two readers of one source, not two definitions. Colours cannot drift.
The template already emits everything a second config needs; no change there,
which matches the spec's "changing the theme system" being out of scope.

What is *not* shared is the non-colour constants in the bar's `Theme.qml`
(`fontFamily`, sizes, `barHeight`). Those are bar-specific and the Launcher
needs its own regardless, so this is not drift.

**One change from the spec.** Live restyle needs more than the `FileView`
watch. `df-theme-set` retargets the `~/.config/theme` symlink, which a file
watcher does not necessarily see, so `shell.qml` exposes `ipc call theme
reload` and `bin/df-theme-set` calls it — but at `bin/df-theme-set:142` it
calls it only for `-c dotfiles`. The second config needs the same `IpcHandler`
**and** `df-theme-set` has to poke both, or the Launcher will silently keep the
old palette across a theme switch. Handled in ticket 02.

### Unknown 1 — YES, a compositor shortcut can be registered from QML

**Answered on the host, and the shortcut genuinely fires.**

`Quickshell.Hyprland.GlobalShortcut { appid: "…"; name: "…" }` registers with
the compositor — `hyprctl globalshortcuts` lists `appid:name` while the config
runs — and `onPressed` fires when it is dispatched. So the spec's preferred
open path is available and **the IPC fallback is not needed**: no client binary,
no fork and exec per open.

Two traps, both hit during the probe and both worth carrying forward:

- **`pressed` is a bool property that shadows the signal in JavaScript.**
  `shortcut.pressed.connect(fn)` fails with `Property 'connect' of object false
  is not a function`, because `shortcut.pressed` resolves to the property, not
  the signal. Declare `onPressed:` on the object instead. Round one of the probe
  read this as "registered but inert", which is the exact false negative the
  ticket warned about — from the rig, not the API.
- **`hyprctl dispatch global <appid>:<name>` does not work on this machine.**
  This setup runs Hyprland's Lua config, where hyprctl evaluates the argument as
  Lua, so the bare form is a syntax error. The working forms are
  `hyprctl dispatch "hl.dsp.global('appid:name')"` and, in a bind,
  `hl.dsp.global("appid:name")` (`hl.dsp.global` is defined at
  `resources/Hyprland/src/config/lua/bindings/LuaBindingsDispatchers.cpp:1405`,
  taking one string).

### Unknown 2 — YES, with an asynchronous-population constraint

**Answered on the host. The API exists and carries everything ticket 04 needs —
but it is empty when the config loads.**

`Quickshell.DesktopEntries.applications` is a model whose array is `.values`
(`rowCount()` also works; there is no `.length`). Each entry carries `id`,
`name`, `icon` (an icon-theme name such as `network-wired`, so lookup is the
theme's job, not ours), `runInTerminal`, `noDisplay`, `command`, and an
`execute()` function.

**Correction, from ticket 04's host run.** This section originally read that the
API "carries everything ticket 04 needs" including terminal handling. It does
not. `execute()` **exposes** `runInTerminal`; it does not **act** on it. A
`Terminal=true` entry launched through `execute()` runs its command with no
terminal around it, exits immediately, and looks like nothing happened — which
is what yazi did. The caller has to wrap, exactly as elephant does at
`resources/elephant/internal/providers/desktopapplications/activate.go:118`
(`if files[…].Terminal { toRun = common.WrapWithTerminal(toRun) }`). Presumably
that is *why* `runInTerminal` is exposed at all.

Two further things `execute()` does not do, both found the same way:

- **No shell expansion.** It is a detached exec of an argv, not `sh -c`, so a
  leading `~` in an `Exec=` line is a literal path component. Elephant runs
  every Exec through `sh -c` and so never noticed; `df-webapp-install` writes
  `Exec=~/dotfiles/bin/df-launch-webapp …`, and every webapp on this machine
  therefore did nothing when launched.
- **Working directory is unestablished.** Elephant sets `cmd.Dir` from the
  entry's `Path=`. Whether Quickshell's entry exposes that at all is still
  open — see the paste-back in ticket 04.

This does not change ticket 04's size, but it does move terminal handling and
argument fixing from "the API does it" to "the applications Provider does it".

**The trap, and the reason this needed a second round:** the model is populated
asynchronously. At `Component.onCompleted` it reported **0 entries**; two
seconds later, **84**. Round one measured only the first of those and read it as
"the API finds nothing". So:

> The applications Provider in ticket 04 must react to the model populating —
> it must not snapshot `.values` once at startup, and the matching corpus has to
> be re-prepared when the model changes. A Provider that reads the count at load
> gets an empty Launcher and no error.

This is why ticket 04 is the **small** version: no hand-rolled `.desktop`
parsing, no icon-theme lookup, no terminal handling of our own.

### How this changes the tickets

- **Ticket 03** shipped on the IPC trigger, correctly, since unknown 1 was open
  when it was written. It works and is verified. Swapping it for a
  `GlobalShortcut` is now a small change that **ticket 10 owns**.
- **Ticket 04** is unblocked and is the small version, subject to the
  asynchronous-population constraint above.

### Probe notes

One cosmetic defect in the round-two probe, for anyone reading its raw output:
the "Still 0 after 2s …" paragraph prints unconditionally rather than only when
the count is still zero, so it appeared directly under a successful count of 84.
Ignore it there. The probe is temporary and goes away with this ticket.

### Unknowns 1 and 2 — how they were left after round one

Both need a session with Hyprland and `quickshell` running. Neither is
answerable by reading `resources/`: `DesktopEntries` has zero hits anywhere in
it, and the `GlobalShortcuts` hits are Hyprland's own C++ protocol
implementation, which says the compositor side exists but not that Quickshell
exposes a QML binding for it.

For **unknown 1**, what has to be established is whether a global-shortcut type
exists under `Quickshell.Hyprland`, and whether a registered shortcut actually
*fires*. Registering without firing is the trap — it looks identical to success
until the key is pressed. If no such type exists, the fallback is an
`IpcHandler` target reached by a Hyprland bind, already proven three times in
`quickshell/.config/quickshell/dotfiles/shell.qml`, at the cost of a fork and
exec per open — the cost the spec names.

For **unknown 2**, whether `Quickshell.DesktopEntries` exists and whether an
entry carries a name, a resolvable icon, and correct `Terminal=true` handling.
This one sizes ticket 04: without it, hand-rolled `.desktop` parsing plus
icon-theme lookup plus terminal handling is a large amount of code to discover
late.

`quickshell/.config/quickshell/launcher-probe/shell.qml` answers both, plus the
QML half of unknown 3, in one command. See **Manual verification** below.

## Manual verification

Closes: **unknowns 1 and 2**, and the QML half of unknown 3.

Everything below runs on the Arch host, in a Hyprland session. Stow first:

```bash
cd ~/dotfiles && scripts/stow/stow-hyprland
ls -l ~/.config/quickshell/          # expect launcher/ and launcher-probe/
```

Run the probe. It stays in the foreground and prints to this terminal, so
there is no log to hunt for:

```bash
df-qs-test launcher-probe
```

**Expected:** a block headed `=== launcher foundation probe ===` with a
`YES`/`no` line per API, then a summary. Leave it running for the next step.

If it reported a global shortcut registered, confirm it *fires*. In a second
terminal:

```bash
hyprctl globalshortcuts                      # expect launcherprobe:open listed
hyprctl dispatch global launcherprobe:open
```

**Expected:** `*** SHORTCUT FIRED -- unknown 1 is answered YES ***` in the
probe's terminal. This proves the path without editing `hyprland.lua`; binding
it to a key is then one config line. No output there means registered-but-inert
— which is a **no** for unknown 1, and the IPC fallback applies.

**On the unknown-3 line specifically:** if it reports `import did not resolve`,
that is not yet a verdict. The probe imports across config roots
(`../launcher/lib/matching.js`) and Quickshell may refuse that on principle.
Retry as the probe's output instructs — copy the file in next to it and import
`./matching.js` — before concluding the seam is unsound.

Paste the whole probe output back. Then tear the probe down; it is temporary
and goes away with this ticket:

```bash
qs -c launcher-probe kill 2>/dev/null
```
