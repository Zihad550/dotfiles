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
