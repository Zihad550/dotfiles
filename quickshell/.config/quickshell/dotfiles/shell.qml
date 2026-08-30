import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import qs
import qs.modules

ShellRoot {
    // One bar per connected monitor. Variants destroys the instance when a
    // monitor is unplugged, which is what waybar's per-output handling did.
    Variants {
        model: Quickshell.screens

        Bar {}
    }

    BatteryService {}

    // The org.freedesktop.Notifications server, replacing mako. Not a
    // singleton: shell.qml owns it so the IpcHandler below can reach it.
    NotificationDaemon {
        id: notifications
    }

    // `qs -c dotfiles ipc call notifications <fn>`, used by the SUPER+COMMA
    // bindings in hypr/.config/hypr/lua/bindings/utilities.lua that used to
    // call makoctl. Note `qs ipc call` exits 0 even for a target that does not
    // exist, so a missing handler fails silently -- check `qs ipc show`.
    IpcHandler {
        target: "notifications"

        function dismissLast(): void {
            notifications.dismissLast();
        }

        function dismissAll(): void {
            notifications.dismissAll();
        }

        function toggleDnd(): void {
            notifications.toggleDnd();
        }
    }

    // The swayosd-server replacement. State is in OsdService; this is only the
    // window, so it is instantiated once and follows the active monitor.
    Osd {}

    // `qs -c dotfiles ipc call osd <fn> <arg>`, called by the media keys in
    // hypr/.config/hypr/lua/bindings/media.lua where they used to call
    // swayosd-client. Steps arrive as signed strings ("+5", "-1") so the coarse
    // and ALT-precise bindings share one handler.
    IpcHandler {
        target: "osd"

        function volumeRaise(step: string): void {
            OsdService.volumeRaise(step);
        }

        function volumeLower(step: string): void {
            OsdService.volumeLower(step);
        }

        function volumeMute(): void {
            OsdService.volumeMute();
        }

        function micMute(): void {
            OsdService.micMute();
        }

        function brightnessRaise(step: string): void {
            OsdService.brightnessRaise(step);
        }

        function brightnessLower(step: string): void {
            OsdService.brightnessLower(step);
        }

        function player(action: string): void {
            OsdService.player(action);
        }

        function message(text: string): void {
            OsdService.message(text);
        }

        function outputSwitched(name: string, level: string): void {
            OsdService.outputSwitched(name, level);
        }
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

    IpcHandler {
        target: "brightness"

        function refresh(): void {
            BacklightService.refresh();
        }
    }

    // The SUPER+CTRL+A keybind (hypr/.config/hypr/lua/bindings/utilities.lua)
    // -- opens whichever monitor's Quick Settings is focused, via the
    // registry each Bar fills in (QuickSettingsRegistry.qml). No fork/exec,
    // same reasoning as the Launcher's "launcher:toggle" in
    // quickshell/.config/quickshell/launcher/shell.qml.
    GlobalShortcut {
        appid: "quicksettings"
        name: "toggle"

        onPressed: {
            const monitor = Hyprland.focusedMonitor;
            if (!monitor) {
                console.warn("dotfiles: Hyprland.focusedMonitor is unavailable -- cannot open Quick Settings");
                return;
            }

            const panel = QuickSettingsRegistry.panelFor(monitor.name);
            if (!panel) {
                console.warn(`dotfiles: no Quick Settings panel registered for monitor ${monitor.name}`);
                return;
            }

            panel.toggle(true);
        }
    }
}
