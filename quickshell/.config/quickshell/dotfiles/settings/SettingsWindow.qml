import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import QtQuick.Dialogs
import Quickshell
import Quickshell.Hyprland
import qs
import "Catalog.js" as Catalog

FloatingWindow {
    id: root

    required property var app
    readonly property var currentPage: Catalog.pages.find(page => page.id === app.page) || Catalog.pages[0]
    readonly property bool light: Theme.background.hslLightness > 0.5
    readonly property color surface: Qt.tint(Theme.background, Qt.alpha(Theme.foreground, 0.035))

    title: app.windowTitle
    visible: true
    implicitWidth: 1060
    implicitHeight: 760
    minimumSize: Qt.size(800, 540)
    color: Theme.background
    onClosed: app.shown = false
    onCurrentPageChanged: Qt.callLater(() => {
        if (scroller.contentItem)
            scroller.contentItem.contentY = 0;
    })

    function runAction(action: string): void {
        if (action === "wallpaper") {
            wallpaperDialog.open();
        } else if (action === "arrange") {
            DisplayArrangeState.open();
        } else if (action === "displays") {
            const monitor = Hyprland.focusedMonitor;
            const panel = monitor ? DisplayPanelRegistry.panelFor(monitor.name) : null;
            if (panel && !panel.shown)
                panel.open();
        } else {
            root.app.openPanel(action);
        }
    }

    FileDialog {
        id: wallpaperDialog
        title: "Choose a wallpaper"
        nameFilters: ["Images (*.png *.jpg *.jpeg *.webp *.avif)"]
        onAccepted: root.app.apply(["wallpaper", decodeURIComponent(selectedFile.toString().replace(/^file:\/\//, ""))])
    }

    Pane {
        anchors.fill: parent
        padding: 0
        font.family: "sans-serif"
        font.pixelSize: 14
        palette {
            window: Theme.background
            windowText: Theme.foreground
            text: Theme.foreground
            buttonText: Theme.foreground
            button: root.light ? Qt.darker(Theme.background, 1.06) : Qt.lighter(Theme.background, 1.5)
            base: root.light ? Qt.lighter(Theme.background, 1.03) : Qt.lighter(Theme.background, 1.2)
            highlight: Theme.accent
            highlightedText: Theme.background
            mid: Qt.alpha(Theme.foreground, 0.25)
            dark: Qt.alpha(Theme.foreground, 0.35)
            placeholderText: Qt.alpha(Theme.foreground, 0.5)
        }
        background: Rectangle { color: Theme.background }

        RowLayout {
            anchors.fill: parent
            spacing: 0

            Rectangle {
                Layout.preferredWidth: 246
                Layout.fillHeight: true
                color: root.surface

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 14
                    spacing: 10

                    Label {
                        text: "Settings"
                        font.pixelSize: 22
                        font.weight: Font.Bold
                        Layout.margins: 12
                    }
                    TextField {
                        id: search
                        Layout.fillWidth: true
                        placeholderText: "Search settings"
                        Accessible.name: "Search settings"
                        Accessible.description: "Press Ctrl+K to focus search."
                        selectByMouse: true
                        rightPadding: shortcutHint.width + 16
                        Rectangle {
                            id: shortcutHint
                            anchors.right: parent.right
                            anchors.rightMargin: 8
                            anchors.verticalCenter: parent.verticalCenter
                            implicitWidth: shortcutLabel.implicitWidth + 12
                            implicitHeight: 22
                            radius: 4
                            color: Qt.alpha(Theme.foreground, 0.06)
                            border.color: Qt.alpha(Theme.foreground, 0.12)
                            Label {
                                id: shortcutLabel
                                anchors.centerIn: parent
                                text: "Ctrl+K"
                                font.pixelSize: 11
                                color: Theme.foreground
                                opacity: 0.65
                            }
                        }
                        background: Rectangle {
                            radius: 8
                            color: Qt.alpha(Theme.foreground, 0.04)
                            border.color: search.activeFocus ? Theme.accent : Qt.alpha(Theme.foreground, 0.13)
                        }
                    }

                    ScrollView {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        contentWidth: availableWidth
                        clip: true

                        ColumnLayout {
                            width: parent.width
                            spacing: 4

                            Repeater {
                                model: Catalog.pages
                                delegate: ColumnLayout {
                                    required property var modelData
                                    required property int index
                                    Layout.fillWidth: true
                                    visible: Catalog.matches(modelData, search.text, root.app.snapshot)
                                    spacing: 4

                                    Label {
                                        visible: index === 0 || modelData.group !== Catalog.pages[index - 1].group
                                        text: modelData.group.toUpperCase()
                                        opacity: 0.45
                                        font.pixelSize: 10
                                        font.letterSpacing: 1.5
                                        font.weight: Font.Bold
                                        Layout.leftMargin: 12
                                        Layout.topMargin: 18
                                        Layout.bottomMargin: 6
                                    }
                                    Button {
                                        Layout.fillWidth: true
                                        implicitHeight: 46
                                        checkable: true
                                        checked: root.currentPage.id === modelData.id
                                        onClicked: root.app.page = modelData.id
                                        text: modelData.title
                                        Accessible.name: modelData.title
                                        contentItem: RowLayout {
                                            spacing: 12
                                            Label { text: modelData.icon; font.pixelSize: 20; Layout.preferredWidth: 24; horizontalAlignment: Text.AlignHCenter }
                                            Label { text: modelData.title; Layout.fillWidth: true; font.weight: parent.parent.checked ? Font.DemiBold : Font.Normal }
                                        }
                                        background: Rectangle {
                                            radius: 9
                                            color: parent.checked ? Qt.alpha(Theme.accent, 0.18) : parent.hovered ? Qt.alpha(Theme.foreground, 0.06) : "transparent"
                                            border.width: parent.visualFocus ? 1 : 0
                                            border.color: Theme.accent
                                        }
                                    }
                                }
                            }

                            Label {
                                visible: !Catalog.pages.some(page => Catalog.matches(page, search.text, root.app.snapshot))
                                text: "No matching settings"
                                opacity: 0.6
                                Layout.margins: 12
                            }
                        }
                    }

                    Label {
                        text: "DOTFILES  /  " + (root.app.snapshot.profile || "desktop")
                        font.pixelSize: 9
                        opacity: 0.4
                        Layout.margins: 12
                    }
                }
            }

            Rectangle { Layout.preferredWidth: 1; Layout.fillHeight: true; color: Qt.alpha(Theme.foreground, 0.08) }

            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0

                RowLayout {
                    Layout.fillWidth: true
                    Layout.margins: 20
                    Label { text: root.currentPage.title; font.weight: Font.DemiBold; Layout.fillWidth: true }
                    Label { text: root.app.busy ? "Working…" : "Saved automatically"; opacity: 0.5; font.pixelSize: 11 }
                    Button { text: "↻"; Layout.preferredWidth: 40; Accessible.name: "Refresh settings"; enabled: !root.app.busy; onClicked: root.app.refresh() }
                    Button { text: "×"; Layout.preferredWidth: 40; Accessible.name: "Close settings"; enabled: !root.app.busy; onClicked: root.app.close() }
                }
                Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: Qt.alpha(Theme.foreground, 0.08) }

                ScrollView {
                    id: scroller
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    contentWidth: availableWidth
                    clip: true
                    ScrollBar.vertical.policy: ScrollBar.AlwaysOn

                    ColumnLayout {
                        width: scroller.availableWidth
                        spacing: 24

                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.leftMargin: 34
                            Layout.rightMargin: 34
                            Layout.topMargin: 30
                            spacing: 8
                            Label { text: root.currentPage.title; font.pixelSize: 30; font.weight: Font.Bold }
                            Label { text: root.currentPage.description; opacity: 0.6; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            Layout.leftMargin: 34
                            Layout.rightMargin: 34
                            implicitHeight: 138
                            visible: root.currentPage.id === "appearance"
                            radius: 14
                            color: root.surface
                            clip: true
                            Image {
                                anchors.fill: parent
                                source: root.app.snapshot.wallpaper ? "file://" + root.app.snapshot.wallpaper : ""
                                fillMode: Image.PreserveAspectCrop
                                opacity: 0.55
                            }
                            Rectangle {
                                width: 180; height: 96; radius: 9
                                anchors.centerIn: parent
                                color: Theme.background
                                border.color: Qt.alpha(Theme.foreground, 0.2)
                                Rectangle { width: 34; height: parent.height - 2; x: 1; y: 1; color: Qt.alpha(Theme.accent, 0.2); radius: 8 }
                                Rectangle { x: 48; y: 19; width: 75; height: 7; radius: 3; color: Theme.foreground }
                                Rectangle { x: 48; y: 38; width: 112; height: 5; radius: 2; color: Qt.alpha(Theme.foreground, 0.22) }
                                Rectangle { x: 48; y: 52; width: 90; height: 5; radius: 2; color: Qt.alpha(Theme.foreground, 0.22) }
                                Rectangle { x: 120; y: 72; width: 40; height: 12; radius: 6; color: Theme.accent }
                            }
                        }

                        Label {
                            visible: root.app.loaded && !root.app.snapshot.hyprland && ["windows", "input", "displays"].includes(root.currentPage.id)
                            text: "Hyprland is unavailable. Connect to your desktop session to change these settings."
                            color: Theme.warn
                            wrapMode: Text.Wrap
                            Layout.fillWidth: true
                            Layout.leftMargin: 34
                            Layout.rightMargin: 34
                        }

                        Repeater {
                            model: Catalog.sections(root.currentPage.id, root.app.snapshot)
                            delegate: ColumnLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.leftMargin: 34
                                Layout.rightMargin: 34
                                spacing: 10
                                Label { text: modelData.title; font.weight: Font.DemiBold; font.pixelSize: 14 }
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 1
                                    Repeater {
                                        model: modelData.rows
                                        delegate: PreferenceRow {
                                            required property var modelData
                                            Layout.fillWidth: true
                                            entry: modelData
                                            app: root.app
                                            onActionRequested: action => root.runAction(action)
                                        }
                                    }
                                    Label {
                                        visible: modelData.rows.length === 0
                                        text: root.app.busy ? "Loading…" : "No installed applications are available."
                                        opacity: 0.6
                                        Layout.margins: 18
                                    }
                                }
                            }
                        }
                        Item { implicitHeight: 24 }
                    }
                }

                Label {
                    visible: root.app.message.length > 0
                    text: root.app.message
                    textFormat: Text.PlainText
                    color: root.app.failed ? Theme.error : Theme.ok
                    wrapMode: Text.Wrap
                    Layout.fillWidth: true
                    Layout.margins: 20
                    Accessible.role: Accessible.AlertMessage
                }
            }
        }
        Shortcut { sequence: "Ctrl+F"; onActivated: search.forceActiveFocus() }
        Shortcut { sequence: "Ctrl+K"; onActivated: search.forceActiveFocus() }
        Shortcut { sequence: "Ctrl+W"; onActivated: root.app.close() }
        Shortcut { sequence: "Escape"; onActivated: root.app.close() }
    }
}
