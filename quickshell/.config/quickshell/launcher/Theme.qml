pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// The Launcher's colors and metrics. A second copy of the bar's Theme.qml,
// deliberately: each Quickshell config root is its own import namespace, so
// the bar's singleton can't be imported here. Not a duplication of the theme
// itself -- color *definitions* live in ~/.config/theme/quickshell.json, and
// both configs just read that one file, so they can't drift on color.
//
// What differs below the color block is deliberate: the bar is compact
// (read at a glance), the Launcher is read up close and at length, so it's
// sized more like the notification popups.
Singleton {
    id: root

    readonly property color background: colors.background
    readonly property color foreground: colors.foreground
    readonly property color accent: colors.accent
    readonly property color ok: colors.ok
    readonly property color error: colors.error
    readonly property color warn: colors.warn

    // Derived from the theme background, not hardcoded, so a light theme
    // doesn't get a black scrim.
    readonly property color scrim: Qt.rgba(background.r, background.g, background.b, 0.65)

    readonly property color highlight: Qt.rgba(accent.r, accent.g, accent.b, 0.22)
    readonly property color markedBorder: accent

    // Weaker than `highlight`, deliberately: both are visible at once and
    // the keyboard's highlight is what Enter acts on, so it stays the louder one.
    readonly property color hover: Qt.rgba(accent.r, accent.g, accent.b, 0.10)

    // Derived from the foreground so it stays legible in a light theme,
    // where a fixed grey wouldn't.
    readonly property color muted: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.45)

    readonly property string fontFamily: "Fira Code"

    readonly property int queryFontSize: 22
    readonly property int entryFontSize: 15
    readonly property int entrySubFontSize: 12

    // Same size as an Entry's sub-line, but its own property: the footer is
    // chrome, sizing it is a separate decision from sizing an Entry.
    readonly property int hintFontSize: 12

    readonly property int width: 720
    readonly property int maxHeight: 560
    readonly property int padding: 16
    // Uniform, and the list's height arithmetic depends on it staying so.
    // Sized for the two-line Entry (15px name + 12px sub-line, ~36px of
    // text) the windows Provider introduced.
    readonly property int entryHeight: 44
    readonly property int entryIconSize: 24
    readonly property int radius: 10

    // The screenshots/themes Providers' list-plus-preview split.
    // `previewListWidth` is the narrow left column; `previewImageSize` is the
    // decode size for the large image, sized generously rather than tied to
    // the pane's on-screen size (not known until layout runs).
    readonly property int previewListWidth: 220
    readonly property int previewImageSize: 480

    // df-theme-set retargets the ~/.config/theme symlink rather than editing
    // this file, and a file watcher doesn't necessarily see that -- the
    // watch below covers in-place edits (df-theme-generate); shell.qml
    // exposes this over IPC to cover switches.
    function reload(): void {
        view.reload();
    }

    FileView {
        id: view

        path: `${Quickshell.env("HOME")}/.config/theme/quickshell.json`
        watchChanges: true
        onFileChanged: reload()

        // Catppuccin-mocha defaults so the Launcher still renders before the
        // first df-theme-generate run.
        JsonAdapter {
            id: colors

            property string background: "#1e1e2e"
            property string foreground: "#cdd6f4"
            property string accent: "#89b4fa"
            property string ok: "#a6e3a1"
            property string error: "#f38ba8"
            property string warn: "#fab387"
        }
    }
}
