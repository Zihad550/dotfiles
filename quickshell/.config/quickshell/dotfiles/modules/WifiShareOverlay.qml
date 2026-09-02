import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs
import "lib/network.js" as Network

// Full-screen Wi-Fi sharing overlay. Secrets only enter this component after
// an explicit reveal and are dropped when the overlay closes.
Item {
    id: root

    property bool opened: false
    property string requestedInterface: ""
    property string iface: ""
    property string ssid: ""
    property bool secured: false
    property var qrRows: []
    property int qrSize: 0
    property string error: ""
    property bool loading: false
    property bool qrExpectedStop: false
    property bool pendingShow: false
    property string pendingInterface: ""
    property string password: ""
    property bool passwordVisible: false
    property string passwordError: ""
    property bool passwordExpectedStop: false
    property string copyError: ""
    property bool copyExpectedStop: false

    readonly property bool showingQr: root.qrSize > 0 && !root.loading && root.error === ""

    function open(interfaceName): void {
        root.opened = true;
        root.requestedInterface = String(interfaceName || "");
        root.generate(root.requestedInterface);
        Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    function close(): void {
        root.opened = false;
        root.pendingShow = false;
        root.qrExpectedStop = true;
        root.passwordExpectedStop = true;
        if (qrProcess.running)
            qrProcess.running = false;
        root.cancelPasswordLookup();
        root.cancelCopy();
        root.loading = false;
        root.qrRows = [];
        root.qrSize = 0;
        root.error = "";
        root.iface = "";
        root.ssid = "";
        root.secured = false;
        root.password = "";
        root.passwordVisible = false;
        root.passwordError = "";
        root.copyError = "";
    }

    function generate(interfaceName): void {
        if (qrProcess.running) {
            root.pendingShow = true;
            root.pendingInterface = String(interfaceName || "");
            root.qrExpectedStop = true;
            root.loading = true;
            root.qrRows = [];
            root.qrSize = 0;
            root.error = "";
            root.cancelPasswordLookup();
            root.cancelCopy();
            qrProcess.running = false;
            return;
        }

        root.qrExpectedStop = false;
        root.loading = true;
        root.qrRows = [];
        root.qrSize = 0;
        root.error = "";
        root.iface = "";
        root.ssid = "";
        root.secured = false;
        root.cancelPasswordLookup();
        root.cancelCopy();
        root.qrCommand = interfaceName
            ? ["df-network-qr", "--meta", interfaceName]
            : ["df-network-qr", "--meta"];
        qrProcess.running = true;
    }

    function updateQr(raw): void {
        const parsed = Network.parseQrOutput(raw);
        root.qrRows = parsed.matrix.rows;
        root.qrSize = parsed.matrix.size;
        if (parsed.meta.iface !== "")
            root.iface = parsed.meta.iface;
        if (parsed.meta.ssid !== "")
            root.ssid = parsed.meta.ssid;
        root.secured = parsed.meta.security !== "" && parsed.meta.security !== "nopass";
        if (root.qrSize > 0)
            root.error = "";
    }

    function togglePassword(): void {
        if (root.passwordVisible) {
            root.passwordVisible = false;
            return;
        }
        if (root.password !== "") {
            root.passwordVisible = true;
            return;
        }
        if (passwordProcess.running || !root.iface || !root.opened)
            return;
        root.passwordError = "";
        root.passwordExpectedStop = false;
        passwordProcess.command = ["df-network-password", root.iface];
        passwordProcess.running = true;
    }

    function cancelPasswordLookup(): void {
        root.passwordExpectedStop = true;
        if (passwordProcess.running)
            passwordProcess.running = false;
        root.password = "";
        root.passwordVisible = false;
        root.passwordError = "";
    }

    function copyPassword(): void {
        if (!root.opened || !root.passwordVisible || root.password === "" || copyProcess.running)
            return;
        root.copyError = "";
        root.copyExpectedStop = false;
        copyProcess.running = true;
    }

    function cancelCopy(): void {
        root.copyExpectedStop = true;
        if (copyProcess.running)
            copyProcess.running = false;
        root.copyError = "";
    }

    property var qrCommand: []

    Process {
        id: qrProcess

        command: root.qrCommand

        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: if (!root.qrExpectedStop) root.updateQr(text)
        }
        stderr: StdioCollector {
            waitForEnd: true
            onStreamFinished: if (!root.qrExpectedStop) root.error = String(text || "").trim()
        }

        onExited: function(exitCode) {
            root.loading = false;
            if (root.pendingShow) {
                root.pendingShow = false;
                Qt.callLater(() => root.generate(root.pendingInterface));
                return;
            }
            if (root.qrExpectedStop || !root.opened)
                return;
            if (exitCode !== 0 || root.qrSize === 0) {
                root.qrRows = [];
                root.qrSize = 0;
                if (root.error === "")
                    root.error = "Could not generate the Wi-Fi QR code";
            }
        }
    }

    Process {
        id: passwordProcess

        stdinEnabled: false

        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: if (root.opened && !root.passwordExpectedStop)
                root.password = Network.stripTrailingLineBreak(text)
        }

        onExited: function(exitCode) {
            if (root.passwordExpectedStop || !root.opened)
                return;
            if (exitCode === 0 && root.password !== "")
                root.passwordVisible = true;
            else
                root.passwordError = "Could not read the Wi-Fi password";
        }
    }

    Process {
        id: copyProcess

        command: ["wl-copy"]
        stdinEnabled: true

        onStarted: write(root.password + "\n")
        onExited: function(exitCode) {
            if (root.copyExpectedStop || !root.opened)
                return;
            if (exitCode !== 0)
                root.copyError = "Could not copy the Wi-Fi password";
        }
    }

    PanelWindow {
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "df-network-wifi-share"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

        Rectangle {
            anchors.fill: parent
            color: Qt.rgba(0, 0, 0, 0.78)

            MouseArea {
                anchors.fill: parent
                onClicked: root.close()
            }
        }

        Item {
            id: keyCatcher

            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: root.close()

            Item {
                anchors.centerIn: parent
                width: content.implicitWidth
                height: content.implicitHeight
                scale: Math.min(1,
                    (keyCatcher.width - 2 * Theme.quickSettingsPadding) / Math.max(1, width),
                    (keyCatcher.height - 2 * Theme.quickSettingsPadding) / Math.max(1, height))

                MouseArea { anchors.fill: parent; onClicked: {} }

                ColumnLayout {
                    id: content
                    spacing: Theme.quickSettingsGap

                    Text {
                        text: (root.ssid || "Wi-Fi").toUpperCase()
                        color: Qt.rgba(1, 1, 1, 0.60)
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 1
                        font.bold: true
                        font.letterSpacing: 2
                        elide: Text.ElideRight
                        Layout.maximumWidth: 320
                        Layout.alignment: Qt.AlignHCenter
                        horizontalAlignment: Text.AlignHCenter
                    }

                    Rectangle {
                        id: qrCanvas
                        readonly property int moduleSize: root.qrSize > 0
                            ? Math.max(4, Math.floor(240 / root.qrSize)) : 0
                        visible: root.showingQr
                        width: root.qrSize * moduleSize
                        height: width
                        color: "white"
                        radius: 12
                        Layout.alignment: Qt.AlignHCenter

                        Grid {
                            anchors.fill: parent
                            columns: root.qrSize

                            Repeater {
                                model: root.qrSize * root.qrSize

                                Rectangle {
                                    required property int index
                                    readonly property int matrixRow: Math.floor(index / root.qrSize)
                                    readonly property int matrixColumn: index % root.qrSize
                                    width: qrCanvas.moduleSize
                                    height: qrCanvas.moduleSize
                                    color: root.qrRows[matrixRow].charAt(matrixColumn) === "1"
                                        ? "#111111" : "transparent"
                                }
                            }
                        }
                    }

                    Text {
                        visible: root.loading
                        text: "Generating QR code…"
                        color: Qt.rgba(1, 1, 1, 0.60)
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
                        Layout.maximumWidth: 320
                        horizontalAlignment: Text.AlignHCenter
                    }

                    Text {
                        visible: root.showingQr
                        text: "Scan to join this network"
                        color: Qt.rgba(1, 1, 1, 0.60)
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 2
                        Layout.fillWidth: true
                        horizontalAlignment: Text.AlignHCenter
                    }

                    ColumnLayout {
                        visible: root.showingQr && root.secured
                        Layout.fillWidth: true
                        spacing: 4

                        Text {
                            text: root.passwordError !== "" ? root.passwordError
                                : root.passwordVisible ? root.password : "Show password"
                            color: root.passwordError !== "" ? Theme.error : "white"
                            opacity: root.passwordVisible || root.passwordError !== "" ? 1 : 0.65
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize - 2
                            wrapMode: Text.WrapAnywhere
                            Layout.fillWidth: true
                            Layout.maximumWidth: 320
                            horizontalAlignment: Text.AlignHCenter

                            MouseArea {
                                anchors.fill: parent
                                onClicked: root.togglePassword()
                            }
                        }

                        PageRow {
                            visible: root.passwordVisible && root.password !== ""
                            width: 320
                            icon: "󰆏"
                            label: "Copy password"
                            detail: root.copyError
                            onClicked: root.copyPassword()
                        }
                    }
                }
            }
        }
    }

    Component.onDestruction: root.close()
}
