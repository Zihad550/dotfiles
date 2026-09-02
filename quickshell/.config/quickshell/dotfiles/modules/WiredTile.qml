import QtQuick
import qs

// Wired reconnect policy belongs to NetworkPage, not to a device convenience
// method that could choose the wrong saved profile.
Tile {
    id: root

    property var device: null
    property var controller: null

    signal pageRequested(bool keyboard)

    visible: root.device !== null
    icon: "󰀂"
    label: root.controller ? root.controller.wiredLabel(root.device) : "Wired"
    active: root.device?.connected ?? false
    busy: root.controller ? root.controller.wiredBusyFor(root.device) : false
    enabled: root.controller !== null
    chevronVisible: true

    onClicked: {
        if (root.controller)
            root.controller.toggleWired(root.device);
    }
    onChevronClicked: keyboard => root.pageRequested(keyboard)
}
