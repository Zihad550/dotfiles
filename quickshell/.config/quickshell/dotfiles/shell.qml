import Quickshell
import Quickshell.Io
import qs
import qs.modules

ShellRoot {
    // One bar per connected monitor. Variants destroys the instance when a
    // monitor is unplugged, which is what waybar's per-output handling did.
    Variants {
        model: Quickshell.screens

        Bar {}
    }

    // `qs -c dotfiles ipc call theme reload`, used by df-theme-set. Lives here
    // rather than in Theme.qml because an IpcHandler inside a Singleton does not
    // register -- `qs ipc show` listed no targets until it moved.
    IpcHandler {
        target: "theme"

        function reload(): void {
            Theme.reload();
        }
    }
}
