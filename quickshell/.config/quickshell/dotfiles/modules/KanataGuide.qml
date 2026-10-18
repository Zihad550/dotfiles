import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs

// The Layer Guide: physical key -> output for the held Kanata layer, under the
// Bar on the focused monitor. It takes no keyboard focus and no pointer input,
// so every keystroke still reaches the focused application.
Scope {
    id: root

    property bool locked: false
    readonly property var focusedScreen: Quickshell.screens.find(screen => screen.name === Hyprland.focusedMonitor?.name) ?? null

    LazyLoader {
        active: KanataService.guideLayer !== "" && !root.locked && root.focusedScreen !== null

        PanelWindow {
            id: guide

            screen: root.focusedScreen
            anchors.top: true
            // Zero keeps the guide below the Bar's zone without reserving one.
            exclusiveZone: 0
            WlrLayershell.layer: WlrLayer.Overlay
            WlrLayershell.namespace: "kanata-guide"
            WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
            mask: Region {}
            color: "transparent"

            implicitWidth: panel.width
            implicitHeight: panel.height + Theme.edgeMargin

            KanataGuidePanel {
                id: panel

                y: Theme.edgeMargin
                keySize: Math.max(32, Math.min(52, Math.floor(root.focusedScreen.width * 0.5 / 12)))
            }
        }
    }
}
