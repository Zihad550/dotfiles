import QtQuick
import qs

// Shared Page chrome: a fixed back/title header and a body that scrolls
// independently when the panel reaches the active monitor's height.
Item {
    id: root

    property string title: ""
    property bool active: false
    default property alias contentData: pageBody.data

    signal back(bool keyboard)

    function focusHeader(): void {
        backTarget.forceActiveFocus();
    }

    function revealFocusedBodyItem(item): void {
        if (!item || !root.active)
            return;

        let ancestor = item;
        while (ancestor && ancestor !== pageBody)
            ancestor = ancestor.parent;
        if (ancestor !== pageBody)
            return;

        const position = item.mapToItem(pageBody, 0, 0);
        const top = position.y;
        const bottom = top + item.height;
        if (top < scroller.contentY)
            scroller.contentY = Math.max(0, top);
        else if (bottom > scroller.contentY + scroller.height)
            scroller.contentY = Math.min(
                scroller.contentHeight - scroller.height,
                bottom - scroller.height
            );
    }

    implicitHeight: header.height + Theme.quickSettingsGap + pageBody.implicitHeight

    Keys.onEscapePressed: root.back(true)

    Item {
        id: header

        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: Theme.quickSettingsRowHeight

        Item {
            id: backTarget

            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            width: 36
            height: 36

            property bool focusVisible: false

            activeFocusOnTab: root.active && root.visible
            scale: backMouse.pressed ? 0.96 : 1
            onActiveFocusChanged: focusVisible = activeFocus
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    root.back(true);
                    event.accepted = true;
                }
            }

            Behavior on scale {
                NumberAnimation {
                    duration: Theme.quickSettingsFastMotion
                    easing.type: Easing.OutCubic
                }
            }

            Rectangle {
                anchors.fill: parent
                radius: height / 2
                color: Theme.foreground
                opacity: backMouse.containsMouse ? 0.14 : 0.08

                Behavior on opacity {
                    NumberAnimation {
                        duration: Theme.quickSettingsFastMotion
                        easing.type: Easing.OutCubic
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                text: "←"
                color: Theme.foreground
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize + 1
                textFormat: Text.PlainText
            }

            MouseArea {
                id: backMouse

                anchors.fill: parent
                hoverEnabled: true

                onPressed: {
                    backTarget.forceActiveFocus();
                    backTarget.focusVisible = false;
                }
                onClicked: root.back(false)
            }

            Rectangle {
                anchors.fill: parent
                radius: height / 2
                color: "transparent"
                border.color: Theme.accent
                border.width: backTarget.focusVisible ? 2 : 0
            }

            Tooltip {
                target: backTarget
                text: "Back"
                shown: backMouse.containsMouse || backTarget.focusVisible
            }
        }

        Text {
            anchors.left: backTarget.right
            anchors.leftMargin: 10
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter

            text: root.title
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 2
            font.weight: Font.DemiBold
            textFormat: Text.PlainText
            elide: Text.ElideRight
            maximumLineCount: 1
        }
    }

    Flickable {
        id: scroller

        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: header.bottom
        anchors.topMargin: Theme.quickSettingsGap
        anchors.bottom: parent.bottom

        contentWidth: width
        contentHeight: pageBody.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick

        Column {
            id: pageBody

            width: scroller.width - (scrollThumb.visible ? 8 : 0)
            spacing: 4
        }
    }

    Rectangle {
        id: scrollThumb

        visible: scroller.contentHeight > scroller.height
        anchors.right: parent.right
        width: 3
        height: Math.max(24, scroller.height * scroller.visibleArea.heightRatio)
        y: scroller.y + scroller.visibleArea.yPosition * scroller.height
        radius: width / 2
        color: Theme.foreground
        opacity: 0.35
    }

    Connections {
        target: root.Window

        function onActiveFocusItemChanged() {
            root.revealFocusedBodyItem(root.Window.activeFocusItem);
        }
    }
}
