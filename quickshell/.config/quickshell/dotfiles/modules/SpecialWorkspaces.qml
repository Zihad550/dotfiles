import QtQuick
import Quickshell
import qs

// The special workspaces, collapsed into one bar entry.
//
// A dozen of them can exist at once (hypr/lua/bindings/apps.lua opens one per
// webapp), which used to fill the left half of the bar. Only the one that is
// open -- or the last one that was, so the entry does not go blank the moment
// it is toggled shut -- gets a slot; a click drops the rest down in a menu.
//
// With a single special workspace there is nothing to choose between, so the
// entry stays a plain button and the menu never opens.
Item {
    id: root

    // The special HyprlandWorkspaces on this bar's monitor, in Hyprland's own
    // order. Filtered by Workspaces.qml, which owns the monitor lookup.
    property var workspaces: []

    // Name of the special workspace currently open on this monitor, "" when
    // none. Hyprland has reported this both bare and "special:"-prefixed
    // depending on version, hence matches() rather than a comparison.
    property string activeSpecial: ""

    // Remembered across a close so the entry keeps showing the workspace the
    // user was last in, instead of falling back to whichever one Hyprland
    // happens to list first.
    property string lastSpecial: ""

    onActiveSpecialChanged: {
        if (root.activeSpecial !== "")
            root.lastSpecial = root.activeSpecial;
    }

    function matches(workspace, special) {
        if (special === "")
            return false;
        return workspace.name === special || workspace.name === `special:${special}`;
    }

    function label(workspace) {
        // "special:magic" -> "magic". The unnamed special workspace is just
        // "special", which has no prefix to strip.
        return workspace.name.replace(/^special:/, "");
    }

    readonly property var openWorkspace: root.workspaces.find(ws => root.matches(ws, root.activeSpecial)) ?? null

    // What the bar entry shows: the open one, else the last one open, else the
    // first that exists (true on the first frame after login).
    readonly property var currentWorkspace: root.openWorkspace ?? root.workspaces.find(ws => root.matches(ws, root.lastSpecial)) ?? root.workspaces[0] ?? null

    // Menu order: the entry's own workspace on top, the rest below it.
    readonly property var ordered: {
        const current = root.currentWorkspace;
        if (!current)
            return root.workspaces;
        return [current, ...root.workspaces.filter(ws => ws.name !== current.name)];
    }

    readonly property bool collapsible: root.workspaces.length > 1

    // Nothing left to choose between once the second-to-last one closes.
    onCollapsibleChanged: {
        if (!root.collapsible)
            menu.shown = false;
    }

    // Row skips invisible children, so nothing is left behind when no special
    // workspace exists -- the common case right after login.
    visible: root.currentWorkspace !== null
    implicitWidth: content.implicitWidth + 12 // padding: 0 6px, as in Workspaces
    implicitHeight: Theme.barHeight

    Row {
        id: content

        anchors.centerIn: parent
        spacing: 3

        Text {
            anchors.verticalCenter: parent.verticalCenter

            text: root.currentWorkspace ? root.label(root.currentWorkspace) : ""
            color: Theme.foreground
            // Same scale as Workspaces: open = 1, has windows = 0.75, bare = 0.5.
            opacity: root.openWorkspace ? 1.0 : (root.currentWorkspace?.toplevels?.values?.length ? 0.75 : 0.5)
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
            font.bold: root.openWorkspace !== null
            textFormat: Text.PlainText
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter

            visible: root.collapsible
            // Plain geometric arrows rather than a nerd font glyph: this one
            // sits next to text at text size, where the icon fonts sit high.
            text: menu.shown ? "▴" : "▾"
            color: menu.shown ? Theme.accent : Theme.foreground
            opacity: menu.shown ? 1.0 : 0.6
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize - 2
            textFormat: Text.PlainText
        }
    }

    MouseArea {
        anchors.fill: parent

        onClicked: {
            if (root.collapsible)
                menu.toggle();
            else if (root.currentWorkspace)
                root.currentWorkspace.activate();
        }
    }

    Flyout {
        id: menu

        target: root
        model: root.ordered

        delegate: MenuRow {
            required property var modelData

            readonly property int windows: modelData.toplevels.values.length

            width: parent.width
            // A dot on the one that is open. Nothing else in the menu is an
            // icon, so the column stays quiet.
            icon: root.matches(modelData, root.activeSpecial) ? "•" : " "
            label: root.label(modelData)
            detail: windows === 1 ? "1 window" : `${windows} windows`

            onClicked: modelData.activate()
            onCloseRequested: menu.shown = false
        }
    }
}
