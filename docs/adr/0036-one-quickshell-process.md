# One Quickshell process runs the desktop

The bar, the Launcher, the Session Lock and the Idle Ladder run as one
Quickshell process from the `dotfiles` config, the Shared Shell. This reverses
the earlier split into three instances. That split kept the Launcher's large
directory searches from stalling bar rendering, kept a Launcher fault from
killing the notification daemon, and kept a bar restart from dropping a live
lock. The three processes cost about 484 MiB PSS against about 210 MiB for one,
so the shell now follows Omarchy's single-process design. It accepts shared
crashes, which `df-qs-launch` relaunches, and a 46–61ms render stall during
the largest searches. A restarted shell adopts the lock state file and recovers
a Stranded Lock, so a restart during a lock leaves it recoverable rather than
dropped. See `docs/quickshell-memory.md`.
