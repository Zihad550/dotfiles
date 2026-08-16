pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Colors come from the dotfiles theme system.
//
// df-theme-generate renders themes/templates/quickshell.json.tpl into
// ~/.config/themes/<name>/quickshell.json, and ~/.config/theme symlinks to the
// active theme. FileView watches that path, so switching themes restyles the
// bar live -- no service restart, unlike waybar.
Singleton {
    id: root

    readonly property color background: colors.background
    readonly property color foreground: colors.foreground
    readonly property color accent: colors.accent
    readonly property color ok: colors.ok
    readonly property color error: colors.error
    readonly property color warn: colors.warn

    // Matches waybar/style.css: Fira Code 14px, 26px bar.
    readonly property string fontFamily: "Fira Code"
    readonly property int fontSize: 14
    readonly property int barHeight: 26

    // Horizontal padding of the left/right module groups (.modules-left/right).
    readonly property int edgeMargin: 8

    // Quick Settings: total popup width, inner padding, height of one row's header.
    // Widened from 240 for DevcontainerRoutingRow: at 240, its label, toggle,
    // and the resolved host "devcontainer.devpod" (the default -- see ticket
    // 03) elided past legibility. Tailscale's toggle never faced this, since
    // its detail is always short or blank.
    readonly property int menuWidth: 360
    readonly property int menuPadding: 10
    readonly property int menuRowHeight: 30

    // Notification popups: stack width, inner padding, and text sizes. Set
    // larger than the bar, which is deliberately compact -- notifications are
    // read at a glance from across the screen, not scanned.
    readonly property int notificationWidth: 400
    readonly property int notificationPadding: 12
    readonly property int notificationIconSize: 32
    readonly property int notificationFontSize: 15
    readonly property int notificationSummaryFontSize: 17

    // OSD pill: swayosd's default was a 300x100 box near the bottom of the
    // screen; this is flatter because it holds one bar, not a grid.
    readonly property int osdWidth: 320
    readonly property int osdHeight: 56
    readonly property int osdMargin: 120
    readonly property int osdIconSize: 24

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

        // Defaults are catppuccin-mocha so the bar still renders if the theme
        // file is missing (e.g. before the first df-theme-generate run).
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
