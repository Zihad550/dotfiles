import QtQuick
import Quickshell
import qs

// waybar: "{:L%a, %d. %b %I:%M %p}" -> "Sat, 25. Jul 12:40 PM", tooltip disabled.
Text {
    id: root

    // style.css nudged #clock 8.75px right of centre.
    anchors.horizontalCenterOffset: 8.75

    text: Qt.formatDateTime(clock.date, "ddd, dd. MMM hh:mm AP")
    color: Theme.foreground
    font.family: Theme.fontFamily
    font.pixelSize: Theme.fontSize
    textFormat: Text.PlainText

    SystemClock {
        id: clock

        precision: SystemClock.Minutes
    }
}
