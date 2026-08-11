import QtQuick
import Quickshell
import qs

// Shared chrome for Quick Settings' rows: leading glyph, label, trailing detail
// text, hover highlight and click handling. The panel's counterpart to BarItem.
// Rows that need more than one line (Volume) stack this in a Column of their
// own rather than nesting content inside it.
Item {
    id: root

    property string icon: ""
    property string label: ""
    property string detail: ""

    // Trailing switch, for rows that are a state rather than an action. The
    // switch is an indicator only -- clicking anywhere on the row flips it,
    // through the same `clicked` signal as every other row.
    property bool toggleVisible: false
    property bool toggleOn: false

    // Ticket 05: an optional second click target on the glyph. Off by
    // default, so every row that doesn't set this is unchanged.
    property bool glyphClickable: false

    signal clicked
    // Emitted alongside `clicked` so the panel can close itself. A second
    // `onClicked` at the use site would shadow the one the module file declares
    // for its own action, hence the separate signal.
    signal closeRequested
    signal glyphClicked
    // Ticket 08: a right-click alternative to `clicked`, for rows that offer
    // destructive actions off the everyday click. No `closeRequested`
    // counterpart -- opening a menu must not close the panel it's drawn in.
    signal rightClicked

    // QuickSettings sets the real width; this is just the fallback.
    implicitWidth: Theme.menuWidth - 2 * Theme.menuPadding
    implicitHeight: Theme.menuRowHeight

    Rectangle {
        // Bleeds into the menu's padding so the highlight is not a floating
        // strip inset from the border.
        anchors.fill: parent
        anchors.leftMargin: -Theme.menuPadding / 2
        anchors.rightMargin: -Theme.menuPadding / 2
        color: Theme.accent
        opacity: mouse.containsMouse ? 0.18 : 0
        radius: 3
    }

    Text {
        id: glyph

        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter

        text: root.icon
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    Text {
        id: labelText

        anchors.left: glyph.right
        anchors.leftMargin: Theme.menuPadding
        anchors.verticalCenter: parent.verticalCenter

        text: root.label
        color: Theme.foreground
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize
        textFormat: Text.PlainText
    }

    Rectangle {
        id: toggle

        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter

        visible: root.toggleVisible
        width: 32
        height: 16
        radius: height / 2
        color: root.toggleOn ? Theme.accent : Theme.foreground
        opacity: root.toggleOn ? 1 : 0.25

        Rectangle {
            y: 3
            x: root.toggleOn ? parent.width - width - 3 : 3
            width: 10
            height: 10
            radius: height / 2
            color: Theme.background

            Behavior on x {
                NumberAnimation {
                    duration: 120
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    Text {
        // Anchored on both sides rather than sized from implicitWidth, which
        // loops against elide.
        anchors.left: labelText.right
        anchors.leftMargin: Theme.menuPadding
        anchors.right: toggle.visible ? toggle.left : parent.right
        anchors.rightMargin: toggle.visible ? Theme.menuPadding : 0
        anchors.verticalCenter: parent.verticalCenter

        text: root.detail
        color: Theme.foreground
        opacity: 0.6
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSize - 2
        textFormat: Text.PlainText
        elide: Text.ElideRight
        horizontalAlignment: Text.AlignRight
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton

        onClicked: event => {
            if (event.button === Qt.RightButton) {
                root.rightClicked();
            } else {
                root.clicked();
                root.closeRequested();
            }
        }
    }

    // Declared after `mouse`, so it sits on top and a click here never falls
    // through. Disabled MouseAreas don't hit-test, which is what makes
    // `glyphClickable`'s off-by-default safe for every other row.
    Rectangle {
        id: glyphHighlight

        visible: root.glyphClickable
        anchors.fill: glyphMouse
        radius: 4
        color: Theme.accent
        opacity: glyphMouse.containsMouse ? 0.25 : 0
    }

    MouseArea {
        id: glyphMouse

        // Spans from the row's left edge (bleeding into the menu's padding,
        // like the highlight above) to just short of the label -- as padded
        // as it can be without ever eating into the row's own click area. A
        // bare ~16px target whose action drops the connection is a mis-click
        // waiting to happen.
        anchors.left: parent.left
        anchors.leftMargin: -Theme.menuPadding / 2
        anchors.right: labelText.left
        anchors.rightMargin: 2
        anchors.verticalCenter: parent.verticalCenter
        height: root.height
        enabled: root.glyphClickable
        hoverEnabled: root.glyphClickable

        onClicked: root.glyphClicked()
    }
}
