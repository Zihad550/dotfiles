import QtQuick

// Holds a Provider's data while it is selected and for `releaseDelay` after.
// See docs/quickshell-memory.md.
QtObject {
    id: root

    required property bool selected
    property bool retained: false
    property int releaseDelay: 30000
    signal refreshRequested()

    function update(): void {
        if (root.selected) {
            releaseTimer.stop();
            root.retained = true;
            root.refreshRequested();
        } else if (root.retained) {
            releaseTimer.restart();
        }
    }

    onSelectedChanged: root.update()
    Component.onCompleted: root.update()

    readonly property Timer releaseTimer: Timer {
        interval: root.releaseDelay
        onTriggered: root.retained = false
    }
}
