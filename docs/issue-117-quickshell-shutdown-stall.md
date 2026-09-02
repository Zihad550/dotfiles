# Quickshell shutdown-stall investigation

Issue #117 remains an upstream bug. The installed Arch package is Quickshell
0.3.1-1, and the current upstream `master` checked on 2026-09-02 is commit
`2d3b3e9`. Both contain the same blocking `qs kill` path; no upstream fix for
the stall was found.

The repository already contains the local mitigation: `df-qs-restart` bounds
the IPC request and sends `SIGTERM` when the instance remains alive. That is
not an underlying fix, so this document deliberately does not claim that the
stall is resolved.

## What the source comparison establishes

Quickshell v0.3.1 introduced commit
[`025c709`](https://github.com/quickshell-mirror/quickshell/commit/025c709),
which made `IpcClient::kill()` wait for the remote socket to disconnect. That
is why `quickshell -c <config> kill` waits forever when the target accepts the
request but never completes shutdown.

The target's graceful path calls `EngineGeneration::destroy()`, schedules the
QML root for deletion, and only calls `QCoreApplication::exit()` from the root
destruction callback. The fallback `RootWrapper` destructor still performs
synchronous generation shutdown after `QGuiApplication` has been deleted. The
source makes both lifetime boundaries worth investigating, but does not prove
which wait accounts for this report's `futex_do_wait` state.

The newer upstream commits after v0.3.1 only change startup ordering and
generation-extension cleanup. They do not change `IpcClient::kill()`,
`EngineGeneration::destroy()`, or `RootWrapper` teardown:

- [v0.3.1 IPC kill implementation](https://github.com/quickshell-mirror/quickshell/blob/v0.3.1/src/ipc/ipc.cpp#L105-L145)
- [current IPC kill implementation](https://github.com/quickshell-mirror/quickshell/blob/2d3b3e9c70ef380dff751b61d334dc88df016c29/src/ipc/ipc.cpp#L105-L145)
- [current generation teardown](https://github.com/quickshell-mirror/quickshell/blob/2d3b3e9c70ef380dff751b61d334dc88df016c29/src/core/generation.cpp#L67-L136)
- [v0.3.1 release fixes](https://github.com/quickshell-mirror/quickshell/blob/v0.3.1/changelog/v0.3.1.md)

## Ranked hypotheses

1. A Qt Wayland or Quickshell teardown wait is left unresolved after the QML
   graph is destroyed. The minimal `ShellRoot {}` reproduces the behavior, and
   the stalled process has no children.
2. The `deleteLater()` root destruction path does not complete in this
   Wayland-session state, leaving the generation unable to reach its exit
   callback. A successful blocking `FileView` read correlates with recovery,
   but is not yet a causal explanation.
3. The IPC transaction or client wait is the primary cause. This is less likely:
   the request is received and logged, and upstream already fixed a related
   replay/null-generation crash in [#614](https://github.com/quickshell-mirror/quickshell/issues/614).

Only a backtrace captured while the minimal reproduction is stalled can
distinguish the first two hypotheses. The container cannot supply that
evidence because it has no Wayland session.

## Host-only reproduction and backtrace

Run this from the affected Hyprland session. It intentionally uses a temporary
config and only sends `SIGTERM` to the temporary process during cleanup.

```bash
set -u
test -n "${WAYLAND_DISPLAY:-}"
command -v quickshell timeout gdb pgrep ps >/dev/null

probe_dir=$(mktemp -d)
probe_pid=
cleanup() {
    if test -n "$probe_pid" && kill -0 "$probe_pid" 2>/dev/null; then
        kill "$probe_pid" 2>/dev/null || true
    fi
    rm -rf -- "$probe_dir"
}
trap cleanup EXIT

printf '%s\n' 'import Quickshell' '' 'ShellRoot {}' >"$probe_dir/shell.qml"
quickshell -p "$probe_dir" -d >"$probe_dir/start.log" 2>&1
sleep 1

pattern="^[^ ]*(quickshell|qs) -p $probe_dir -d$"
probe_pid=$(pgrep -f "$pattern" | head -n 1 || true)
test -n "$probe_pid"

kill_status=0
timeout 8 quickshell -p "$probe_dir" kill >"$probe_dir/kill.log" 2>&1 || kill_status=$?

if test "$kill_status" -eq 0; then
    echo "CLEAN EXIT: qs kill returned and the minimal ShellRoot exited"
elif test "$kill_status" -eq 124 && kill -0 "$probe_pid" 2>/dev/null; then
    echo "REPRODUCED: qs kill timed out and pid $probe_pid is still alive"
    ps -o pid,stat,wchan,cmd -p "$probe_pid"
    gdb -q -batch \
        -ex 'set pagination off' \
        -ex 'thread apply all bt' \
        -p "$probe_pid" 2>&1 | tee "$probe_dir/backtrace.txt"
    echo "Logs: $probe_dir/start.log $probe_dir/kill.log $probe_dir/backtrace.txt"
else
    echo "INCONCLUSIVE: kill status $kill_status"
    sed -n '1,120p' "$probe_dir/start.log" "$probe_dir/kill.log"
fi
```

`REPRODUCED` plus the `ps` and GDB output is the evidence needed for an
upstream report. `CLEAN EXIT` on a newer Quickshell build is evidence that the
regression no longer reproduces, not proof that the repository's mitigation is
still needed or that the root cause is understood.

The repository-side regression coverage remains in
[`tests/lock/wiring.test.js`](../tests/lock/wiring.test.js): it verifies that
`df-qs-restart` bounds `qs kill` and escalates a stalled instance instead of
starting a second one over it.
