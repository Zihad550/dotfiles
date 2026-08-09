# 02 — Window-naming fallback module + test

**What to build:** a small pure module, local to the `dotfiles` Quickshell
config, implementing the same title → app id → `"(untitled window)"`
fallback rule the Launcher's `lib/windows.js:nameFor` already implements.
The two Quickshell configs are separate module roots with no shared import
path, so this is a deliberate duplicate, not a refactor of the Launcher's
module — kept in sync by hand, one small rule. Covered by a `node:test` unit
test mirroring `tests/launcher/windows.test.js`'s coverage of the same rule.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] New pure JS module under a new `dotfiles/modules/lib/` directory
      implementing the naming fallback: title present → title; title absent,
      app id present → app id; both absent → `"(untitled window)"`
- [ ] `node:test` unit test at `tests/dotfiles/<module-name>.test.js`
      covering all three cases, runnable via `node --test "tests/**/*.test.js"`
- [ ] No changes to `launcher/lib/windows.js` — this module is a separate,
      deliberately duplicated implementation
