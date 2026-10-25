import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import qs

Rectangle {
    id: root

    required property var entry
    required property var app
    readonly property var value: {
        if (entry.kind === "theme")
            return app.snapshot.theme;
        if (entry.kind === "wallpaper")
            return app.snapshot.wallpaper;
        if (entry.kind === "default-app")
            return entry.selected;
        return app.snapshot.values[entry.key];
    }
    readonly property var choices: entry.choices || []
    readonly property bool needsHyprland: entry.key.startsWith("input.") || entry.key.startsWith("general.")
        || entry.key.startsWith("decoration.") || entry.key.startsWith("animations.")
    signal actionRequested(string action)

    implicitHeight: Math.max(84, labels.implicitHeight + 32)
    color: Qt.alpha(Theme.foreground, 0.035)
    radius: 10
    enabled: app.loaded && !app.busy && (!root.needsHyprland || app.snapshot.hyprland)
    opacity: enabled ? 1 : 0.5

    RowLayout {
        anchors.fill: parent
        anchors.margins: 18
        spacing: 24

        ColumnLayout {
            id: labels
            Layout.fillWidth: true
            spacing: 5
            Label {
                Layout.fillWidth: true
                text: root.entry.title
                font.pixelSize: 15
                font.weight: Font.Medium
                wrapMode: Text.Wrap
                textFormat: Text.PlainText
            }
            Label {
                Layout.fillWidth: true
                text: root.entry.description || ""
                visible: text.length > 0
                font.pixelSize: 12
                opacity: 0.6
                wrapMode: Text.Wrap
                textFormat: Text.PlainText
            }
        }

        Button {
            visible: root.app.snapshot.overrides?.includes(root.entry.key) ?? false
            text: "Reset"
            flat: true
            Accessible.name: "Reset " + root.entry.title
            ToolTip.visible: hovered
            ToolTip.text: "Return to the hand-maintained value"
            onClicked: root.app.apply(["reset", root.entry.key])
        }

        Loader {
            id: control
            Layout.preferredWidth: root.entry.kind === "toggle" ? 54 : 206
            Layout.alignment: Qt.AlignVCenter
            sourceComponent: {
                switch (root.entry.kind) {
                case "toggle": return toggleControl;
                case "number": return numberControl;
                case "speed": return speedControl;
                case "theme":
                case "choice":
                case "default-app": return choiceControl;
                case "wallpaper": return wallpaperControl;
                case "text": return textControl;
                case "action": return actionControl;
                }
                return null;
            }
        }
    }

    Component {
        id: toggleControl
        Switch {
            checked: root.value === true
            Accessible.name: root.entry.title
            onClicked: root.app.setValue(root.entry.key, checked)
            indicator: Rectangle {
                implicitWidth: 48
                implicitHeight: 27
                x: (parent.width - width) / 2
                y: (parent.height - height) / 2
                radius: height / 2
                color: parent.checked ? Theme.accent : Qt.alpha(Theme.foreground, 0.2)
                border.width: parent.visualFocus ? 2 : 0
                border.color: Theme.foreground
                Rectangle {
                    width: 21; height: 21; radius: 11
                    x: parent.parent.checked ? 24 : 3
                    y: 3
                    color: Theme.background
                    Behavior on x { NumberAnimation { duration: 100 } }
                }
            }
        }
    }

    Component {
        id: numberControl
        SpinBox {
            from: root.entry.min
            to: root.entry.max
            value: root.value ?? from
            Accessible.name: root.entry.title
            onValueModified: root.app.setValue(root.entry.key, value)
        }
    }

    Component {
        id: speedControl
        Column {
            spacing: 2
            Slider {
                width: parent.width
                from: -1; to: 1; stepSize: 0.05
                value: root.value ?? 0
                Accessible.name: root.entry.title
                onPressedChanged: {
                    if (!pressed)
                        root.app.setValue(root.entry.key, Math.round(value * 100) / 100);
                }
                Keys.onReleased: event => {
                    if ([Qt.Key_Left, Qt.Key_Right, Qt.Key_Home, Qt.Key_End].includes(event.key))
                        root.app.setValue(root.entry.key, Math.round(value * 100) / 100);
                }
            }
            Label { text: Number(root.value ?? 0).toFixed(2); anchors.horizontalCenter: parent.horizontalCenter; opacity: 0.6 }
        }
    }

    Component {
        id: choiceControl
        ComboBox {
            model: root.choices
            textRole: "label"
            valueRole: "value"
            enabled: root.choices.length > 0
            currentIndex: root.choices.findIndex(choice => choice.value === root.value)
            displayText: currentIndex < 0 ? "Choose…" : currentText
            Accessible.name: root.entry.title
            onActivated: {
                const value = root.choices[currentIndex].value;
                if (root.entry.kind === "theme")
                    root.app.apply(["theme", value]);
                else if (root.entry.kind === "default-app")
                    root.app.apply(["default-app", root.entry.key, value]);
                else
                    root.app.setValue(root.entry.key, value);
            }
        }
    }

    Component {
        id: textControl
        TextField {
            text: root.value || ""
            Accessible.name: root.entry.title
            onEditingFinished: {
                if (text !== root.value)
                    root.app.setValue(root.entry.key, text);
            }
        }
    }

    Component {
        id: wallpaperControl
        Button { text: "Choose image…"; onClicked: root.actionRequested("wallpaper") }
    }

    Component {
        id: actionControl
        Button { text: root.entry.label; onClicked: root.actionRequested(root.entry.action) }
    }
}
