import QtQuick
import Quickshell
import qs

// The top-right stack of live notifications.
//
// mako anchored top-right at a fixed width, and its height=110 was a
// per-notification slot rather than a window size. Here a single PanelWindow
// holds a Column of NotificationItem and hugs its content in both axes, which
// keeps the per-notification timeout bookkeeping local to the delegate and
// avoids one layer surface per notification.
Scope {
    id: root

    required property var notifications

    LazyLoader {
        // No window at all when nothing is on screen. An empty layer surface
        // parked in the top-right corner would swallow clicks meant for
        // whatever is underneath it.
        active: root.notifications.values.length > 0

        PanelWindow {
            // Screen is left unset so the compositor places this on the active
            // monitor, unlike Bar which is instantiated per screen.
            anchors.top: true
            anchors.right: true
            margins.top: Theme.edgeMargin
            margins.right: Theme.edgeMargin

            // 0 rather than -1: reserve no space of our own, but still respect
            // the bar's exclusive zone so the stack starts below the bar.
            exclusiveZone: 0

            implicitWidth: Theme.notificationWidth
            // Follows the stack: each item hugs its own text, so the window
            // shrinks to fit rather than reserving a fixed slot per
            // notification the way mako's height=110 did.
            implicitHeight: Math.max(1, column.implicitHeight)
            color: "transparent"

            Column {
                id: column

                width: parent.width
                spacing: Theme.edgeMargin

                Repeater {
                    // The ObjectModel itself, not a JS array built from its
                    // `values`. A Repeater cannot diff a plain array, so
                    // reassigning one tears down and rebuilds *every* delegate
                    // -- which would restart each notification's countdown from
                    // zero every time another notification arrived. An
                    // ObjectModel is a real item model, so Repeater inserts and
                    // removes incrementally and leaves existing delegates
                    // alone. Ordering is arrival order, oldest at top.
                    model: root.notifications

                    NotificationItem {
                        required property var modelData

                        notification: modelData
                        width: column.width
                    }
                }
            }
        }
    }
}
