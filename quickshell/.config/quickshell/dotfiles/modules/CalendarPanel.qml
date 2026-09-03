import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs
import "lib/calendar.js" as Calendar

// A read-only month overview anchored to the central clock.
PopupWindow {
    id: root

    property Item target: null
    property bool shown: false
    readonly property bool opened: root.shown
    property double lastCleared: 0

    property date today: new Date()
    readonly property string todayKey: Calendar.keyForDate(root.today)
    readonly property var labelLocale: Qt.locale()
    readonly property var weekdays: Calendar.weekdayOrder(root.labelLocale.firstDayOfWeek)
    readonly property var weeks: Calendar.monthGrid(
        root.today.getFullYear(),
        root.today.getMonth(),
        root.labelLocale.firstDayOfWeek,
        root.todayKey
    )

    readonly property int panelPadding: Theme.menuPadding
    readonly property int cellWidth: 38
    readonly property int cellHeight: 32
    readonly property int cellSpacing: 3
    readonly property int gridWidth: 7 * root.cellWidth + 6 * root.cellSpacing
    readonly property int panelContentHeight: calendarColumn.implicitHeight
        + 2 * root.panelPadding
    readonly property int availableWidth: root.screen
        ? Math.max(1, root.screen.width - 2 * Theme.edgeMargin)
        : root.gridWidth + 2 * root.panelPadding
    readonly property int availableHeight: root.screen
        ? Math.max(1, root.screen.height - Theme.barHeight - Theme.edgeMargin)
        : 10000

    function refresh(): void {
        root.today = new Date();
    }

    function open(): void {
        root.refresh();
        root.shown = true;
        Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    function close(): void {
        root.shown = false;
    }

    function toggle(): void {
        if (!root.shown && Date.now() - root.lastCleared < 200)
            return;
        if (root.shown)
            root.close();
        else
            root.open();
    }

    function monthLabel(): string {
        return root.labelLocale.monthName(root.today.getMonth(), Locale.LongFormat)
            + " " + root.today.getFullYear();
    }

    function weekdayLabel(weekday: int): string {
        return root.labelLocale.dayName(weekday, Locale.ShortFormat);
    }

    anchor.item: root.target
    anchor.rect.x: root.target ? (root.target.width - root.width) / 2 : 0
    anchor.rect.y: root.target ? root.target.height : 0

    visible: root.shown
    grabFocus: root.shown
    color: "transparent"
    implicitWidth: Math.min(root.gridWidth + 2 * root.panelPadding, root.availableWidth)
    implicitHeight: Math.min(root.panelContentHeight, root.availableHeight)

    HyprlandFocusGrab {
        windows: [root]
        active: root.shown

        onCleared: {
            root.lastCleared = Date.now();
            root.close();
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.accent
        border.width: 1
        radius: 4

        FocusScope {
            id: keyCatcher

            anchors.fill: parent
            anchors.margins: root.panelPadding
            focus: root.shown

            Keys.onEscapePressed: root.close()

            Flickable {
                id: calendarScroll

                anchors.fill: parent
                contentWidth: calendarColumn.width
                contentHeight: calendarColumn.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentWidth > width || contentHeight > height

                Column {
                    id: calendarColumn

                    width: Math.max(calendarScroll.width, root.gridWidth)
                    spacing: 8

                    Item {
                        width: parent.width
                        height: titleRow.implicitHeight

                        Row {
                            id: titleRow

                            anchors.horizontalCenter: parent.horizontalCenter
                            spacing: 10

                            Text {
                                text: root.monthLabel()
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize + 3
                                font.bold: true
                                textFormat: Text.PlainText
                            }
                        }
                    }

                    Item {
                        width: parent.width
                        height: weekdayHeader.implicitHeight

                        Row {
                            id: weekdayHeader

                            anchors.horizontalCenter: parent.horizontalCenter
                            spacing: root.cellSpacing

                            Repeater {
                                model: root.weekdays

                                Text {
                                    required property var modelData

                                    width: root.cellWidth
                                    height: root.cellHeight
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    text: root.weekdayLabel(modelData)
                                    color: Theme.foreground
                                    opacity: 0.65
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize - 3
                                    font.bold: true
                                    textFormat: Text.PlainText
                                }
                            }
                        }
                    }

                    Repeater {
                        model: root.weeks

                        Row {
                            required property var modelData

                            anchors.horizontalCenter: parent.horizontalCenter
                            spacing: root.cellSpacing

                            Repeater {
                                model: modelData.days

                                Rectangle {
                                    required property var modelData

                                    width: root.cellWidth
                                    height: root.cellHeight
                                    radius: 4
                                    color: "transparent"
                                    border.width: modelData.today ? 1 : 0
                                    border.color: Theme.accent

                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.day
                                        color: Theme.foreground
                                        opacity: modelData.inMonth ? 1 : 0.38
                                        font.family: Theme.fontFamily
                                        font.pixelSize: Theme.fontSize
                                        font.bold: modelData.today
                                        textFormat: Text.PlainText
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
