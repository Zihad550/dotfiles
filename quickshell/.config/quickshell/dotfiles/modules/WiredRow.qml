import QtQuick
import Quickshell.Networking
import qs

// Ticket 06: split from NetworkItem, which used to fall back to a wired
// glyph. That stopped being honest once ticket 05 made the Wi-Fi Row's glyph
// a control -- a shared row would show a wired glyph whose click toggled the
// wireless radio. There is nothing to toggle about a cable, so this row has
// no control at all: enabled: false makes that literal, not just implied.
MenuRow {
    id: root

    visible: Networking.devices.values.some(device => device.type === DeviceType.Wired && device.connected)
    enabled: false

    icon: "󰀂"
    label: "Wired"
    detail: "Connected"
}
