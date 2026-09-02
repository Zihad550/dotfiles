import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import qs

// Full-screen speed-test surface. NetworkPage owns the worker lifecycle; this
// component only displays the pinned run and emits the two user decisions.
Item {
    id: root

    property bool opened: false
    property bool running: false
    property string interfaceName: ""
    property string connectionLabel: ""
    property string phase: ""
    property real downloadMbps: 0
    property real uploadMbps: 0
    property string error: ""
    property bool canRunAgain: true

    signal closeRequested
    signal runAgainRequested

    function displayRate(value): string {
        const rate = Number(value);
        if (!isFinite(rate) || rate < 0)
            return "-- Mbps";
        return `${rate.toFixed(rate < 10 && rate !== 0 ? 1 : 0)} Mbps`;
    }

    function progress(value): real {
        const rate = Number(value);
        if (!isFinite(rate) || rate <= 0)
            return 0;
        return Math.min(1, rate / 1000);
    }

    PanelWindow {
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "df-network-speedtest"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

        Rectangle {
            anchors.fill: parent
            color: Qt.rgba(0, 0, 0, 0.82)

            MouseArea {
                anchors.fill: parent
                onClicked: root.closeRequested()
            }
        }

        Item {
            id: keyCatcher

            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: root.closeRequested()
            Keys.onReturnPressed: if (!root.running) root.runAgainRequested()
            Keys.onEnterPressed: if (!root.running) root.runAgainRequested()

            Item {
                anchors.centerIn: parent
                width: content.implicitWidth
                height: content.implicitHeight
                scale: Math.min(
                    1,
                    (keyCatcher.width - 2 * Theme.quickSettingsPadding) / Math.max(1, width),
                    (keyCatcher.height - 2 * Theme.quickSettingsPadding) / Math.max(1, height)
                )

                MouseArea { anchors.fill: parent; onClicked: {} }

                ColumnLayout {
                    id: content
                    spacing: Theme.quickSettingsGap

                    Text {
                        text: "NETWORK SPEED TEST"
                        color: Qt.rgba(1, 1, 1, 0.62)
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 1
                        font.bold: true
                        font.letterSpacing: 2
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                    }

                    Text {
                        text: `${root.connectionLabel || "Default Route"} · ${root.interfaceName}`
                        color: "white"
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize + 2
                        font.bold: true
                        elide: Text.ElideRight
                        Layout.maximumWidth: 420
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                    }

                    ColumnLayout {
                        Layout.minimumWidth: 320
                        Layout.maximumWidth: 420
                        spacing: 6

                        Text {
                            text: `Download${root.phase === "down" ? " · measuring" : ""}`
                            color: Qt.rgba(1, 1, 1, 0.72)
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize
                            Layout.fillWidth: true
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 10
                            radius: 5
                            color: Qt.rgba(1, 1, 1, 0.16)

                            Rectangle {
                                width: parent.width * root.progress(root.downloadMbps)
                                height: parent.height
                                radius: parent.radius
                                color: Theme.accent
                            }
                        }

                        Text {
                            text: root.displayRate(root.downloadMbps)
                            color: "white"
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize + 8
                            font.bold: true
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignRight
                        }

                        Text {
                            text: `Upload${root.phase === "up" ? " · measuring" : ""}`
                            color: Qt.rgba(1, 1, 1, 0.72)
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize
                            Layout.fillWidth: true
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 10
                            radius: 5
                            color: Qt.rgba(1, 1, 1, 0.16)

                            Rectangle {
                                width: parent.width * root.progress(root.uploadMbps)
                                height: parent.height
                                radius: parent.radius
                                color: Theme.accent
                            }
                        }

                        Text {
                            text: root.displayRate(root.uploadMbps)
                            color: "white"
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize + 8
                            font.bold: true
                            Layout.fillWidth: true
                            horizontalAlignment: Text.AlignRight
                        }
                    }

                    Text {
                        visible: root.running
                        text: root.phase === "up" ? "Testing upload…" : "Testing download…"
                        color: Qt.rgba(1, 1, 1, 0.62)
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 2
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                    }

                    Text {
                        visible: root.error !== ""
                        text: root.error
                        color: Theme.error
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 2
                        wrapMode: Text.Wrap
                        Layout.maximumWidth: 420
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                    }

                    PageRow {
                        visible: root.running
                        width: 320
                        icon: "×"
                        label: "Cancel speed test"
                        detail: root.phase === "up" ? "Upload" : "Download"
                        onClicked: root.closeRequested()
                    }

                    PageRow {
                        visible: !root.running
                        width: 320
                        icon: "↻"
                        label: "Run again"
                        enabled: root.canRunAgain
                        onClicked: root.runAgainRequested()
                    }

                    PageRow {
                        visible: !root.running
                        width: 320
                        icon: "×"
                        label: "Close"
                        onClicked: root.closeRequested()
                    }
                }
            }
        }
    }

    onOpenedChanged: {
        if (root.opened)
            Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    Component.onDestruction: root.closeRequested()
}
