pragma Singleton

import QtQuick
import Quickshell

Singleton {
    id: root

    property bool shown: false

    function open(): void {
        root.shown = true;
    }

    function close(): void {
        root.shown = false;
    }

    function toggle(): void {
        root.shown = !root.shown;
    }
}
