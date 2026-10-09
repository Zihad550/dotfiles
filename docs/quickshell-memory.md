# Quickshell memory and process lifecycle

The bar, launcher, Session Lock, and Idle Ladder run in one `dotfiles` config.
The launcher and lock modules live inside its config root so Quickshell can
resolve their imports. Scratch probes stay separate and take no session lock.

The decision and its trade-offs are in
[ADR 0036](adr/0036-one-quickshell-process.md). Lock state remains in the
runtime state file, and a replacement shell adopts it and recovers a Stranded Lock.

## Memory policy

- Keep the launcher window ready for its compositor shortcut. Do not score
  queries or retain result delegates while it is hidden.
- Refresh prefix-only and nested listing providers when selected. Release their
  listings, stdout collectors, and prepared catalogs after 30 seconds of inactivity.
  Other entered providers release their prepared catalogs on the same timer.
  Cancel expired read-only listing commands before dropping their collectors.
  Keep the small provider objects alive so actions in flight can finish and report outcomes.
- Keep the shared directory snapshots, but release their prepared catalogs on
  the same inactivity timer. Files listing runs only while that provider is selected.
- Load Quick Settings pages on navigation. Release them after their exit fade,
  or immediately when the panel closes. Services own operations which outlive a page.
- Clear image-preview sources while the launcher is hidden and disable large
  image caching. Lock wallpapers decode at half resolution for their heavy blur
  and skip the image cache, so an unlock releases them.

## Restarts and compatibility

Autostart and `df-qs-restart` start the shell only through `df-qs-launch`. It
runs `quickshell -c dotfiles -n` with `QS_DISABLE_FILE_WATCHER=1` and
`QS_NO_RELOAD_POPUP=1`, sends its output to the journal as `df-qs`, and
relaunches it after an abnormal exit, giving up after five in a minute. A clean
exit, such as an IPC kill, ends supervision. Use `df-qs-restart` after QML edits.
Theme and state FileViews still watch their data files, and `df-theme-set`
reloads the bar and Launcher themes through one IPC call. Lock surfaces read the
theme each time they are created. `df-font-set` updates module metrics and runs
`df-qs-restart --if-running`.

`df-qs-restart launcher` and `df-qs-restart lock` restart the Shared Shell.
It finds instances through `quickshell list` (`df-qs-instances`), not command
lines, and stops old launcher, bar, and lock instances with `quickshell kill`,
the old lock last. It first releases the old supervisor with `SIGUSR1`, so a
shell that crashes on the way out is not relaunched beside the new one. It
sends `SIGTERM` to one that will not exit, and refuses to launch over a
survivor. It checks Hyprland is reachable before stopping anything, launches
through Hyprland so the shell gets the session's environment, and succeeds only
once the new shell answers over IPC with its lock target. Restarting while locked is
allowed: the new shell recovers the Stranded Lock.

The `qs` shim maps the old config names to `dotfiles` for IPC and log calls, and
refuses to launch the Shared Shell itself. Direct `quickshell` calls must
select `dotfiles`.

The lock's PAM service, idle timing overrides, logind delay inhibitor, and
`DOTFILES_PROFILE` behavior are unchanged. The lock probe still imports the
real surface through symlinks. See the [recovery runbook](session-lock-break-glass.md).

## Measurement and validation

Use `/proc/PID/smaps_rollup` and sum `Pss`, rather than summing RSS, which
counts shared pages repeatedly. Before consolidation, live PSS was about
157 MiB for the bar, 200 MiB for the launcher, and 127 MiB for the unlocked
lock. A minimal Quickshell instance used about 59 MiB PSS. These are baseline
measurements, not predicted savings.

On 2026-10-08, the live migration reduced summed PSS from 484.4 MiB to
182.4 MiB immediately after startup. After opening and dismissing the launcher,
clipboard, and Quick Settings, PSS was 216.4 MiB, settling to 209.5 MiB after
cache expiry. That is about 57% below the pre-migration footprint. A restart
also clears old allocations, so this measures the combined change rather than
isolating each optimization. Exactly one desktop Quickshell process remained.

On 2026-10-09, after the retention and launch changes, a fresh shell used
186.9 MiB. Opening the launcher and clipboard (750 entries) raised it to
232.7 MiB; dismissing them and toggling Quick Settings left 224.8 MiB, settling
to 221.7 MiB after the release timer. That is about 54% below the
pre-migration footprint. The release timer returned about 11 MiB; the rest is
retained by the QML engine and allocator, so the figures vary with what was opened.

Live checks confirmed launcher/clipboard shortcuts and dismissal, Quick Settings
toggling, legacy launcher IPC, theme reload, and the lock's delay inhibitor.
They also confirmed a restart while locked: the new shell recovered the
Stranded Lock and the screens stayed covered. A restart with no
`WAYLAND_DISPLAY` stopped the old shell cleanly, and a killed shell was
relaunched by its supervisor.

Run the launcher, lock, bar, and shared-shell tests. The shared-shell runtime
check compiles the production config without instantiating its services. It
exercises provider retention, queued and cancelled listings, and Quick Settings
page release against the real QML engine, waiting on each condition under a
deadline. It requires a Wayland session because Quickshell window types need
that backend.

Sources: the local Omarchy `docs/omarchy-shell.md`, `shell/shell.qml`, and
`bin/omarchy-launch-shell`; [Quickshell environment options](https://quickshell.org/docs/v0.3.0/guide/advanced/);
[Qt Loader lifecycle](https://doc.qt.io/qt-6/qml-qtquick-loader.html);
[Qt image sizing and caching](https://doc.qt.io/qt-6/qml-qtquick-image.html).
