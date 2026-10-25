import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Wayland
import qs
import qs.modules as Modules

Scope {
    id: root

    property bool shown: false
    property string page: "appearance"
    property var snapshot: ({ values: {}, themes: [], defaults: { roles: [] } })
    property string message: ""
    property bool failed: false
    property bool loaded: false
    readonly property bool busy: reader.running || operation.running
    readonly property string backend: `${Quickshell.env("HOME")}/dotfiles/bin/df-settings-control`
    readonly property string windowTitle: "Dotfiles Settings"

    function open(page: string): void {
        if (page)
            root.page = page;
        if (root.shown) {
            const window = ToplevelManager.toplevels.values.find(window => window.title === root.windowTitle);
            if (window) {
                window.minimized = false;
                window.activate();
            }
        }
        root.shown = true;
        root.refresh();
    }

    function refresh(): void {
        if (!root.busy)
            reader.running = true;
    }

    function apply(args: var): void {
        if (root.busy || !root.loaded)
            return;
        root.failed = false;
        root.message = "Applying changes…";
        operation.command = [root.backend].concat(args);
        operation.running = true;
    }

    function setValue(key: string, value: var): void {
        root.apply(["set", key, JSON.stringify(value)]);
    }

    function close(): void {
        if (!root.busy)
            root.shown = false;
    }

    function openPanel(name: string): void {
        const monitor = Hyprland.focusedMonitor;
        const panel = monitor ? QuickSettingsRegistry.panelFor(monitor.name) : null;
        if (!panel) {
            root.failed = true;
            root.message = "No Quick Settings panel is available on this monitor.";
            return;
        }
        if ((name === "bluetooth" && !panel.bluetoothAvailable) || (name === "network" && !panel.wifiDevice)) {
            root.failed = true;
            root.message = name === "bluetooth" ? "No Bluetooth adapter is available." : "No Wi-Fi adapter is available.";
            return;
        }
        const pages = {
            quick: Modules.QuickSettings.Primary,
            network: Modules.QuickSettings.Wifi,
            audio: Modules.QuickSettings.Audio,
            bluetooth: Modules.QuickSettings.Bluetooth,
            power: Modules.QuickSettings.Power
        };
        if (!panel.shown)
            panel.toggle(true);
        panel.navigate(pages[name] ?? Modules.QuickSettings.Primary, true);
    }

    Process {
        id: reader
        command: [root.backend, "snapshot"]
        stdout: StdioCollector { id: snapshotOutput }
        stderr: StdioCollector { id: snapshotError }
        onExited: (code, status) => {
            if (code !== 0) {
                root.failed = true;
                root.message = snapshotError.text.trim() || "Could not read desktop settings.";
                return;
            }
            try {
                root.snapshot = JSON.parse(snapshotOutput.text);
                root.loaded = true;
                if (root.snapshot.ignored?.length > 0) {
                    root.failed = true;
                    root.message = "Ignoring invalid settings.json entries: " + root.snapshot.ignored.join(", ")
                        + ". Fix or remove them to save changes.";
                }
            } catch (error) {
                root.failed = true;
                root.message = "Could not read desktop settings: " + error;
            }
        }
    }

    Process {
        id: operation
        stdout: StdioCollector {}
        stderr: StdioCollector { id: operationError }
        onExited: (code, status) => {
            root.failed = code !== 0;
            root.message = code === 0 ? "Changes saved" : operationError.text.trim() || "Could not apply this change.";
            // The compositor can close the window mid-change, hiding the status line.
            if (root.failed && !root.shown)
                Quickshell.execDetached(["notify-send", "-u", "critical", "Settings", root.message]);
            // A FileView opened before the first save has no file to watch yet.
            DesktopPreferences.reload();
            reader.running = true;
        }
    }

    LazyLoader {
        active: root.shown
        SettingsWindow { app: root }
    }

    IpcHandler {
        target: "settings"
        function open(): void { root.open(""); }
        function show(page: string): void { root.open(page); }
        function close(): void { root.close(); }
    }

    GlobalShortcut {
        appid: "settings"
        name: "open"
        onPressed: root.open("")
    }
}
