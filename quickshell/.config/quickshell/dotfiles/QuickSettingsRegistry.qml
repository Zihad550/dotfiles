pragma Singleton

import QtQuick
import Quickshell

// Maps monitor name -> that monitor's QuickSettings instance. Needed because
// QuickSettings is instantiated once per screen inside Bar.qml (anchored to
// that screen's own Status Cluster), so the SUPER+CTRL+A GlobalShortcut in shell.qml
// has no direct reference to any of them -- it only knows which monitor is
// focused. Bar.qml registers on Component.onCompleted and unregisters on
// Component.onDestruction. See docs/adr/0004-quicksettings-keybind.md.
Singleton {
    id: root

    property var panels: ({})

    function register(monitorName: string, panel: var): void {
        panels[monitorName] = panel;
    }

    // Guarded by identity, not just key: on monitor unplug/replug a new
    // Bar's register() can land before the old Bar's unregister() -- an
    // unguarded delete would then drop the live registration, not the stale
    // one. See docs/adr/0004-quicksettings-keybind.md.
    function unregister(monitorName: string, panel: var): void {
        if (panels[monitorName] === panel)
            delete panels[monitorName];
    }

    function panelFor(monitorName: string): var {
        return panels[monitorName];
    }
}
