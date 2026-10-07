# Workspace navigation

Super+1 through Super+0 open numbered workspaces 1 through 10. Pressing the
same shortcut while that workspace is visible returns to the workspace you
came from, including a special workspace. For example, Super+U, Super+3,
Super+3 returns to Herdr. This also works when Herdr overlays workspace 3.

The numbered bindings call `bin/df-hypr-workspace-toggle`. Numbered returns use
Hyprland's `previous_per_monitor` history. When leaving a special workspace,
the helper remembers both its name and its underlying numbered workspace.
Return files live in `XDG_RUNTIME_DIR` and are scoped to the compositor session
and destination workspace. Entering from a numbered workspace clears an older
special return for that destination.
The `workspace.active` Lua event clears the destination's saved return on
activation, including Tab navigation and mouse scrolling. The shortcut helper
writes its new return after the dispatch completes.

Application shortcuts using `bin/df-launch-special-workspace` also remember
the previous special workspace. Super+U, Super+D, Super+D returns to Herdr.
Opening an application from a numbered workspace and pressing its shortcut
again hides the application workspace. Special return files are scoped to the
session, monitor, and application workspace. They are ignored if the underlying
numbered workspace changed.

Super+S uses the launcher's `--toggle-only magic` mode. It toggles the magic
workspace without selecting or launching an application and restores the
previous special workspace on a second press.

An empty previous special workspace is not reopened. Window movement shortcuts,
Tab navigation, and mouse scrolling keep their existing behavior.
