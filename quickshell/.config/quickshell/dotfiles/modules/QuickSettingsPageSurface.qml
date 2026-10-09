import QtQuick
import qs

// One Quick Settings Page slot: slides in when current and loads its Page
// only while shown and visible, so the Page is released after its exit fade.
Item {
    id: root

    required property int page
    required property int currentPage
    required property bool shown
    property bool available: true
    readonly property bool current: root.currentPage === root.page
    readonly property bool pageActive: root.shown && root.current
    property alias sourceComponent: pageLoader.sourceComponent
    property alias source: pageLoader.source
    readonly property Item item: pageLoader.item
    signal pageLoaded()

    x: root.current ? 0 : 8
    width: parent.width
    height: parent.height
    visible: opacity > 0
    enabled: root.current
    opacity: root.current ? 1 : 0

    Behavior on x {
        NumberAnimation {
            duration: Theme.quickSettingsPageMotion
            easing.type: Easing.OutCubic
        }
    }

    Behavior on opacity {
        NumberAnimation {
            duration: Theme.quickSettingsPageMotion
            easing.type: Easing.OutCubic
        }
    }

    Loader {
        id: pageLoader

        anchors.fill: parent
        active: root.available && root.shown && (root.current || root.opacity > 0)
        onLoaded: root.pageLoaded()
    }
}
