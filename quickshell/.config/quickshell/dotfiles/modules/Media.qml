import QtQuick
import qs.media.Ui
import qs.media.Commons

Item {
    id: root

    property var service: null
    readonly property var activePlayer: root.service ? root.service.activePlayer : null
    readonly property var sourcePlayers: root.service ? root.service.sourcePlayers : []

    implicitWidth: Style.space(300)
    implicitHeight: content.implicitHeight

    Column {
        id: content

        width: root.width
        spacing: Style.space(10)

        Text {
            text: "Now playing"
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.subtitle
            font.bold: true
            textFormat: Text.PlainText
        }

        Row {
            width: parent.width
            spacing: Style.space(10)

            BorderSurface {
                width: Style.space(72)
                height: Style.space(72)
                radius: Style.spacing.labelGap
                color: Style.normalFillFor(Color.foreground, Color.accent)
                borderSpec: Border.controlSpec("normal", Color.foreground, Color.accent)

                Image {
                    anchors.fill: parent
                    anchors.margins: Style.space(2)
                    fillMode: Image.PreserveAspectCrop
                    asynchronous: true
                    source: root.activePlayer && root.activePlayer.trackArtUrl
                        ? root.activePlayer.trackArtUrl : ""
                    visible: source !== ""
                }

                Text {
                    anchors.centerIn: parent
                    visible: !root.activePlayer || !root.activePlayer.trackArtUrl
                    text: "󰝚"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.displayLarge
                }
            }

            Column {
                width: parent.width - Style.space(82)
                spacing: Style.space(4)
                anchors.verticalCenter: parent.verticalCenter

                Text {
                    text: root.activePlayer
                        ? (root.activePlayer.trackTitle || root.activePlayer.identity || "Unknown track")
                        : "Nothing playing"
                    color: Color.foreground
                    font.family: Style.font.family
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                    elide: Text.ElideRight
                    width: parent.width
                    textFormat: Text.PlainText
                }

                Text {
                    text: root.activePlayer ? (root.activePlayer.trackArtist || "") : ""
                    color: Qt.darker(Color.foreground, 1.3)
                    font.family: Style.font.family
                    font.pixelSize: Style.font.bodySmall
                    elide: Text.ElideRight
                    width: parent.width
                    visible: text !== ""
                    textFormat: Text.PlainText
                }

                Text {
                    text: root.activePlayer && root.activePlayer.trackAlbum
                        ? root.activePlayer.trackAlbum : ""
                    color: Qt.darker(Color.foreground, 1.6)
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    width: parent.width
                    visible: text !== ""
                    textFormat: Text.PlainText
                }
            }
        }

        Item {
            width: parent.width
            height: transportControls.implicitHeight

            Row {
                id: transportControls

                spacing: Style.space(6)
                anchors.horizontalCenter: parent.horizontalCenter

                Button {
                    iconText: "󰒮"
                    tooltipText: "Previous track"
                    foreground: Color.foreground
                    horizontalPadding: Style.spacing.controlPaddingX
                    verticalPadding: Style.spacing.controlPaddingY
                    enabled: root.activePlayer && root.activePlayer.canGoPrevious
                    opacity: enabled ? 1 : 0.4
                    onClicked: if (root.service) root.service.runAction(
                        "previous", false, root.service.playerKey(root.activePlayer)
                    )
                }

                Button {
                    iconText: root.activePlayer && root.activePlayer.isPlaying ? "󰏤" : "󰐊"
                    tooltipText: root.activePlayer && root.activePlayer.isPlaying ? "Pause" : "Play"
                    foreground: Color.foreground
                    horizontalPadding: Style.spacing.panelGap
                    verticalPadding: Style.spacing.controlPaddingY
                    iconSize: Style.font.iconLarge
                    enabled: root.activePlayer && (
                        root.activePlayer.canTogglePlaying || root.activePlayer.canPlay || root.activePlayer.canPause
                    )
                    opacity: enabled ? 1 : 0.4
                    onClicked: if (root.service) root.service.runAction(
                        "playPause", false, root.service.playerKey(root.activePlayer)
                    )
                }

                Button {
                    iconText: "󰒭"
                    tooltipText: "Next track"
                    foreground: Color.foreground
                    horizontalPadding: Style.spacing.controlPaddingX
                    verticalPadding: Style.spacing.controlPaddingY
                    enabled: root.activePlayer && root.activePlayer.canGoNext
                    opacity: enabled ? 1 : 0.4
                    onClicked: if (root.service) root.service.runAction(
                        "next", false, root.service.playerKey(root.activePlayer)
                    )
                }
            }
        }

        PanelSeparator {
            visible: root.sourcePlayers.length > 1
            foreground: Color.foreground
        }

        Column {
            id: sourceList

            visible: root.sourcePlayers.length > 1
            width: parent.width
            spacing: Style.space(4)

            Text {
                text: "Players"
                color: Color.foreground
                font.family: Style.font.family
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                textFormat: Text.PlainText
            }

            Flickable {
                width: parent.width
                height: Math.min(sourceRows.implicitHeight, Style.space(160))
                contentWidth: sourceRows.width
                contentHeight: sourceRows.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentHeight > height

                Column {
                    id: sourceRows

                    width: parent.width
                    spacing: Style.space(4)

                    Repeater {
                        model: root.sourcePlayers

                        BorderSurface {
                            id: sourceRow
                            required property var modelData

                            readonly property var player: modelData
                            readonly property bool selected: root.activePlayer && player
                                && root.service.playerKey(root.activePlayer) === root.service.playerKey(player)
                            readonly property string sourceTitle: player
                                ? (player.trackTitle || player.identity || player.desktopEntry || "Media source")
                                : "Media source"
                            readonly property string sourceDetail: player && player.trackArtist
                                ? player.trackArtist : (player && player.identity ? player.identity : "")

                            width: sourceList.width
                            height: sourceInner.implicitHeight + Style.space(10)
                            radius: Style.spacing.labelGap
                            color: selected
                                ? Style.selectedFillFor(Color.foreground, Color.accent) : "transparent"
                            borderSpec: selected
                                ? Border.controlSpec("normal", Color.foreground, Color.accent)
                                : Border.none()

                            Row {
                                id: sourceInner

                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.leftMargin: sourceRow.borderLeft + Style.space(8)
                                anchors.rightMargin: sourceRow.borderRight + Style.space(8)
                                spacing: Style.space(8)

                                Text {
                                    text: sourceRow.player && sourceRow.player.isPlaying ? "󰏤" : "󰐊"
                                    color: Color.foreground
                                    font.family: Style.font.family
                                    font.pixelSize: Style.font.body
                                    width: Style.space(18)
                                    horizontalAlignment: Text.AlignHCenter
                                    anchors.verticalCenter: parent.verticalCenter
                                    textFormat: Text.PlainText
                                }

                                Column {
                                    width: parent.width - Style.space(26)
                                    spacing: Style.space(1)
                                    anchors.verticalCenter: parent.verticalCenter

                                    Text {
                                        text: sourceRow.sourceTitle
                                        color: Color.foreground
                                        font.family: Style.font.family
                                        font.pixelSize: Style.font.bodySmall
                                        font.bold: sourceRow.selected
                                        elide: Text.ElideRight
                                        width: parent.width
                                        textFormat: Text.PlainText
                                    }

                                    Text {
                                        text: sourceRow.sourceDetail
                                        color: Qt.darker(Color.foreground, 1.5)
                                        font.family: Style.font.family
                                        font.pixelSize: Style.font.caption
                                        elide: Text.ElideRight
                                        width: parent.width
                                        visible: text !== ""
                                        textFormat: Text.PlainText
                                    }
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: if (root.service)
                                    root.service.selectPlayer(root.service.playerKey(sourceRow.player))
                            }
                        }
                    }
                }
            }
        }
    }
}
