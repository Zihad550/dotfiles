# Wellbeing

Wellbeing runs inside the Shared Shell and records the focused Wayland
application's ID. Open **Wellbeing** from the Launcher or run
`qs -c dotfiles ipc call wellbeing open`. The desktop entry is installed by
the existing `quickshell` Stow package. Restart the Shared Shell after updating.

The Dashboard and History pages share a date range and application search.
Choose today, the past week, month (30 days), year (365 days), all saved history,
or inclusive custom dates (`YYYY-MM-DD`). Future custom end dates stop at today.
Search matches desktop application names and IDs, ignoring case. History lists
each day newest first, with applications ranked by time within that day.

The Dashboard shows total time, average per calendar day (including days with
no saved time), busiest day, application shares, and a focused-time trend. Long
ranges combine consecutive days into at most 31 bars; hover for bucket dates
and totals. Comparisons use the immediately preceding equal-length period
and the same application search. Missing days mean no saved data, and may
reflect tracking being paused or not yet installed rather than no computer use.

Daily totals are kept indefinitely. Existing version 1 files load unchanged;
history already discarded by the earlier 30-day limit cannot be recovered.
Desktop entry names are used when available; otherwise the application ID is
shown. Browser tabs and terminal programs share their parent application's
total. No titles, URLs, keystrokes, or individual activity events are stored.

Tracking pauses after five minutes without input, while the Session Lock is
active, or when Pause tracking is selected. The five minutes before idle are
included. Idle inhibitors and Stay Awake do not override this cutoff. Pause
tracking persists across restarts. Closing the window keeps tracking running.
Only the focused application counts, regardless of how many windows are visible.

Totals are saved atomically every 30 seconds to
`${XDG_STATE_HOME:-~/.local/state}/df-wellbeing/usage.json`. History is retained
until you remove the file. Restart downtime is excluded; a crash may lose the
last 30 seconds. Large sampling gaps (over 15 seconds) and clock adjustments
are excluded to avoid counting suspend time. The app shows storage errors;
unreadable or invalid history disables tracking instead of overwriting it.
To erase history, stop the Shared Shell before removing the file.

Run `node --test tests/quickshell/wellbeing.test.js` and
`python -m unittest discover -s tests/quickshell -p test_wellbeing_runtime.py`.
On a live Hyprland session, verify switching apps, idle, lock/unlock, midnight,
and shell restart. An offscreen test checks QML, persistence, and transitions
but cannot establish compositor focus or idle protocol behavior.
