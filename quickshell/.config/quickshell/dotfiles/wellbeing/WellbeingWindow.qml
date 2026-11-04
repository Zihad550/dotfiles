import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import Quickshell
import qs
import "usage.js" as Usage

FloatingWindow {
    id: root
    required property var app
    property string page: "dashboard"
    property string period: "7"
    readonly property var periodIds: ["1", "7", "30", "365", "all", "custom"]
    property string query: ""
    property string startDate: Usage.dayKey(new Date(app.now - 6 * 86400000))
    property string endDate: Usage.dayKey(new Date(app.now))
    readonly property var days: Usage.range(app.store, app.now, period, startDate, endDate)
    readonly property var summary: Usage.report(app.store, days, query, root.nameOf)
    readonly property string earliest: Object.keys(app.store.days).sort()[0] || "No history yet"
    readonly property string trackingStatus: {
        if (app.error)
            return app.error;
        if (!app.ready)
            return "Loading history…";
        if (app.store.paused)
            return "Tracking paused";
        if (app.locked)
            return "Session locked · tracking paused";
        return app.tracking ? "Tracking focused application time" : "Idle · tracking paused";
    }
    function nameOf(id: string): string {
        return DesktopEntries.byId(id)?.name || id;
    }
    title: "Wellbeing"
    visible: true
    implicitWidth: 980
    implicitHeight: 820
    minimumSize: Qt.size(760, 600)
    color: Theme.background
    onClosed: app.shown = false

    Pane {
        anchors.fill: parent
        padding: 24
        font.family: Theme.fontFamily
        font.pixelSize: 14
        palette {
            windowText: Theme.foreground
            text: Theme.foreground
            buttonText: Theme.foreground
            button: Qt.tint(Theme.background, Qt.alpha(Theme.foreground, 0.08))
            base: Qt.tint(Theme.background, Qt.alpha(Theme.foreground, 0.04))
            highlight: Theme.accent
            highlightedText: Theme.background
            placeholderText: Qt.alpha(Theme.foreground, 0.5)
        }
        background: Rectangle { color: Theme.background }

        ColumnLayout {
            anchors.fill: parent
            spacing: 14
            RowLayout {
                Layout.fillWidth: true
                Label { text: "Wellbeing"; font.pixelSize: 28; font.bold: true; Layout.fillWidth: true }
                Button {
                    text: root.app.store.paused ? "Resume tracking" : "Pause tracking"
                    enabled: root.app.ready
                    onClicked: root.app.togglePause()
                }
            }
            Label {
                Layout.fillWidth: true
                text: root.trackingStatus
                color: root.app.error ? Theme.error : Theme.foreground
                opacity: root.app.error ? 1 : 0.65
                wrapMode: Text.Wrap
            }
            RowLayout {
                Button { text: "Dashboard"; checkable: true; checked: root.page === "dashboard"; onClicked: root.page = "dashboard" }
                Button { text: "History"; checkable: true; checked: root.page === "history"; onClicked: root.page = "history" }
                Item { Layout.fillWidth: true }
                ComboBox {
                    id: periodPicker
                    model: ["Today", "Past week", "Past month (30 days)", "Past year (365 days)", "All history", "Custom dates"]
                    currentIndex: root.periodIds.indexOf(root.period)
                    onActivated: root.period = root.periodIds[currentIndex]
                    Accessible.name: "History date range"
                }
            }
            RowLayout {
                visible: root.period === "custom"
                Label { text: "From" }
                TextField {
                    Layout.fillWidth: true
                    text: root.startDate
                    placeholderText: "YYYY-MM-DD"
                    Accessible.name: "Start date, YYYY-MM-DD"
                    onTextEdited: root.startDate = text
                }
                Label { text: "Through" }
                TextField {
                    Layout.fillWidth: true
                    text: root.endDate
                    placeholderText: "YYYY-MM-DD"
                    Accessible.name: "End date, YYYY-MM-DD"
                    onTextEdited: root.endDate = text
                }
            }
            TextField {
                Layout.fillWidth: true
                placeholderText: "Search application name or ID…"
                Accessible.name: "Filter applications"
                onTextChanged: root.query = text
                selectByMouse: true
            }
            Label {
                Layout.fillWidth: true
                text: root.days.length ? root.days[0] + " — " + root.days[root.days.length - 1]
                    + " · " + root.summary.activeDays + " days with saved time"
                    : "Enter valid dates in YYYY-MM-DD format, in order, starting no later than today (maximum 100 years)."
                color: root.days.length ? Theme.foreground : Theme.warn
                opacity: 0.65
                wrapMode: Text.Wrap
            }

            Loader {
                Layout.fillWidth: true
                Layout.fillHeight: true
                sourceComponent: root.page === "dashboard" ? dashboard : history
            }
            Label {
                Layout.fillWidth: true
                text: "Local history since " + root.earliest + ". Missing days have no saved time. Idle and locked time are excluded."
                wrapMode: Text.Wrap
                font.pixelSize: 11
                opacity: 0.5
            }
        }
    }

    Component {
        id: dashboard
        ScrollView {
            id: dashboardScroll
            clip: true
            contentWidth: availableWidth
            ColumnLayout {
                width: dashboardScroll.availableWidth
                spacing: 18
                RowLayout {
                    Layout.fillWidth: true
                    MetricCard { label: "FOCUSED TIME"; value: Usage.duration(root.summary.total) }
                    MetricCard { label: "DAILY AVERAGE"; value: Usage.duration(root.summary.average); detail: "Includes days with no saved time" }
                    MetricCard {
                        label: "BUSIEST DAY"
                        value: root.summary.busiest.day || "—"
                        detail: Usage.duration(root.summary.busiest.milliseconds)
                    }
                }
                Label {
                    Layout.fillWidth: true
                    text: {
                        const previous = root.summary.previous;
                        if (!root.days.length)
                            return "Choose a valid date range.";
                        if (!previous)
                            return "No saved time in the preceding " + root.days.length + " days to compare.";
                        const percent = Math.round((root.summary.total - previous) / previous * 100);
                        return Math.abs(percent) + "% " + (percent < 0 ? "less" : "more")
                            + " time than the preceding " + root.days.length + " days (" + Usage.duration(previous) + ").";
                    }
                    opacity: 0.65
                    wrapMode: Text.Wrap
                }
                Label { text: root.summary.bucketSize === 1 ? "Daily focused time" : "Focused time · up to " + root.summary.bucketSize + " days per bar"; font.bold: true }
                RowLayout {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 126
                    spacing: 4
                    Repeater {
                        model: root.summary.trend
                        delegate: Item {
                            id: bucket
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            readonly property double maximum: Math.max(1, ...root.summary.trend.map(entry => entry.milliseconds))
                            Rectangle {
                                anchors.bottom: parent.bottom
                                width: parent.width
                                height: Math.max(2, (parent.height - 8) * bucket.modelData.milliseconds / bucket.maximum)
                                radius: 3
                                color: bucket.modelData.milliseconds ? Theme.accent : Qt.alpha(Theme.foreground, 0.1)
                            }
                            HoverHandler { id: barHover }
                            ToolTip.visible: barHover.hovered
                            ToolTip.text: modelData.start + (modelData.start === modelData.end ? "" : " — " + modelData.end) + "\n" + Usage.duration(modelData.milliseconds)
                        }
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    Label { text: root.days[0] || ""; opacity: 0.5; font.pixelSize: 11 }
                    Item { Layout.fillWidth: true }
                    Label { text: root.days[root.days.length - 1] || ""; opacity: 0.5; font.pixelSize: 11 }
                }
                Label { text: "Applications · " + root.summary.applications.length; font.bold: true }
                Label {
                    visible: root.summary.applications.length === 0
                    text: "No saved application time matches these filters."
                    opacity: 0.6
                }
                Repeater {
                    model: root.summary.applications
                    delegate: ColumnLayout {
                        id: applicationRow
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: 7
                        RowLayout {
                            Layout.fillWidth: true
                            Label {
                                text: root.nameOf(applicationRow.modelData.app)
                                textFormat: Text.PlainText
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }
                            Label { text: Math.round(applicationRow.modelData.milliseconds / Math.max(1, root.summary.total) * 100) + "%"; opacity: 0.5 }
                            Label { text: Usage.duration(applicationRow.modelData.milliseconds); font.bold: true }
                        }
                        Rectangle {
                            Layout.fillWidth: true
                            implicitHeight: 6
                            radius: 3
                            color: Qt.alpha(Theme.foreground, 0.08)
                            Rectangle {
                                height: parent.height
                                width: parent.width * applicationRow.modelData.milliseconds / Math.max(1, root.summary.total)
                                radius: 3
                                color: Theme.accent
                            }
                        }
                    }
                }
            }
        }
    }
    Component {
        id: history
        ListView {
            id: historyList
            clip: true
            spacing: 8
            model: root.summary.history
            ScrollBar.vertical: ScrollBar {}
            delegate: Rectangle {
                id: historyRow
                required property var modelData
                width: ListView.view.width
                implicitHeight: modelData.heading ? 46 : 56
                radius: 6
                color: modelData.heading ? Qt.alpha(Theme.foreground, 0.06) : "transparent"
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 10
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 3
                        Label {
                            Layout.fillWidth: true
                            text: historyRow.modelData.heading ? historyRow.modelData.day : root.nameOf(historyRow.modelData.app)
                            textFormat: Text.PlainText
                            font.bold: historyRow.modelData.heading
                            elide: Text.ElideRight
                        }
                        Label {
                            visible: !historyRow.modelData.heading
                            Layout.fillWidth: true
                            text: historyRow.modelData.app
                            textFormat: Text.PlainText
                            font.pixelSize: 11
                            opacity: 0.5
                            elide: Text.ElideRight
                        }
                    }
                    Label { text: Usage.duration(historyRow.modelData.milliseconds); font.bold: true }
                }
            }
            Label {
                anchors.centerIn: parent
                visible: historyList.count === 0
                text: "No saved application time matches these filters."
                opacity: 0.6
            }
        }
    }
}
