import QtQuick
import qs

QuickSettingsPage {
    id: root

    property QtObject routingState
    property bool skipHostCommit: false

    title: "Devcontainer"

    function commitHost(): void {
        root.routingState.commitHost(hostInput.text);
    }

    function discardHostEdit(): void {
        root.skipHostCommit = true;
        hostInput.text = root.routingState.customHost;
        hostInput.focus = false;
    }

    function toggleRouting(): void {
        root.discardHostEdit();
        root.routingState.toggle();
    }

    PageRow {
        id: routingRow

        width: root.width
        icon: "󰡨"
        label: "Routing"
        detail: root.routingState.busy
            ? "Updating…"
            : (root.routingState.routingEnabled ? "On" : "Off")

        onPressed: root.discardHostEdit()
        onClicked: root.toggleRouting()
    }

    Item {
        width: root.width
        height: 42
        visible: root.routingState.routingEnabled

        Rectangle {
            anchors.fill: parent
            radius: 10
            color: Theme.foreground
            opacity: hostInput.activeFocus ? 0.12 : 0.07
            border.color: Theme.accent
            border.width: hostInput.activeFocus ? 2 : 0
        }

        Text {
            anchors.left: parent.left
            anchors.leftMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            visible: hostInput.text.length === 0

            text: root.routingState.defaultHost
            color: Theme.foreground
            opacity: 0.42
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            textFormat: Text.PlainText
            elide: Text.ElideRight
        }

        TextInput {
            id: hostInput

            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            verticalAlignment: TextInput.AlignVCenter
            clip: true

            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            selectByMouse: true

            Component.onCompleted: text = root.routingState.customHost

            onAccepted: root.commitHost()
            onActiveFocusChanged: {
                if (!activeFocus && root.routingState.routingEnabled) {
                    if (!root.skipHostCommit)
                        root.commitHost();
                }
                else if (!activeFocus)
                    text = root.routingState.customHost;
                root.skipHostCommit = false;
            }
        }
    }

    Connections {
        target: root.routingState

        function onCustomHostChanged() {
            if (!hostInput.activeFocus)
                hostInput.text = root.routingState.customHost;
        }

        function onRoutingEnabledChanged() {
            if (!root.routingState.routingEnabled)
                root.discardHostEdit();
        }
    }
}
