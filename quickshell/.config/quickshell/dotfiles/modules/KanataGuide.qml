import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs
import "lib/barPanel.js" as BarPanel
import "lib/kanataLayers.js" as Layers

PopupWindow {
    id: root

    property Item target
    property bool shown: false
    property double lastCleared: 0
    property string selectedLayer: "base"

    function dismiss(): void {
        root.shown = false;
    }

    function toggle(): void {
        if (!root.shown && BarPanel.shouldSuppressReopen(root.lastCleared, Date.now()))
            return;
        if (root.shown) {
            root.dismiss();
        } else {
            root.shown = true;
            Qt.callLater(() => content.forceActiveFocus());
        }
    }

    anchor.item: root.target
    anchor.adjustment: PopupAdjustment.Slide
    anchor.rect.x: root.target ? root.target.width - root.width : 0
    anchor.rect.y: root.target ? root.target.height : 0
    visible: root.shown
    grabFocus: root.shown
    color: "transparent"
    implicitWidth: panel.width
    implicitHeight: content.height

    onShownChanged: {
        if (root.shown)
            BarPanelCoordinator.claim(root);
        else
            BarPanelCoordinator.release(root);
    }
    Component.onDestruction: BarPanelCoordinator.release(root)

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown
        onCleared: {
            root.lastCleared = Date.now();
            root.dismiss();
        }
    }

    Column {
        id: content

        focus: root.shown
        Keys.onEscapePressed: root.dismiss()

        Rectangle {
            width: panel.width
            height: tabs.height + 2 * Theme.menuPadding
            color: Theme.background

            Row {
                id: tabs

                x: Theme.menuPadding
                y: Theme.menuPadding
                spacing: 8

                Repeater {
                    model: Object.keys(Layers.LAYERS)

                    delegate: Rectangle {
                        id: tab
                        required property string modelData
                        readonly property bool selected: root.selectedLayer === tab.modelData

                        width: label.implicitWidth + 24
                        height: Theme.menuRowHeight
                        radius: 4
                        color: tab.selected ? Theme.accent : "transparent"
                        border.color: Theme.accent

                        Text {
                            id: label
                            anchors.centerIn: parent
                            text: Layers.LAYERS[tab.modelData].label
                            color: tab.selected ? Theme.background : Theme.foreground
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.selectedLayer = tab.modelData
                        }
                    }
                }
            }
        }

        KanataGuidePanel {
            id: panel
            selectedLayer: root.selectedLayer
            keySize: Math.max(32, Math.min(52, Math.floor((root.screen?.width ?? 1200) * 0.5 / 12)))
        }
    }
}
