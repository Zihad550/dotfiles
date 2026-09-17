import QtQuick
import Quickshell
import qs
import qs.media as Upstream
import qs.media.Commons
import qs.media.Ui as Ui

// Host contract for Omarchy's unmodified media widget.
Item {
    id: root
    property var service: null
    implicitWidth: widget.implicitWidth
    implicitHeight: widget.implicitHeight
    // Child visibility includes this parent's visibility, so bind to media state.
    visible: widget.hasMedia

    QtObject {
        id: host
        readonly property bool vertical: false
        readonly property string position: "top"
        readonly property int barSize: Theme.barHeight
        readonly property color barForeground: Color.bar.text
        readonly property color foreground: Color.bar.text
        readonly property string fontFamily: Style.font.family
        readonly property bool foregroundAnimationEnabled: true
        readonly property var shell: host
        property var activePopout: null
        readonly property bool shown: activePopout !== null

        function firstPartyServiceFor(id) { return root.service }
        function requestPopout(owner) {
            if (owner === tooltip) return;
            activePopout = owner;
            BarPanelCoordinator.claim(host);
        }
        function releasePopout(owner) {
            if (owner === tooltip) return;
            if (activePopout === owner) activePopout = null;
            BarPanelCoordinator.release(host);
        }
        function dismiss() {
            if (activePopout) activePopout.close();
        }
        function showTooltip(item, text) {
            tooltipLabel.text = text;
            tooltip.open = text !== "";
        }
        function hideTooltip(item) { tooltip.open = false }
    }

    Upstream.BarWidget {
        id: widget
        bar: host
    }

    Ui.PopupCard {
        id: tooltip
        anchorItem: widget
        bar: host
        triggerMode: "hover"
        contentWidth: tooltipLabel.implicitWidth + padding * 2
        contentHeight: fittedContentHeight(tooltipLabel.implicitHeight)
        Text {
            id: tooltipLabel
            color: Color.tooltip.text
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            textFormat: Text.PlainText
        }
    }

    Component.onDestruction: BarPanelCoordinator.release(host)
}
