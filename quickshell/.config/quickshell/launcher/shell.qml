import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import qs
import qs.modules

// The Launcher, as its own always-running Quickshell instance.
//
// Separate from the bar's `dotfiles` config rather than a module inside it,
// for two reasons. QML is single-threaded, and filtering the largest Provider
// was measured at 46-61ms per keystroke against ~17,000 entries -- inside the
// bar's process that would block the bar, OSD and notification rendering on
// every keystroke. And a fault in here cannot take down the notification
// daemon.
//
// The cost is a second process and a second Theme.qml; see that file for why
// the theme still cannot drift between the two.
//
// Restart with `df-qs-restart launcher`, which leaves the bar alone.
//
// One instance only, enforced by -n/--no-duplicate on every start (ticket 21):
// a second would register the keybinds below out of phase and split the
// theme-reload IPC. To read this instance's logs without starting a second
// one, `qs -c launcher log` (`-f` follows, `-t N` tails).
ShellRoot {
    // The window itself, created once at startup and never destroyed -- see
    // modules/Launcher.qml for why it is not lazily loaded.
    Launcher {
        id: launcher
    }

    // The primary open path -- see .scratch/launcher/issues/10. Registers
    // straight with the compositor (confirmed working, unknown 1 in ticket 01),
    // so the keypress reaches this process with no fork and no exec: the
    // Hyprland bind in hypr/.config/hypr/lua/bindings/system.lua dispatches
    // `hl.dsp.global("launcher:toggle")`, which this fires as onPressed.
    //
    // `pressed` is also a bool property and shadows the signal in JavaScript --
    // `shortcut.pressed.connect(fn)` fails with "Property 'connect' of object
    // false is not a function" -- so the handler is declared as `onPressed:`
    // rather than connected to by hand.
    GlobalShortcut {
        appid: "launcher"
        name: "toggle"

        onPressed: launcher.toggle()
    }

    // Ticket 14's dedicated clipboard keybind -- the same registration shape
    // as "toggle" above, a second named shortcut rather than a second
    // dispatcher branching on an argument, so each Surface (CONTEXT.md's own
    // term) stays a one-line binding on both ends. Dispatched from
    // hypr/.config/hypr/lua/bindings/clipboard.lua:
    // `hl.dsp.global("launcher:clipboard")`, replacing the old
    // `df-launch-walker -m clipboard` exec (deleted with ticket 19).
    GlobalShortcut {
        appid: "launcher"
        name: "clipboard"

        onPressed: launcher.openOn("$")
    }

    // The workspace-rename keybind. Same registration shape again -- a third
    // named shortcut rather than an argument -- but it opens the Launcher into
    // a mode rather than onto a Provider, so it calls its own function instead
    // of openOn(): the workspaces Provider has no prefix, and the thing wanted
    // is the rename prompt for the focused workspace, not a searchable list of
    // all of them. Dispatched from
    // hypr/.config/hypr/lua/bindings/utilities.lua as SUPER+SHIFT+R, which is
    // the keybind the deleted walker rename menu used to answer.
    GlobalShortcut {
        appid: "launcher"
        name: "rename-workspace"

        onPressed: launcher.renameFocusedWorkspace()
    }

    // The four session-ending keybinds, which now ask before they act.
    //
    // Registered one per action rather than one shortcut taking the action as
    // an argument, because a GlobalShortcut carries no argument -- the name
    // *is* the message -- and because that is already the shape of the two
    // above. The name after "confirm-" is the key lib/power.js declares; the
    // two disagreeing is a keybind that logs a warning and does nothing, which
    // is why confirmPower names the valid keys in that warning.
    //
    // Bound in hypr/.config/hypr/lua/bindings/system.lua, replacing the binds
    // that ran these commands outright.
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

    // `toggle` moved to the GlobalShortcut above with ticket 10 -- this is no
    // longer the keybind's path, and nothing else in the repo calls it, so it
    // is not carried forward as a second trigger.
    IpcHandler {
        target: "launcher"

        // The escape hatch. On-demand keyboard focus means a stuck Launcher
        // cannot hold the keyboard hostage, so there is always a terminal to
        // run this from. Exposed for that, not for a keybind.
        function dismiss(): void {
            launcher.dismiss();
        }
    }

    // `qs -c launcher ipc call theme reload`, called by df-theme-set alongside
    // the identical call to the bar. Lives here rather than in Theme.qml
    // because an IpcHandler inside a Singleton does not register -- `qs ipc
    // show` listed no targets until the bar's moved out.
    IpcHandler {
        target: "theme"

        function reload(): void {
            Theme.reload();
        }
    }
}
