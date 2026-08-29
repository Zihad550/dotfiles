import QtQuick
import Quickshell
import Quickshell.Io

// The Session Lock's colors and metrics, read from the active theme's
// Quickshell data -- the same ~/.config/theme/quickshell.json the bar and the
// Launcher read. There is no lock-specific theme file: the generated
// per-theme hyprlock.conf and the font switcher's positional substitution
// into it are what this replaces (docs/session-lifecycle-spec.md).
//
// A plain component, not a Singleton like the bar's and the Launcher's:
// LockSurface.qml is loaded from two config roots (the lock's and the probe's),
// and a singleton is reachable only through the `qs` namespace of whichever
// root resolved it. An instance travels with the component instead.
QtObject {
    readonly property color background: colors.background
    readonly property color foreground: colors.foreground
    readonly property color accent: colors.accent
    readonly property color error: colors.error

    // Derived from the theme rather than fixed, so a light theme does not get
    // a black field on a bright wallpaper.
    readonly property color fieldBackground: Qt.rgba(background.r, background.g, background.b, 0.85)
    readonly property color placeholder: Qt.rgba(foreground.r, foreground.g, foreground.b, 0.45)
    readonly property color selection: Qt.rgba(accent.r, accent.g, accent.b, 0.35)

    // df-font-set rewrites this line, anchored on the property name, in every
    // Quickshell config's Theme.qml.
    readonly property string fontFamily: "Fira Code"

    // The field is read from across a desk at a glance, so it is sized well
    // above the Launcher's query line. Proportions follow the hyprlock
    // input-field this replaces (650x100, 4px outline), pulled in a little
    // now that the clock sits above it rather than overlapping it.
    readonly property int fieldWidth: 560
    readonly property int fieldHeight: 88
    readonly property int fieldRadius: 12
    readonly property int outlineThickness: 3
    readonly property int fieldFontSize: 24
    readonly property int dotFontSize: 30
    readonly property int dotSpacing: 6
    readonly property int clockFontSize: 96
    readonly property int clockGap: 96

    property FileView view: FileView {
        path: `${Quickshell.env("HOME")}/.config/theme/quickshell.json`
        watchChanges: true
        onFileChanged: reload()

        // Catppuccin-mocha defaults, so the lock still renders -- and can
        // still be dismissed -- before the first df-theme-generate run.
        JsonAdapter {
            id: colors

            property string background: "#1e1e2e"
            property string foreground: "#cdd6f4"
            property string accent: "#89b4fa"
            property string error: "#f38ba8"
        }
    }
}
