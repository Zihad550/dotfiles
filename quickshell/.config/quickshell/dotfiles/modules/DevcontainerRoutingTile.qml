import QtQuick
import qs

// The frequent routing action stays in the primary Tile grid; hostname
// editing belongs to the Page reached through its chevron.
Tile {
    id: root

    property QtObject routingState

    signal pageRequested(bool keyboard)

    icon: "󰡨"
    label: "Devcontainer"
    active: root.routingState.routingEnabled
    busy: root.routingState.busy
    chevronVisible: true

    onClicked: root.routingState.toggle()
    onChevronClicked: keyboard => root.pageRequested(keyboard)
}
