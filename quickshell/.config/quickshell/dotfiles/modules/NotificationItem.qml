import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Services.Notifications
import Quickshell.Widgets
import qs

// One notification. The shape follows reload-popup/ReloadPopup.qml: a filled
// rectangle with a hover-paused progress bar that dismisses itself when the bar
// runs out. Colors come from Theme, so df-theme-set restyles these live -- mako
// needed a service restart.
Rectangle {
    id: root

    required property var notification

    // mako: `[urgency=critical] default-timeout=0`, i.e. critical
    // notifications stay until dismissed by hand.
    readonly property bool critical: notification.urgency === NotificationUrgency.Critical

    // mako: default-timeout=5000. expireTimeout is in *seconds* and is -1 when
    // the sender did not ask for a specific duration.
    readonly property int timeout: {
        if (critical)
            return 0;
        return notification.expireTimeout > 0 ? Math.round(notification.expireTimeout * 1000) : 5000;
    }

    // Fraction of the timeout still to run, driven by the animation below.
    // Animating this rather than the bar's pixel width keeps the countdown
    // independent of whether the window's geometry has been resolved yet.
    property real remaining: 1

    readonly property string iconSource: {
        if (notification.image !== "")
            return notification.image;
        if (notification.appIcon !== "")
            return Quickshell.iconPath(notification.appIcon, true);
        return "";
    }

    // Hugs its content. mako reserved a fixed height=110 slot per notification,
    // which left a one-line notification mostly empty; nothing here needs a
    // floor, since the icon already sets the minimum for the common case.
    implicitHeight: content.implicitHeight + 2 * Theme.notificationPadding + progress.height

    color: Theme.background
    // mako: text-color/border-color/background-color.
    border.color: critical ? Theme.error : Theme.accent
    border.width: 1
    radius: 4

    // Declared before the content so the action buttons, which come later and
    // therefore sit above it, get their clicks first. Everything else in the
    // item is non-interactive text, so those clicks fall through to here.
    MouseArea {
        id: mouse

        anchors.fill: parent
        // Tracks hovering so the countdown below can pause while reading.
        hoverEnabled: true
        onClicked: root.notification.dismiss()
    }

    RowLayout {
        id: content

        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
            margins: Theme.notificationPadding
        }

        spacing: Theme.notificationPadding

        IconImage {
            visible: root.iconSource !== ""
            source: root.iconSource
            implicitSize: Theme.notificationIconSize
            Layout.alignment: Qt.AlignTop
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                Layout.fillWidth: true

                text: root.notification.summary
                color: Theme.foreground
                font.family: Theme.fontFamily
                font.pixelSize: Theme.notificationSummaryFontSize
                font.bold: true
                elide: Text.ElideRight
                // The summary is never markup, per the spec.
                textFormat: Text.PlainText
            }

            Text {
                Layout.fillWidth: true
                visible: text !== ""

                text: root.notification.body
                color: Theme.foreground
                font.family: Theme.fontFamily
                font.pixelSize: Theme.notificationFontSize
                wrapMode: Text.Wrap
                // bodyMarkupSupported is advertised on the server, so the body
                // arrives as Pango markup. PlainText -- the house style
                // elsewhere in this shell -- would render raw <b> tags.
                textFormat: Text.StyledText
            }

            RowLayout {
                Layout.topMargin: 4
                visible: root.notification.actions.length > 0
                spacing: Theme.edgeMargin

                Repeater {
                    model: root.notification.actions

                    Rectangle {
                        required property var modelData

                        implicitWidth: actionLabel.implicitWidth + 2 * Theme.notificationPadding
                        implicitHeight: actionLabel.implicitHeight + 8
                        color: actionMouse.containsMouse ? Theme.accent : "transparent"
                        border.color: Theme.accent
                        border.width: 1
                        radius: 3

                        Text {
                            id: actionLabel

                            anchors.centerIn: parent
                            text: modelData.text
                            color: actionMouse.containsMouse ? Theme.background : Theme.foreground
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.notificationFontSize
                            textFormat: Text.PlainText
                        }

                        MouseArea {
                            id: actionMouse

                            anchors.fill: parent
                            hoverEnabled: true
                            // invoke() dismisses the notification itself unless
                            // the sender marked it resident.
                            onClicked: modelData.invoke()
                        }
                    }
                }
            }
        }
    }

    // Countdown to auto-dismissal, drained left to right along the bottom edge.
    Rectangle {
        id: progress

        visible: root.timeout > 0
        height: visible ? 2 : 0
        // Tracks the item's width, so this is correct even on the first frame
        // and after a resize.
        width: (root.width - 2 * root.border.width) * root.remaining
        color: Theme.accent

        anchors {
            bottom: parent.bottom
            left: parent.left
            margins: root.border.width
        }

        PropertyAnimation {
            id: dismissAnimation

            target: root
            property: "remaining"
            from: 1
            to: 0
            duration: root.timeout
            // Pauses while the pointer is over the notification, so it stays on
            // screen while it is being read. mako had no equivalent.
            paused: mouse.containsMouse
            // expire(), not dismiss(): the sender is told it timed out rather
            // than that the user closed it.
            onFinished: root.notification.expire()
        }

        Component.onCompleted: {
            if (root.timeout > 0)
                dismissAnimation.start();
        }
    }
}
