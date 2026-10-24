import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs
import "lib/displayArrange.js" as ArrangeModel

// see docs/display-arrange.md
PanelWindow {
    id: root

    readonly property string layoutScript: `${Quickshell.env("HOME")}/dotfiles/bin/df-hypr-display-layout`
    readonly property int canvasPadding: 24
    readonly property var layoutBounds: {
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        for (var i = 0; i < root.monitors.length; i++) {
            var monitor = root.monitors[i];
            minX = Math.min(minX, monitor.x);
            minY = Math.min(minY, monitor.y);
            maxX = Math.max(maxX, monitor.x + monitor.w);
            maxY = Math.max(maxY, monitor.y + monitor.h);
        }
        if (!isFinite(minX) || maxX <= minX || maxY <= minY)
            return { minX: 0, minY: 0, w: 1, h: 1 };
        return { minX: minX, minY: minY, w: maxX - minX, h: maxY - minY };
    }
    readonly property real fitScale: {
        if (!canvas || canvas.width <= 0 || canvas.height <= 0)
            return 1;
        var availableWidth = Math.max(1, canvas.width - 2 * root.canvasPadding);
        var availableHeight = Math.max(1, canvas.height - 2 * root.canvasPadding);
        return Math.min(availableWidth / root.layoutBounds.w,
            availableHeight / root.layoutBounds.h);
    }
    readonly property real layoutOriginX:
        canvas ? (canvas.width - root.layoutBounds.w * root.fitScale) / 2 : 0
    readonly property real layoutOriginY:
        canvas ? (canvas.height - root.layoutBounds.h * root.fitScale) / 2 : 0
    readonly property bool hasChanges: !root.sameLayout(root.monitors, root.applied)
    readonly property bool busy: applyProcess.running || finder.running
        || currentVariantProcess.running || saveProcess.running || root.saving
    readonly property bool canEdit: !root.busy && root.monitors.length >= 2
    readonly property bool canApply: root.canEdit && root.draggingName === ""
        && (root.hasChanges || root.needsSave)
    readonly property var targetScreen: {
        const focused = Hyprland.focusedMonitor;
        const name = root.openMonitor !== ""
            ? root.openMonitor : (focused ? focused.name : "");
        for (var i = 0; i < Quickshell.screens.length; i++) {
            if (Quickshell.screens[i].name === name)
                return Quickshell.screens[i];
        }
        return Quickshell.screens.length > 0 ? Quickshell.screens[0] : null;
    }
    readonly property var highlightRect: {
        if (!root.preview)
            return null;
        var anchor = root.monitorFor(root.monitors, root.preview.anchor);
        if (!anchor)
            return null;

        var x = root.pixelX(anchor.x);
        var y = root.pixelY(anchor.y);
        var w = root.pixelWidth(anchor.w);
        var h = root.pixelHeight(anchor.h);
        if (root.preview.edge === "left")
            return { x: x, y: y, w: 3, h: h };
        if (root.preview.edge === "right")
            return { x: x + w - 3, y: y, w: 3, h: h };
        if (root.preview.edge === "top")
            return { x: x, y: y, w: w, h: 3 };
        return { x: x, y: y + h - 3, w: w, h: 3 };
    }

    property var monitors: []
    property var applied: []
    property bool needsSave: false
    property bool keepApplied: false
    property bool saving: false
    property string status: ""
    property string openMonitor: ""
    property string draggingName: ""
    property string pendingVariant: ""
    property string pendingRefresh: ""
    property var preview: null

    visible: DisplayArrangeState.shown
    screen: root.targetScreen

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    exclusionMode: ExclusionMode.Ignore
    color: "transparent"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "display-arrange"
    WlrLayershell.keyboardFocus: root.visible
        ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

    onVisibleChanged: {
        if (root.visible)
            root.begin();
        else {
            root.preview = null;
            root.draggingName = "";
            root.openMonitor = "";
        }
    }

    function sameLayout(a: var, b: var): bool {
        if (a.length !== b.length)
            return false;
        for (var i = 0; i < a.length; i++) {
            var match = null;
            for (var j = 0; j < b.length; j++) {
                if (a[i].name === b[j].name)
                    match = b[j];
            }
            if (!match || Math.round(a[i].x) !== Math.round(match.x)
                || Math.round(a[i].y) !== Math.round(match.y)
                || a[i].w !== match.w || a[i].h !== match.h)
                return false;
        }
        return true;
    }

    function monitorFor(monitors: var, name: string): var {
        for (var i = 0; i < monitors.length; i++) {
            if (monitors[i].name === name)
                return monitors[i];
        }
        return null;
    }

    function pixelX(value: real): real {
        return root.layoutOriginX + (value - root.layoutBounds.minX) * root.fitScale;
    }

    function pixelY(value: real): real {
        return root.layoutOriginY + (value - root.layoutBounds.minY) * root.fitScale;
    }

    function pixelWidth(value: real): real {
        return Math.max(2, value * root.fitScale);
    }

    function pixelHeight(value: real): real {
        return Math.max(2, value * root.fitScale);
    }

    function layoutValue(pixel: real, origin: real, minimum: real): real {
        return Math.round((pixel - origin) / root.fitScale + minimum);
    }

    function layoutRect(monitorRect: var): var {
        return {
            x: root.layoutValue(monitorRect.x, root.layoutOriginX, root.layoutBounds.minX),
            y: root.layoutValue(monitorRect.y, root.layoutOriginY, root.layoutBounds.minY),
            w: monitorRect.modelData.w,
            h: monitorRect.modelData.h
        };
    }

    function begin(): void {
        const focused = Hyprland.focusedMonitor;
        root.openMonitor = focused ? focused.name : "";
        root.status = "";
        root.preview = null;
        root.draggingName = "";
        root.refresh();
        Qt.callLater(() => keyCatcher.forceActiveFocus());
    }

    function runFinder(): void {
        if (finder.running)
            return;
        finder.command = ["hyprctl", "monitors", "all", "-j"];
        finder.running = true;
    }

    function refresh(): void {
        root.keepApplied = false;
        root.needsSave = false;
        root.queueRefresh("refresh");
    }

    function refreshAfterApply(): void {
        root.queueRefresh("afterApply");
    }

    function queueRefresh(mode: string): void {
        if (mode === "afterApply")
            root.pendingRefresh = "afterApply";
        else if (root.pendingRefresh !== "afterApply")
            root.pendingRefresh = "refresh";
        root.flushRefresh();
    }

    function flushRefresh(): void {
        if (root.pendingRefresh === "")
            return;
        if (applyProcess.running || currentVariantProcess.running
            || saveProcess.running || finder.running)
            return;
        const mode = root.pendingRefresh;
        root.pendingRefresh = "";
        root.keepApplied = mode === "afterApply";
        root.runFinder();
    }

    function reset(): void {
        root.status = "";
        root.preview = null;
        root.draggingName = "";
        root.refresh();
    }

    function updatePreview(monitorRect: var): void {
        const monitor = monitorRect.modelData;
        const rect = root.layoutRect(monitorRect);
        const result = ArrangeModel.place(root.monitors, monitor.name, rect);
        const anchor = ArrangeModel.nearestAnchor(root.monitors, monitor.name, rect);
        if (!anchor) {
            root.preview = null;
            return;
        }

        const snapped = ArrangeModel.snapToEdge(anchor, rect);
        root.preview = {
            anchor: anchor.name,
            edge: snapped.edge,
            x: snapped.x,
            y: snapped.y,
            w: monitor.w,
            h: monitor.h,
            blocked: !result.ok
        };
    }

    function finishDrag(monitorRect: var, dragged: bool): void {
        const monitor = monitorRect.modelData;
        root.draggingName = "";
        root.preview = null;
        if (!dragged)
            return;

        const result = ArrangeModel.place(root.monitors, monitor.name,
            root.layoutRect(monitorRect));
        if (result.ok) {
            root.monitors = result.monitors;
            root.status = "";
            return;
        }

        monitorRect.x = root.pixelX(monitor.x);
        monitorRect.y = root.pixelY(monitor.y);
        root.status = result.blocker
            ? `Overlaps ${result.blocker.name}` : "Cannot place that display";
    }

    function applyLayout(): void {
        if (!root.canApply)
            return;
        const chunk = ArrangeModel.luaChunk(root.monitors);
        if (chunk === "") {
            root.status = "Cannot build a Hyprland layout";
            return;
        }

        root.status = "Applying…";
        applyProcess.command = ["hyprctl", "eval", chunk];
        applyProcess.running = true;
    }

    function saveLayout(): void {
        if (root.saving)
            return;
        root.saving = true;
        root.status = "Saving…";
        currentVariantProcess.command = [root.layoutScript, "current"];
        currentVariantProcess.running = true;
    }

    function actionAvailable(action: string): bool {
        switch (action) {
        case "apply":
            return root.canApply;
        case "reset":
            return !root.busy;
        default:
            return true;
        }
    }

    function runAction(action: string): void {
        if (action === "reset")
            root.reset();
        else if (action === "close")
            DisplayArrangeState.close();
        else if (action === "apply")
            root.applyLayout();
    }

    Process {
        id: finder

        stdout: StdioCollector { id: monitorsOutput }
        stderr: StdioCollector { id: monitorsError }

        onExited: exitCode => {
            if (exitCode !== 0) {
                root.monitors = [];
                root.applied = [];
                root.status = monitorsError.text.trim() || "Could not read displays";
                root.keepApplied = false;
                root.flushRefresh();
                return;
            }
            const parsed = ArrangeModel.parseMonitors(monitorsOutput.text);
            root.monitors = parsed;
            root.applied = parsed.map(ArrangeModel.cloneMonitor);
            if (!root.keepApplied)
                root.needsSave = false;
            root.keepApplied = false;
            root.flushRefresh();
        }
    }

    Process {
        id: applyProcess

        stdout: StdioCollector { id: applyOutput }
        stderr: StdioCollector { id: applyError }

        onExited: exitCode => {
            const output = applyOutput.text.trim();
            if (exitCode !== 0 || output !== "ok") {
                const message = applyError.text.trim() || output
                    || "hyprctl eval failed";
                root.status = message;
                console.warn(`display: arrange apply failed: ${message}`);
                root.flushRefresh();
                return;
            }
            root.applied = root.monitors.map(ArrangeModel.cloneMonitor);
            root.needsSave = true;
            root.saveLayout();
        }
    }

    Process {
        id: currentVariantProcess

        stdout: StdioCollector { id: currentVariantOutput }
        stderr: StdioCollector { id: currentVariantError }

        onExited: exitCode => {
            if (exitCode !== 0) {
                root.saving = false;
                const message = currentVariantError.text.trim()
                    || "Could not resolve the layout variant";
                root.status = `Could not save layout: ${message}`;
                console.warn(`display: arrange variant lookup failed: ${message}`);
                root.refreshAfterApply();
                return;
            }
            root.pendingVariant = currentVariantOutput.text.trim() || "arranged";
            saveProcess.command = [root.layoutScript, "save", root.pendingVariant];
            saveProcess.running = true;
        }
    }

    Process {
        id: saveProcess

        stdout: StdioCollector {}
        stderr: StdioCollector { id: saveError }

        onExited: exitCode => {
            root.saving = false;
            if (exitCode !== 0) {
                const message = saveError.text.trim() || "Could not save the layout";
                root.status = `Could not save layout: ${message}`;
                console.warn(`display: arrange save failed: ${message}`);
                root.refreshAfterApply();
                return;
            }
            root.needsSave = false;
            root.status = `Applied and saved as ${root.pendingVariant}`;
            root.refreshAfterApply();
        }
    }

    Rectangle {
        id: card

        anchors.centerIn: parent
        width: Math.min(920, root.width - 48)
        height: Math.min(620, root.height - 48)
        radius: 4
        color: Theme.background
        border.color: Theme.accent
        border.width: 1

        Column {
            id: content

            anchors.fill: parent
            anchors.margins: 20
            spacing: 10

            Text {
                id: titleText

                width: parent.width
                text: "Arrange displays"
                color: Theme.foreground
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize + 4
                font.bold: true
                textFormat: Text.PlainText
            }

            Text {
                id: hintText

                width: parent.width
                text: "Drag a display flush against another, then Apply to save the layout for login."
                color: Theme.foreground
                opacity: 0.7
                wrapMode: Text.Wrap
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize - 2
                textFormat: Text.PlainText
            }

            Item {
                id: canvas

                width: parent.width
                height: Math.max(140, content.height - titleText.height - hintText.height
                    - statusText.height - controls.height - 4 * content.spacing)
                clip: true

                Rectangle {
                    anchors.fill: parent
                    visible: root.monitors.length >= 2
                    color: "transparent"
                    border.color: Qt.rgba(Theme.foreground.r, Theme.foreground.g,
                        Theme.foreground.b, 0.18)
                    border.width: 1
                    radius: 2
                }

                Text {
                    anchors.centerIn: parent
                    width: parent.width - 40
                    visible: root.monitors.length < 2
                    text: finder.running ? "Loading displays…"
                        : "Connect a second display to arrange"
                    color: Theme.foreground
                    opacity: 0.65
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize
                    textFormat: Text.PlainText
                }

                Repeater {
                    model: root.monitors.length >= 2 ? root.monitors : []

                    Rectangle {
                        id: monitorRect

                        required property var modelData
                        readonly property bool moving: root.draggingName === monitorRect.modelData.name

                        x: root.pixelX(monitorRect.modelData.x)
                        y: root.pixelY(monitorRect.modelData.y)
                        width: root.pixelWidth(monitorRect.modelData.w)
                        height: root.pixelHeight(monitorRect.modelData.h)
                        z: monitorRect.moving ? 2 : 1
                        radius: 2
                        color: monitorRect.moving
                            ? Qt.rgba(Theme.accent.r, Theme.accent.g, Theme.accent.b, 0.3)
                            : Qt.rgba(Theme.foreground.r, Theme.foreground.g,
                                Theme.foreground.b, 0.08)
                        border.color: monitorRect.moving ? Theme.accent : Theme.foreground
                        border.width: monitorRect.moving ? 2 : 1

                        Text {
                            anchors.centerIn: parent
                            width: Math.max(0, parent.width - 8)
                            text: `${monitorRect.modelData.name}\n${monitorRect.modelData.w}×${monitorRect.modelData.h}`
                            color: Theme.foreground
                            horizontalAlignment: Text.AlignHCenter
                            wrapMode: Text.Wrap
                            font.family: Theme.fontFamily
                            font.pixelSize: Math.max(9, Theme.fontSize - 3)
                            textFormat: Text.PlainText
                        }

                        MouseArea {
                            id: dragArea

                            anchors.fill: parent
                            enabled: root.canEdit
                            hoverEnabled: true
                            cursorShape: root.canEdit
                                ? Qt.SizeAllCursor : Qt.ArrowCursor
                            drag.target: monitorRect
                            drag.axis: Drag.XAndYAxis
                            drag.minimumX: -monitorRect.width
                            drag.maximumX: canvas.width
                            drag.minimumY: -monitorRect.height
                            drag.maximumY: canvas.height

                            property bool dragged: false

                            onPressed: {
                                dragArea.dragged = false;
                                root.draggingName = monitorRect.modelData.name;
                                root.preview = null;
                            }
                            onPositionChanged: {
                                if (!dragArea.drag.active)
                                    return;
                                dragArea.dragged = true;
                                root.updatePreview(monitorRect);
                            }
                            onReleased: root.finishDrag(monitorRect, dragArea.dragged)
                            onCanceled: {
                                root.draggingName = "";
                                root.preview = null;
                                monitorRect.x = root.pixelX(monitorRect.modelData.x);
                                monitorRect.y = root.pixelY(monitorRect.modelData.y);
                            }
                        }
                    }
                }

                Rectangle {
                    id: ghost

                    visible: root.preview !== null && root.draggingName !== ""
                    x: root.preview ? root.pixelX(root.preview.x) : 0
                    y: root.preview ? root.pixelY(root.preview.y) : 0
                    width: root.preview ? root.pixelWidth(root.preview.w) : 0
                    height: root.preview ? root.pixelHeight(root.preview.h) : 0
                    z: 3
                    radius: 2
                    color: "transparent"
                    border.color: Theme.accent
                    border.width: 2
                    opacity: root.preview && root.preview.blocked ? 0.35 : 0.7
                }

                Rectangle {
                    id: anchorEdge

                    visible: root.draggingName !== "" && root.highlightRect !== null
                    x: root.highlightRect ? root.highlightRect.x : 0
                    y: root.highlightRect ? root.highlightRect.y : 0
                    width: root.highlightRect ? root.highlightRect.w : 0
                    height: root.highlightRect ? root.highlightRect.h : 0
                    z: 4
                    color: Theme.accent
                    radius: 1
                }
            }

            Text {
                id: statusText

                width: parent.width
                height: root.status !== "" ? implicitHeight : 0
                text: root.status
                color: root.status.indexOf("Overlaps") === 0
                    || root.status.indexOf("Cannot") === 0
                    || root.status.indexOf("Could not") === 0
                    ? Theme.error : Theme.foreground
                elide: Text.ElideRight
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize - 1
                textFormat: Text.PlainText
            }

            Item {
                id: controls

                width: parent.width
                height: 30

                Row {
                    anchors.right: parent.right
                    height: 30
                    spacing: 8

                    Repeater {
                        model: [
                            { label: "Reset", action: "reset" },
                            { label: "Close", action: "close" },
                            { label: "Apply", action: "apply" }
                        ]

                        Rectangle {
                            id: actionButton

                            required property var modelData
                            readonly property bool available: root.actionAvailable(actionButton.modelData.action)

                            width: actionLabel.implicitWidth + 24
                            height: 30
                            radius: 4
                            color: buttonHover.containsMouse && actionButton.available
                                ? Qt.rgba(Theme.foreground.r, Theme.foreground.g,
                                    Theme.foreground.b, 0.12) : "transparent"
                            border.color: Theme.accent
                            border.width: 1
                            opacity: actionButton.available ? 1 : 0.4

                            Text {
                                id: actionLabel

                                anchors.centerIn: parent
                                text: actionButton.modelData.label
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize
                                textFormat: Text.PlainText
                            }

                            MouseArea {
                                id: buttonHover

                                anchors.fill: parent
                                hoverEnabled: true
                                enabled: actionButton.available
                                cursorShape: actionButton.available
                                    ? Qt.PointingHandCursor : Qt.ArrowCursor
                                onClicked: root.runAction(actionButton.modelData.action)
                            }
                        }
                    }
                }
            }
        }

        FocusScope {
            id: keyCatcher

            anchors.fill: parent
            focus: root.visible

            Keys.onEscapePressed: DisplayArrangeState.close()
            Keys.onReturnPressed: root.applyLayout()
            Keys.onEnterPressed: root.applyLayout()
        }
    }
}
