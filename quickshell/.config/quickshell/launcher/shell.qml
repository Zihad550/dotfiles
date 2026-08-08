import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import qs
import qs.modules

// The Launcher, as its own always-running Quickshell instance. Separate from
// the bar's `dotfiles` config, not a module inside it: QML is single-threaded
// and filtering the largest Provider was measured at 46-61ms per keystroke
// against ~17,000 entries, which inside the bar's process would block the
// bar, OSD and notification rendering on every keystroke. A fault here also
// can't take down the notification daemon.
//
// Restart with `df-qs-restart launcher`, which leaves the bar alone. One
// instance only, enforced by -n/--no-duplicate on every start. To read this
// instance's logs without starting a second one: `qs -c launcher log` (`-f` follows).
ShellRoot {
    // Created once at startup, never destroyed -- see Launcher.qml for why
    // it's not lazily loaded.
    Launcher {
        id: launcher
    }

    // The primary open path: registers straight with the compositor, so the
    // keypress reaches this process with no fork and no exec. The Hyprland
    // bind in hypr/.config/hypr/lua/bindings/system.lua dispatches
    // `hl.dsp.global("launcher:toggle")`, fired here as onPressed.
    //
    // `pressed` is also a bool property and shadows the signal in JavaScript
    // (`shortcut.pressed.connect(fn)` fails), hence `onPressed:` rather than
    // a hand-connected handler.
    GlobalShortcut {
        appid: "launcher"
        name: "toggle"

        onPressed: launcher.toggle()
    }

    // The dedicated clipboard keybind -- a second named shortcut rather than
    // one dispatcher branching on an argument, so each Surface stays a
    // one-line binding on both ends. Dispatched from
    // hypr/.config/hypr/lua/bindings/clipboard.lua.
    GlobalShortcut {
        appid: "launcher"
        name: "clipboard"

        onPressed: launcher.openOn("$")
    }

    // The workspace-rename keybind. Calls its own function rather than
    // openOn(): the workspaces Provider has no prefix, and this wants the
    // rename prompt for the focused workspace, not a searchable list of all
    // of them. Dispatched from hypr/.config/hypr/lua/bindings/utilities.lua
    // as SUPER+SHIFT+R.
    GlobalShortcut {
        appid: "launcher"
        name: "rename-workspace"

        onPressed: launcher.renameFocusedWorkspace()
    }

    // The four session-ending keybinds, which now ask before they act.
    // Registered one per action, not one shortcut taking an argument -- a
    // GlobalShortcut carries none, the name *is* the message. The name after
    // "confirm-" is the key lib/power.js declares. Bound in
    // hypr/.config/hypr/lua/bindings/system.lua.
    GlobalShortcut {
        appid: "launcher"
        name: "confirm-shutdown"

        onPressed: launcher.confirmPower("shutdown")
    }

    GlobalShortcut {
        appid: "launcher"
        name: "confirm-restart"

        onPressed: launcher.confirmPower("restart")
    }

    GlobalShortcut {
        appid: "launcher"
        name: "confirm-logout"

        onPressed: launcher.confirmPower("logout")
    }

    GlobalShortcut {
        appid: "launcher"
        name: "confirm-lock"

        onPressed: launcher.confirmPower("lock")
    }

    IpcHandler {
        target: "launcher"

        // The escape hatch: on-demand keyboard focus means a stuck Launcher
        // can't hold the keyboard hostage, so there's always a terminal to
        // run this from. Not bound to a keybind.
        function dismiss(): void {
            launcher.dismiss();
        }
    }

    // `qs -c launcher ipc call theme reload`, called by df-theme-set
    // alongside the identical call to the bar. Lives here rather than in
    // Theme.qml because an IpcHandler inside a Singleton doesn't register.
    IpcHandler {
        target: "theme"

        function reload(): void {
            Theme.reload();
        }
    }
}
