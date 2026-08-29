# The lock probe shares the lock's surface by symlink

`quickshell/.config/quickshell/lock-probe/` is a Quickshell config of its own,
holding one real file — `shell.qml`, the probe window — and symlinks to the
Session Lock's `LockSurface.qml`, `Theme.qml` and `lib/`. Both configs load the
same files from disk.

## Why

**The probe is only worth having if it is the same surface.** A probe that
renders a copy of the lock proves the copy works. The point of it — iterating on
appearance and on authentication with no possibility of lockout — evaporates the
moment the two can drift.

**Quickshell will not import across config roots.** Each config directory is its
own import namespace, which is why the bar and the Launcher each carry their own
`Theme.qml`. A relative directory import out of the probe is refused outright:

    WARN quickshell.qmlscanner: Module path ".../lock" is outside of the config folder.
    ERROR: Type Lock.LockSurface unavailable

Symlinks put the files inside the config folder, which is the only thing the
scanner asks about.

**A second entry file in one config directory was the alternative.**
`qs -p ~/.config/quickshell/lock/probe.qml` needs no symlinks and no second
directory. It was rejected for the same reason the probe exists: the safe
command and the one that takes a real lock would then differ by a path fragment
typed into the same config, and `df-qs-test lock-probe` — which refuses the
live configs by name — would have nothing to refuse.

## Consequences

Editing `lock-probe/LockSurface.qml` edits the lock's. That is the intent, and
it is the thing that will surprise someone who opened the file through the probe
directory.

Anything the lock adds beside those three entries — a new directory, a new
top-level component — has to be symlinked in as well, or the probe stops
building. The failure is loud (`Type X unavailable` at startup), not silent.
