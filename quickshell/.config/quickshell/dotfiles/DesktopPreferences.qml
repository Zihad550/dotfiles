pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property var values: ({})

    // Mirror df-settings-control's validation so a hand-edited entry it ignores is ignored here too.
    function value(key: string, fallback: var, minimum: var, maximum: var): var {
        const stored = root.values[key];
        if (typeof stored !== typeof fallback)
            return fallback;
        if (typeof stored === "number" && (!Number.isInteger(stored) || stored < minimum || stored > maximum))
            return fallback;
        if (key === "appearance.fontFamily" && (stored.length > 200 || stored !== stored.trim() || /[\x00-\x1f\x7f]/.test(stored)))
            return fallback;
        return stored;
    }

    function reload(): void {
        preferences.reload();
    }

    FileView {
        id: preferences
        path: `${Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state"}/dotfiles/settings.json`
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try {
                root.values = JSON.parse(text());
            } catch (error) {
                console.warn("settings: invalid preferences:", error);
            }
        }
        onLoadFailed: root.values = ({})
    }
}
