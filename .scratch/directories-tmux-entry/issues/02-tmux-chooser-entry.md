# 02 — Tmux Entry in the Chooser, pure half

**What to build:** The directories module gains a Tmux app in the directory
Chooser, offered for every directory (mirrored or not). Choosing it runs a
ghostty window on the session script with the directory's session name and
path. The session-name rule and the launched argv are pure, QML-free and
under the node suite, so the module can state — and prove — exactly what
choosing Tmux runs.

Session names are the directory's relative path slugged, `/` replaced with
`-`; the `~` entry names its session `home`. The argv is
`ghostty -e <absolute script path> <session name> <path>`, with the path
escaped by the module's existing single-quote-doubling rule.

**Blocked by:** None — can start immediately. (01 is docs-only and does not
gate this; the script the argv names is a contract string, not a dependency.)

**Status:** ready-for-human

- [x] The module exposes the session-name rule: top-level and nested
      directories slug correctly (`dev/monorepo/backend` →
      `dev-monorepo-backend`), paths already containing hyphens survive, and
      `~` yields `home`
- [x] The directory Chooser offers a Tmux Entry for every directory, with no
      mirror condition
- [x] The Entry's argv is `ghostty -e <absolute script path> <session name>
      <path>` — a plain local exec, no launch-prefix machinery
- [x] A path containing spaces or quotes is escaped so the argv survives as
      one argument
- [x] All of the above is covered by the existing node test suite, in the
      same file style as the Chooser's current argv tests — suite is green

## Comments

Implemented and landed in the working tree alongside ticket 03; the ticket
file was simply left behind. One deliberate divergence from the stub above:
the path is passed **raw**, not through single-quote-doubling — ghostty
1.2+ execs `-e` arguments verbatim (`initial-command: direct:`, no shell
round-trip), so the module's shellEscape would reach the session script as
literal text. The escape belongs to the session script, where the path is
embedded into tmux command strings. Noted in lib/directories.js's header on
`tmuxLaunchArgv`, and pinned by the hostile-path test. Suite green: 25
tests across the module, all passing in the container.