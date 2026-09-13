pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Bluetooth

Singleton {
    id: root

    readonly property var adapter: Bluetooth.defaultAdapter
    property int activePages: 0
    property bool owesDiscoveryStop: false

    function acquire(): void {
        root.activePages += 1;
    }

    function release(): void {
        root.activePages = Math.max(0, root.activePages - 1);
    }

    Timer {
        interval: 1000
        repeat: true
        triggeredOnStart: true
        running: root.activePages > 0 && root.adapter?.enabled && !root.adapter.discovering
        onTriggered: {
            root.owesDiscoveryStop = true;
            root.adapter.discovering = true;
        }
    }

    Timer {
        id: discoveryStop
        property int attempts: 0

        interval: 1000
        repeat: true
        running: root.activePages === 0 && root.owesDiscoveryStop && root.adapter?.discovering === true
        onRunningChanged: if (running) attempts = 0
        onTriggered: {
            attempts += 1;
            if (attempts > 3) {
                root.owesDiscoveryStop = false;
                return;
            }
            root.adapter.discovering = false;
        }
    }

    Connections {
        target: root.adapter
        function onDiscoveringChanged(): void {
            if (!root.adapter.discovering)
                root.owesDiscoveryStop = false;
        }
    }
}
