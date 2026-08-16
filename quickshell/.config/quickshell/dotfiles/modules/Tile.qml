import QtQuick
import qs

// A control on the primary Quick Settings surface. The main segment changes
// state; the optional chevron enters the control's Page.
Item {
    id: root

    property string icon: ""
    property string label: ""
    property bool active: false
    property bool busy: false
    property bool chevronVisible: false
    // The Flow that owns the primary Tiles. Arrow navigation uses the actual
    // laid-out positions so it keeps working when the panel collapses to one
    // column on a narrow monitor.
    property Item navigationContainer: null
    property bool mainFocusVisible: false
    property bool chevronFocusVisible: false

    signal clicked
    signal chevronClicked(bool keyboard)

    readonly property bool interactive: root.enabled && !root.busy
    readonly property color settledColor: root.active
        ? Theme.accent
        : Qt.rgba(Theme.foreground.r, Theme.foreground.g, Theme.foreground.b, 0.12)

    function moveSpatially(key: int): bool {
        if (!root.navigationContainer)
            return false;

        const origin = root.mapToItem(root.navigationContainer, 0, 0);
        const originCenterX = origin.x + root.width / 2;
        const originCenterY = origin.y + root.height / 2;
        const candidates = root.navigationContainer.children.filter(item =>
            item !== root && item.visible && item.enabled && item.width > 0 && item.height > 0
        );
        const horizontal = key === Qt.Key_Left || key === Qt.Key_Right;
        const direction = key === Qt.Key_Left || key === Qt.Key_Up ? -1 : 1;
        const rowTolerance = root.height * 0.75;
        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;

        candidates.forEach(item => {
            const position = item.mapToItem(root.navigationContainer, 0, 0);
            const centerX = position.x + item.width / 2;
            const centerY = position.y + item.height / 2;
            const deltaX = centerX - originCenterX;
            const deltaY = centerY - originCenterY;

            if (horizontal) {
                if (Math.abs(deltaY) > rowTolerance || Math.sign(deltaX) !== direction)
                    return;
                const score = Math.abs(deltaX) + Math.abs(deltaY) * 4;
                if (score < bestScore) {
                    best = item;
                    bestScore = score;
                }
                return;
            }

            if (Math.sign(deltaY) !== direction)
                return;
            const score = Math.abs(deltaY) + Math.abs(deltaX) * 2;
            if (score < bestScore) {
                best = item;
                bestScore = score;
            }
        });

        if (!best)
            return false;
        best.forceActiveFocus();
        return true;
    }

    function handleKey(event, chevron: bool): void {
        if (event.key === Qt.Key_Left || event.key === Qt.Key_Right
                || event.key === Qt.Key_Up || event.key === Qt.Key_Down) {
            event.accepted = root.moveSpatially(event.key);
            return;
        }
        if (chevron)
            root.activateChevron(event);
        else
            root.activateMain(event);
    }

    function activateMain(event): void {
        if (!root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.clicked();
            event.accepted = true;
        }
    }

    function activateChevron(event): void {
        if (!root.interactive)
            return;
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
            root.chevronClicked(true);
            event.accepted = true;
        }
    }

    implicitHeight: Theme.quickSettingsTileHeight
    activeFocusOnTab: root.interactive && root.visible
    opacity: root.enabled ? 1 : 0.45
    scale: mainMouse.pressed || chevronMouse.pressed ? 0.98 : 1

    Keys.onPressed: event => root.handleKey(event, false)

    onActiveFocusChanged: root.mainFocusVisible = root.activeFocus

    Behavior on opacity {
        NumberAnimation {
            duration: Theme.quickSettingsFastMotion
            easing.type: Easing.OutCubic
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
        color: root.settledColor

        Behavior on color {
            ColorAnimation {
                duration: Theme.quickSettingsFastMotion
                easing.type: Easing.OutCubic
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: Theme.foreground
        opacity: mainMouse.containsMouse || chevronMouse.containsMouse ? 0.10 : 0

        Behavior on opacity {
            NumberAnimation {
                duration: Theme.quickSettingsFastMotion
                easing.type: Easing.OutCubic
            }
        }
    }

    Item {
        id: mainSegment

        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.right: root.chevronVisible ? divider.left : parent.right

        Text {
            id: glyph

            anchors.left: parent.left
            anchors.leftMargin: 16
            anchors.verticalCenter: parent.verticalCenter

            text: root.icon
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 1
            textFormat: Text.PlainText
        }

        Text {
            anchors.left: glyph.right
            anchors.leftMargin: 10
            anchors.right: busyIndicator.visible ? busyIndicator.left : parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter

            text: root.label
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            font.weight: Font.DemiBold
            textFormat: Text.PlainText
            elide: Text.ElideRight
            maximumLineCount: 1
        }

        Text {
            id: busyIndicator

            visible: root.busy
            anchors.right: parent.right
            anchors.rightMargin: 10
            anchors.verticalCenter: parent.verticalCenter

            text: "◌"
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize

            RotationAnimation on rotation {
                running: busyIndicator.visible
                from: 0
                to: 360
                duration: 900
                loops: Animation.Infinite
            }
        }

        MouseArea {
            id: mainMouse

            anchors.fill: parent
            enabled: root.interactive
            hoverEnabled: true

            onPressed: {
                root.forceActiveFocus();
                root.mainFocusVisible = false;
            }
            onClicked: root.clicked()
        }
    }

    Rectangle {
        id: divider

        visible: root.chevronVisible
        anchors.right: chevronSegment.left
        anchors.verticalCenter: parent.verticalCenter
        width: 1
        height: parent.height - 16
        color: root.active ? Theme.background : Theme.foreground
        opacity: 0.22
    }

    Item {
        id: chevronSegment

        visible: root.chevronVisible
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        width: 42

        activeFocusOnTab: root.interactive && root.chevronVisible && root.visible
        Keys.onPressed: event => root.handleKey(event, true)
        onActiveFocusChanged: root.chevronFocusVisible = chevronSegment.activeFocus

        Text {
            anchors.centerIn: parent
            text: "›"
            color: root.active ? Theme.background : Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize + 4
            textFormat: Text.PlainText
        }

        MouseArea {
            id: chevronMouse

            anchors.fill: parent
            enabled: root.interactive
            hoverEnabled: true

            onPressed: {
                chevronSegment.forceActiveFocus();
                root.chevronFocusVisible = false;
            }
            onClicked: root.chevronClicked(false)
        }

        Rectangle {
            anchors.fill: parent
            anchors.margins: 4
            radius: height / 2
            color: "transparent"
            border.color: root.active ? Theme.foreground : Theme.accent
            border.width: root.chevronFocusVisible ? 2 : 0
        }
    }

    Rectangle {
        anchors.fill: mainSegment
        anchors.margins: 3
        radius: height / 2
        color: "transparent"
        border.color: root.active ? Theme.foreground : Theme.accent
        border.width: root.mainFocusVisible ? 2 : 0
    }

    Tooltip {
        target: root
        text: root.label
        shown: mainMouse.containsMouse || chevronMouse.containsMouse || root.mainFocusVisible || root.chevronFocusVisible
    }
}
