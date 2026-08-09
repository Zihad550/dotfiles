import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs

// Shared chrome for a bar entry's dropdown: a PopupWindow anchored under an
// item, a bordered Column of rows built from a model + delegate, and
// dismiss-on-outside-click via HyprlandFocusGrab.
PopupWindow {
    id: root

    property Item target
    property var model: []
    property Component delegate: null

    property bool shown: false

    // Set when the focus grab closes the flyout. Hyprland may still deliver
    // that click to the entry underneath, which would immediately reopen
    // what the user just dismissed; toggle() ignores an open right after.
    property double lastCleared: 0

    function toggle(): void {
        if (!root.shown && Date.now() - root.lastCleared < 200)
            return;
        root.shown = !root.shown;
    }

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown

        onCleared: {
            root.lastCleared = Date.now();
            root.shown = false;
        }
    }

    anchor.item: root.target
    anchor.rect.x: 0
    anchor.rect.y: root.target ? root.target.height : 0

    visible: root.shown
    color: "transparent"

    implicitWidth: Theme.menuWidth
    implicitHeight: rows.implicitHeight + 2 * Theme.menuPadding

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        Column {
            id: rows

            // Top/left/right only: the Column's own height drives the popup's.
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.margins: Theme.menuPadding
            spacing: 2

            Repeater {
                model: root.model
                delegate: root.delegate
            }
        }
    }
}
