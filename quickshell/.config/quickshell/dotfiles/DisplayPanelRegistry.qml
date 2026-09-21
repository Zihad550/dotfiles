pragma Singleton

import QtQuick
import Quickshell

Singleton {
    id: root

    property var panels: ({})

    function register(monitorName: string, panel: var): void {
        root.panels[monitorName] = panel;
    }

    function unregister(monitorName: string, panel: var): void {
        if (root.panels[monitorName] === panel)
            delete root.panels[monitorName];
    }

    function panelFor(monitorName: string): var {
        return root.panels[monitorName];
    }
}
