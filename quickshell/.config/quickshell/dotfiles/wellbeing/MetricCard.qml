import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import qs

Rectangle {
    id: root
    required property string label
    required property string value
    property string detail: ""
    Layout.fillWidth: true
    Layout.preferredHeight: 116
    Layout.minimumWidth: 0
    radius: 12
    color: Qt.alpha(Theme.foreground, 0.045)
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 14
        spacing: 8
        Label { text: root.label; font.pixelSize: 11; opacity: 0.55 }
        Label { text: root.value; font.pixelSize: 22; font.bold: true; color: Theme.accent; Layout.fillWidth: true; elide: Text.ElideRight }
        Label { text: root.detail; font.pixelSize: 10; opacity: 0.5; Layout.fillWidth: true; elide: Text.ElideRight }
    }
}
