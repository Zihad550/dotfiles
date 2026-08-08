# Comment cleanup

Triggered by a grilling session on 2026-08-08: `quickshell/.config/quickshell/launcher/`
had grown essay-length design-narrative comments (44-78% comment density across
~30 files, `Launcher.qml` alone was 1806 lines / 974 comment lines). Resolved by
trimming that directory directly (see git history) and tightening the code-comment
rule in `CLAUDE.md`.

While surveying comment density repo-wide for that pass, a second, unrelated
problem turned up in `hypr/lua/` and `bin/` — see issue 01. It was explicitly
left out of the `launcher/` cleanup because it's a different failure mode with
different judgment calls (which disabled blocks are load-bearing "kept for quick
swapping" vs. actually stale), not a rider on the same fix.
