pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// The Launcher's colors and metrics.
//
// This is a second copy of the bar's Theme.qml on purpose, not by oversight:
// each Quickshell config root is its own import namespace, so the bar's
// singleton cannot be imported from here. It is not duplication of the theme
// either -- the color *definitions* live in ~/.config/theme/quickshell.json,
// rendered by df-theme-generate from themes/templates/quickshell.json.tpl,
// and both configs are readers of that one file. They cannot drift on color.
//
// What differs below the color block is deliberate. The bar is compact because
// it is read at a glance from the corner; the Launcher is read up close and at
// length, so it is sized more like the notification popups.
Singleton {
    id: root

    readonly property color background: colors.background
    readonly property color foreground: colors.foreground
    readonly property color accent: colors.accent
    readonly property color ok: colors.ok
    readonly property color error: colors.error
    readonly property color warn: colors.warn

    // Dimmed backdrop behind the Launcher. Derived from the theme background
    // rather than hardcoded, so a light theme does not get a black scrim.
    readonly property color scrim: Qt.rgba(background.r, background.g, background.b, 0.65)

    // The highlighted Entry, and Entries the user has Marked.
    readonly property color highlight: Qt.rgba(accent.r, accent.g, accent.b, 0.22)
    readonly property color markedBorder: accent

    // The Entry under the pointer. Deliberately weaker than `highlight`: the
    // two are visible at once and the keyboard's highlight is the one Enter
    // acts on, so it has to stay the louder of the two.
    readonly property color hover: Qt.rgba(accent.r, accent.g, accent.b, 0.10)

    // Placeholder text, separators, and the Entry sub-line. Derived from the
    // foreground so it stays legible in a light theme, where a fixed grey
    // would not.
    readonly property color muted: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.45)

    readonly property string fontFamily: "Fira Code"

    // The Query line is large enough to read while typing; Entries sit between
    // it and the bar's 14px.
    readonly property int queryFontSize: 22
    readonly property int entryFontSize: 15
    readonly property int entrySubFontSize: 12

    // The Action hints along the bottom. Same size as an Entry's sub-line, but
    // its own property: the footer is chrome rather than content, and sizing it
    // is a separate decision from sizing what an Entry says about itself.
    readonly property int hintFontSize: 12

    readonly property int width: 720
    readonly property int maxHeight: 560
    readonly property int padding: 16
    // Uniform, and the list's height arithmetic depends on it being uniform.
    // Sized for the two-line Entry the windows Provider introduced: a 15px name
    // over a 12px sub-line is ~36px of text, which left nothing around it at
    // the 40px this was while applications were the only Provider.
    readonly property int entryHeight: 44
    readonly property int entryIconSize: 24
    readonly property int radius: 10

    // The screenshots Provider's list-plus-preview split -- ticket 13, the
    // first (and so far only) Provider whose `layout` is "preview" rather
    // than the default list. `previewListWidth` is the narrow name/date
    // column on the left; `previewImageSize` is the decode size
    // (`sourceSize`) for the single large image on the right, sized generous
    // enough to look sharp in a pane most of Theme.width wide rather than
    // tied to the pane's own on-screen size, which is not known until layout
    // runs.
    readonly property int previewListWidth: 220
    readonly property int previewImageSize: 480

    // df-theme-set retargets the ~/.config/theme symlink rather than editing
    // this file, and a file watcher does not necessarily see that. The watch
    // below covers in-place edits (df-theme-generate); shell.qml exposes this
    // over IPC to cover switches.
    function reload(): void {
        view.reload();
    }

    FileView {
        id: view

        path: `${Quickshell.env("HOME")}/.config/theme/quickshell.json`
        watchChanges: true
        onFileChanged: reload()

        // Defaults are catppuccin-mocha so the Launcher still renders if the
        // theme file is missing (e.g. before the first df-theme-generate run).
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
