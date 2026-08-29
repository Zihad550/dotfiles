import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

// The probe: the Session Lock's surface in an ordinary overlay window, with no
// session lock behind it.
//
//     df-qs-test lock-probe
//
// This is what makes the lock safe to develop. Everything visual and everything
// about authentication is the same code path the real lock uses -- the same
// LockSurface.qml, the same theme data, the same `df-lock` PAM service, so a
// correct password really is checked and a wrong one really is rejected -- but
// nothing holds the compositor. Ctrl-C ends it, Escape on an empty field gives
// the keyboard back, and a successful password just closes the window.
//
// A separate config directory rather than a flag on the lock config, so that
// running the probe can never be one typo away from taking a real lock. The
// lock's files are reached through the symlinks beside this one, not by a
// relative import -- see docs/adr/0018-lock-probe-shares-the-surface-by-symlink.md.
ShellRoot {
    id: root

    PanelWindow {
        id: window

        anchors {
            top: true
            bottom: true
            left: true
            right: true
        }

        color: "transparent"
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "df-lock-probe"
        WlrLayershell.layer: WlrLayer.Overlay
        // Exclusive, like a real lock surface: a probe that let keystrokes
        // through would not be probing the thing that matters.
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

        LockSurface {
            id: surface

            anchors.fill: parent
            inputEnabled: window.visible

            onUnlocked: {
                console.log("df lock probe: authentication succeeded");
                root.dismiss();
            }

            // The way out that does not need the terminal, since the window
            // holds the keyboard exclusively while it is up. Only an Escape on
            // an already-empty field gets here -- LockSurface takes the rest to
            // clear what has been typed.
            Keys.onEscapePressed: root.dismiss()
        }
    }

    // Hidden rather than closed: the instance stays up so the surface can be
    // brought back without losing the terminal it is running in.
    function dismiss(): void {
        window.visible = false;
        surface.reset();
        console.log("df lock probe: dismissed; Ctrl-C to stop, or `qs -c lock-probe ipc call probe open` to bring it back");
    }

    IpcHandler {
        target: "probe"

        // Not `show`: `qs ipc call probe show` collides with the `ipc show`
        // subcommand and prints the target listing instead of calling this.
        function open(): string {
            window.visible = true;
            surface.focusField();
            return "ok";
        }

        function hide(): string {
            root.dismiss();
            return "ok";
        }
    }
}
