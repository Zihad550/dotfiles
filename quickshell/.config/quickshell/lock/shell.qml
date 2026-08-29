import Quickshell

// The Session Lock, as its own always-running Quickshell instance -- the third
// alongside the bar's `dotfiles` config and the Launcher's.
//
// Isolation is the reason it is not a module in either: `df-qs-restart` exists
// to be used, and a QML fault in a bar module must not be able to drop a live
// lock. See docs/session-lifecycle-spec.md (Implementation Decisions).
//
// Restart with `df-qs-restart lock`; read this instance's log with
// `qs -c lock log` (`-f` follows).
//
// This config takes no session lock yet. The appearance and the PAM
// conversation live in LockSurface.qml and are exercised through the `lock-probe`
// config (`df-qs-test lock-probe`), which renders the same surface in an
// ordinary window -- so iterating on the lock cannot lock anyone out. Acquiring
// the real ext-session-lock, publishing lock state and the IPC command surface
// are separate changes on top of this one.
ShellRoot {
    // Nothing is rendered and nothing is held: the instance exists so that the
    // change acquiring the session lock has a running process to put it in.
}
