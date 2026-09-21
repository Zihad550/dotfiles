import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs
import "lib/barPanel.js" as BarPanel
import "lib/displayPanel.js" as DisplayPanelModel

PopupWindow {
    id: root

    property Item target
    property bool shown: false
    property double lastCleared: 0
    property var displays: []
    property int selectedIndex: 0
    readonly property int enabledDisplayCount: DisplayPanelModel.enabledCount(root.displays)

    function refresh(): void {
        if (finder.running)
            return;
        finder.command = ["hyprctl", "monitors", "all", "-j"];
        finder.running = true;
    }

    function open(): void {
        root.refresh();
        BarPanelCoordinator.claim(root);
        root.shown = true;
        Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    function dismiss(): void {
        root.shown = false;
    }

    function toggle(): void {
        if (!root.shown && BarPanel.shouldSuppressReopen(root.lastCleared, Date.now()))
            return;
        if (root.shown)
            root.dismiss();
        else
            root.open();
    }

    function moveSelection(delta: int): void {
        if (root.displays.length === 0)
            return;
        root.selectedIndex = Math.max(0,
            Math.min(root.displays.length - 1, root.selectedIndex + delta));
    }

    function activateSelected(): void {
        if (root.selectedIndex < 0 || root.selectedIndex >= root.displays.length)
            return;
        const display = root.displays[root.selectedIndex];
        root.toggleDisplay(display.name, display.enabled);
    }

    function toggleDisplay(name: string, enabled: bool): void {
        if (!name || action.running)
            return;
        if (enabled && root.enabledDisplayCount <= 1)
            return;
        if (!/^[A-Za-z0-9._-]+$/.test(name))
            return;

        // hyprctl keyword is rejected under the Lua config parser; eval an hl.monitor() call instead.
        // hl.monitor merges into the existing rule, so enabling must set disabled = false explicitly.
        const chunk = enabled
            ? `hl.monitor({ output = '${name}', disabled = true })`
            : `hl.monitor({ output = '${name}', disabled = false })`;
        action.command = ["hyprctl", "eval", chunk];
        action.running = true;
    }

    anchor.item: root.target
    anchor.adjustment: PopupAdjustment.Slide
    anchor.rect.x: root.target ? root.target.width - root.width : 0
    anchor.rect.y: root.target ? root.target.height : 0

    visible: root.shown
    grabFocus: root.shown
    color: "transparent"
    implicitWidth: Theme.menuWidth
    implicitHeight: Math.min(
        content.implicitHeight + 2 * Theme.menuPadding,
        root.screen ? root.screen.height - Theme.barHeight - Theme.edgeMargin : 10000
    )

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

    Process {
        id: finder

        stdout: StdioCollector { id: listingOutput }
        stderr: StdioCollector {}

        onExited: {
            root.displays = DisplayPanelModel.parseDisplays(listingOutput.text);
            root.selectedIndex = Math.max(0,
                Math.min(root.selectedIndex, root.displays.length - 1));
        }
    }

    Process {
        id: action

        stdout: StdioCollector {}
        stderr: StdioCollector { id: actionError }

        onExited: exitCode => {
            if (exitCode !== 0)
                console.warn(`display: monitor toggle failed: ${actionError.text.trim()}`);
            root.refresh();
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        FocusScope {
            id: keyCatcher

            anchors.fill: parent
            anchors.margins: Theme.menuPadding
            focus: root.shown

            Keys.onEscapePressed: root.dismiss()
            Keys.onUpPressed: root.moveSelection(-1)
            Keys.onDownPressed: root.moveSelection(1)
            Keys.onReturnPressed: root.activateSelected()
            Keys.onEnterPressed: root.activateSelected()
            Keys.onPressed: event => {
                if (event.key === Qt.Key_J) {
                    root.moveSelection(1);
                    event.accepted = true;
                } else if (event.key === Qt.Key_K) {
                    root.moveSelection(-1);
                    event.accepted = true;
                }
            }

            Column {
                id: content

                width: parent.width
                spacing: 6

                Text {
                    text: "DISPLAYS"
                    color: Theme.foreground
                    opacity: 0.65
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize - 2
                    textFormat: Text.PlainText
                }

                Text {
                    visible: root.displays.length === 0
                    text: finder.running ? "Loading displays…" : "No displays found"
                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    textFormat: Text.PlainText
                }

                Repeater {
                    model: root.displays

                    Rectangle {
                        id: displayRow

                        required property var modelData
                        required property int index
                        readonly property bool canToggle: !displayRow.modelData.enabled
                            || root.enabledDisplayCount > 1

                        width: content.width
                        height: Theme.menuRowHeight
                        radius: 4
                        color: displayRow.index === root.selectedIndex
                            ? Theme.accent : "transparent"
                        opacity: displayRow.canToggle ? 1 : 0.45

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 8
                            spacing: 8

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: "󰍹"
                                color: displayRow.index === root.selectedIndex
                                    ? Theme.background : Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize + 1
                                textFormat: Text.PlainText
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                width: parent.width - 54
                                text: displayRow.modelData.name
                                    + (displayRow.modelData.focused ? " · focused" : "")
                                color: displayRow.index === root.selectedIndex
                                    ? Theme.background : Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize
                                elide: Text.ElideRight
                                textFormat: Text.PlainText
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: displayRow.modelData.enabled ? "󰄬" : ""
                                color: displayRow.index === root.selectedIndex
                                    ? Theme.background : Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize
                                textFormat: Text.PlainText
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: displayRow.canToggle ? Qt.PointingHandCursor : Qt.ArrowCursor
                            onEntered: root.selectedIndex = displayRow.index
                            onClicked: {
                                if (displayRow.canToggle)
                                    root.toggleDisplay(displayRow.modelData.name, displayRow.modelData.enabled);
                            }
                        }
                    }
                }
            }
        }
    }
}
