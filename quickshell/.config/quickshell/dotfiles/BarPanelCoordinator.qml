pragma Singleton

import QtQuick
import Quickshell

// Bar popups share one focus owner across monitors. Claiming the slot closes
// the previous panel before the new one grabs focus.
Singleton {
    id: root

    property var activePanel: null

    function claim(panel: var): void {
        if (!panel || root.activePanel === panel)
            return;

        const previous = root.activePanel;
        root.activePanel = panel;
        if (previous && previous.shown && typeof previous.dismiss === "function")
            previous.dismiss();
    }

    function release(panel: var): void {
        if (root.activePanel === panel)
            root.activePanel = null;
    }
}
