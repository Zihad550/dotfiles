import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import qs
import "lib/calendar.js" as Calendar
import "lib/barPanel.js" as BarPanel

// A browsable month overview anchored to the central clock.
PopupWindow {
    id: root

    property Item target: null
    property bool shown: false
    readonly property bool opened: root.shown
    property double lastCleared: 0

    // `today` is the reference date. Browsing changes viewYear/viewMonth,
    // never this value, so the highlight and year progress stay about today.
    property date today: new Date()
    property int viewYear: root.today.getFullYear()
    property int viewMonth: root.today.getMonth()
    readonly property string todayKey: Calendar.keyForDate(root.today)
    readonly property date viewDate: new Date(root.viewYear, root.viewMonth, 1)
    readonly property bool viewingCurrentMonth: root.viewYear === root.today.getFullYear()
        && root.viewMonth === root.today.getMonth()

    // These values are deliberately pinned to today, not to the browsed month.
    readonly property real yearDone: Calendar.yearProgress(
        root.today.getFullYear(), root.today.getMonth(), root.today.getDate()
    )
    readonly property real yearProgress: root.yearDone
    readonly property int yearDonePercent: Calendar.yearProgressPercent(
        root.today.getFullYear(), root.today.getMonth(), root.today.getDate()
    )

    // An empty file means first use. In that case the locale chooses the
    // convention; after W is used, CalendarState supplies the shared choice.
    readonly property var labelLocale: Qt.locale()
    readonly property int weekStart: Calendar.normalizedWeekStart(
        CalendarState.weekStartSetting, root.labelLocale.firstDayOfWeek
    )
    readonly property string nextWeekStartLabel: root.labelLocale.dayName(
        Calendar.toggledWeekStart(root.weekStart), Locale.LongFormat
    )
    readonly property string weekStartToggleLabel: "Start weeks on " + root.nextWeekStartLabel
    readonly property var weekdays: Calendar.weekdayOrder(root.weekStart)
    readonly property var weeks: Calendar.monthGrid(
        root.viewYear, root.viewMonth, root.weekStart, root.todayKey
    )

    readonly property int panelPadding: Theme.menuPadding
    readonly property int cellWidth: 38
    readonly property int cellHeight: 32
    readonly property int cellSpacing: 3
    readonly property int weekColumnWidth: 28
    readonly property int gutterWidth: 8
    readonly property int gridWidth: root.weekColumnWidth + root.gutterWidth
        + 7 * root.cellWidth + 8 * root.cellSpacing
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
        root.goToToday();
    }

    function goToToday(): void {
        root.viewYear = root.today.getFullYear();
        root.viewMonth = root.today.getMonth();
    }

    function moveMonth(delta: int): void {
        const next = Calendar.stepMonth(root.viewYear, root.viewMonth, delta);
        root.viewYear = next.year;
        root.viewMonth = next.month;
    }

    function moveYear(delta: int): void {
        root.moveMonth(delta * 12);
    }

    function setWeekStart(day: int): void {
        const next = Calendar.normalizedWeekStart(day, root.weekStart);
        if (next === root.weekStart)
            return;
        CalendarState.setWeekStart(Calendar.weekStartSettingName(next));
    }

    function toggleWeekStart(): void {
        root.setWeekStart(Calendar.toggledWeekStart(root.weekStart));
    }

    function open(): void {
        root.refresh();
        BarPanelCoordinator.claim(root);
        root.shown = true;
        Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    function close(): void {
        root.shown = false;
    }

    function dismiss(): void {
        root.close();
    }

    function toggle(): void {
        if (!root.shown && BarPanel.shouldSuppressReopen(root.lastCleared, Date.now()))
            return;
        if (root.shown)
            root.close();
        else
            root.open();
    }

    function monthLabel(): string {
        return root.labelLocale.monthName(root.viewMonth, Locale.LongFormat)
            + " " + root.viewYear;
    }

    function weekdayLabel(weekday: int): string {
        return root.labelLocale.dayName(weekday, Locale.ShortFormat);
    }

    anchor.item: root.target
    anchor.adjustment: PopupAdjustment.Slide
    anchor.rect.x: root.target ? (root.target.width - root.width) / 2 : 0
    anchor.rect.y: root.target ? root.target.height : 0

    visible: root.shown
    grabFocus: root.shown
    color: "transparent"
    implicitWidth: Math.min(root.gridWidth + 2 * root.panelPadding, root.availableWidth)
    implicitHeight: Math.min(root.panelContentHeight, root.availableHeight)

    onShownChanged: {
        if (root.shown)
            BarPanelCoordinator.claim(root);
        else
            BarPanelCoordinator.release(root);
    }

    Component.onDestruction: BarPanelCoordinator.release(root)

    SystemClock {
        id: clock

        precision: SystemClock.Minutes
        onDateChanged: {
            if (Calendar.keyForDate(clock.date) === root.todayKey)
                return;
            const followToday = root.viewingCurrentMonth;
            root.today = clock.date;
            if (followToday)
                root.goToToday();
        }
    }

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
            Keys.onPressed: event => {
                switch (event.key) {
                case Qt.Key_Left:
                    root.moveMonth(-1);
                    event.accepted = true;
                    break;
                case Qt.Key_Right:
                    root.moveMonth(1);
                    event.accepted = true;
                    break;
                case Qt.Key_Up:
                    root.moveYear(-1);
                    event.accepted = true;
                    break;
                case Qt.Key_Down:
                    root.moveYear(1);
                    event.accepted = true;
                    break;
                case Qt.Key_T:
                    root.goToToday();
                    event.accepted = true;
                    break;
                case Qt.Key_W:
                    root.toggleWeekStart();
                    event.accepted = true;
                    break;
                }
            }

            // A WheelHandler here never fires: on this Wayland/Qt build wheel
            // events reach MouseArea.onWheel only. Sits behind the Flickable so
            // a scrollable panel keeps the wheel for scrolling.
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.NoButton

                onWheel: event => {
                    // A horizontal-only wheel event has no month meaning.
                    if (event.angleDelta.y === 0)
                        return;
                    root.moveMonth(event.angleDelta.y > 0 ? -1 : 1);
                }
            }

            Flickable {
                id: calendarScroll

                anchors.fill: parent
                contentWidth: calendarColumn.width
                contentHeight: calendarColumn.implicitHeight
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                interactive: contentWidth > width || contentHeight > height
                ScrollBar.horizontal: ScrollBar { policy: ScrollBar.AsNeeded }
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

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

                            Rectangle {
                                width: 30
                                height: 30
                                radius: 4
                                color: previousMouse.containsMouse ? Theme.accent : "transparent"
                                opacity: previousMouse.containsMouse ? 0.18 : 1

                                Text {
                                    anchors.centerIn: parent
                                    text: "‹"
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize + 6
                                    textFormat: Text.PlainText
                                }

                                MouseArea {
                                    id: previousMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.moveMonth(-1)
                                }

                                Text {
                                    visible: previousMouse.containsMouse
                                    anchors.top: parent.bottom
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    text: "Previous month"
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize - 4
                                    textFormat: Text.PlainText
                                }
                            }

                            Text {
                                width: 150
                                horizontalAlignment: Text.AlignHCenter
                                text: root.monthLabel()
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize + 3
                                font.bold: true
                                textFormat: Text.PlainText
                            }

                            Rectangle {
                                width: 30
                                height: 30
                                radius: 4
                                color: nextMouse.containsMouse ? Theme.accent : "transparent"
                                opacity: nextMouse.containsMouse ? 0.18 : 1

                                Text {
                                    anchors.centerIn: parent
                                    text: "›"
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize + 6
                                    textFormat: Text.PlainText
                                }

                                MouseArea {
                                    id: nextMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.moveMonth(1)
                                }

                                Text {
                                    visible: nextMouse.containsMouse
                                    anchors.top: parent.bottom
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    text: "Next month"
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize - 4
                                    textFormat: Text.PlainText
                                }
                            }
                        }
                    }

                    Item {
                        width: parent.width
                        height: progressRow.implicitHeight

                        Row {
                            id: progressRow

                            anchors.horizontalCenter: parent.horizontalCenter
                            spacing: 8

                            Text {
                                text: root.today.getFullYear()
                                color: Theme.foreground
                                opacity: 0.65
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize - 3
                                textFormat: Text.PlainText
                            }

                            Rectangle {
                                width: 110
                                height: 6
                                anchors.verticalCenter: parent.verticalCenter
                                radius: 3
                                color: Theme.foreground
                                opacity: 0.14

                                Rectangle {
                                    width: Math.round(parent.width * root.yearDone)
                                    height: parent.height
                                    radius: parent.radius
                                    color: Theme.accent
                                }
                            }

                            Text {
                                text: root.yearDonePercent + "%"
                                color: Theme.foreground
                                opacity: 0.65
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize - 3
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

                            Rectangle {
                                width: root.weekColumnWidth
                                height: root.cellHeight
                                radius: 4
                                color: weekStartMouse.containsMouse ? Theme.accent : "transparent"
                                opacity: weekStartMouse.containsMouse ? 0.18 : 1

                                Text {
                                    anchors.centerIn: parent
                                    text: "W"
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize - 3
                                    font.bold: true
                                    textFormat: Text.PlainText
                                }

                                MouseArea {
                                    id: weekStartMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: root.toggleWeekStart()
                                }

                                Text {
                                    visible: weekStartMouse.containsMouse
                                    anchors.top: parent.bottom
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    text: root.weekStartToggleLabel
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.fontSize - 4
                                    textFormat: Text.PlainText
                                }
                            }

                            Item {
                                width: root.gutterWidth
                                height: root.cellHeight
                            }

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

                            Text {
                                width: root.weekColumnWidth
                                height: root.cellHeight
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                                text: modelData.week
                                color: Theme.foreground
                                opacity: 0.65
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize - 3
                                textFormat: Text.PlainText
                            }

                            Item {
                                width: root.gutterWidth
                                height: root.cellHeight
                            }

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

                    Item {
                        width: parent.width
                        height: 24

                        Text {
                            anchors.centerIn: parent
                            text: root.viewingCurrentMonth ? "T  today" : "T  return to today"
                            color: Theme.foreground
                            opacity: root.viewingCurrentMonth ? 0.42 : 0.8
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.fontSize - 3
                            textFormat: Text.PlainText

                            MouseArea {
                                anchors.fill: parent
                                enabled: !root.viewingCurrentMonth
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.goToToday()
                            }
                        }
                    }
                }
            }
        }
    }
}
