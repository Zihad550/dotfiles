import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs

// waybar: "hyprland/workspaces" with format "{name}" and on-click "activate".
// Styling from style.css: active = opacity 1 + bold, empty = 0.5, else 0.75.
//
// Splits the model in two: the numbered workspaces stay one button each, the
// special ones collapse into SpecialWorkspaces. This is still the only place
// that knows which monitor the bar is on.
Row {
    id: root

    property var barScreen

    readonly property HyprlandMonitor monitor: root.barScreen ? Hyprland.monitorFor(root.barScreen) : null

    // Hyprland keeps the open special workspace in a slot separate from the
    // monitor's active workspace, so HyprlandWorkspace.active is structurally
    // never true for one. Track it off the activespecial event instead.
    property string activeSpecial: ""

    // Events only report transitions, so seed from the monitor's IPC snapshot
    // in case a special workspace is already open when the bar starts.
    Component.onCompleted: root.activeSpecial = root.monitor?.lastIpcObject?.specialWorkspace?.name ?? ""

    function isSpecial(workspace) {
        return workspace.name === "special" || workspace.name.startsWith("special:");
    }

    // A special workspace that is not on screen may not report a monitor, so
    // matching one is only required when it claims a monitor at all -- being
    // strict here would leave SpecialWorkspaces with just the open one to show.
    readonly property var specials: Hyprland.workspaces.values.filter(ws => root.isSpecial(ws) && (!root.monitor || !ws.monitor || ws.monitor === root.monitor))

    readonly property var normals: Hyprland.workspaces.values.filter(ws => !root.isSpecial(ws) && (!root.monitor || ws.monitor === root.monitor))

    // 1.5px margin per side in waybar -> 3px between buttons.
    spacing: 3
    height: Theme.barHeight

    Connections {
        target: Hyprland

        // activespecial>>workspacename,monitorname
        // activespecialv2>>workspaceid,workspacename,monitorname
        // Both send an empty workspace name when the special is closed.
        function onRawEvent(event) {
            const v2 = event.name === "activespecialv2";
            if (!v2 && event.name !== "activespecial")
                return;

            // The event instance is reused once this handler returns, so pull
            // everything out now.
            const args = event.parse(v2 ? 3 : 2);
            const workspace = v2 ? args[1] : args[0];
            const monitorName = v2 ? args[2] : args[1];

            if (root.monitor && monitorName !== root.monitor.name)
                return;

            root.activeSpecial = workspace;
        }
    }

    // Left of the numbered workspaces, where the specials sorted anyway (their
    // ids are negative) -- now as one entry with the rest behind a menu.
    SpecialWorkspaces {
        workspaces: root.specials
        activeSpecial: root.activeSpecial
    }

    Repeater {
        model: root.normals

        delegate: Workspace {}
    }
}
