import Quickshell
import Quickshell.Services.Notifications

// The freedesktop notification server, replacing mako.
//
// Instantiated from shell.qml rather than being a singleton: it owns the popup
// window's lifetime, and shell.qml's IpcHandler needs a handle on it to service
// the SUPER+COMMA bindings that used to call makoctl.
//
// Only one process can own org.freedesktop.Notifications, so mako must be
// stopped (`systemctl --user stop mako.service`) before this claims the name.
Scope {
    id: root

    // mako's `[mode=do-not-disturb] invisible=true`, toggled over IPC.
    property bool dnd: false

    NotificationServer {
        id: server

        // All three default to false, and mako supported all three. Without
        // these the capabilities silently regress: senders stop attaching
        // buttons, images and markup because we never advertised support.
        actionsSupported: true
        imageSupported: true
        bodyMarkupSupported: true

        // Defaults to true, which re-emits still-open notifications after a QML
        // reload with lastGeneration set. quickshell hot-reloads on every save,
        // so leaving it on resurrects whatever was on screen every time any
        // file in this shell is edited. Notifications are transient; drop them.
        keepOnReload: false

        // `tracked` defaults to false -- a notification not marked here is
        // discarded and never reaches trackedNotifications. This is the first
        // place to look when nothing appears.
        onNotification: notification => {
            notification.tracked = !root.suppressed(notification);
        }
    }

    // mako silenced everything under do-not-disturb except notify-send
    // (`[mode=do-not-disturb app-name=notify-send] invisible=false`) so the
    // toggle's own confirmation still appears and the toggle stays verifiable.
    // BatteryService also shells out to notify-send, so its low-battery warnings
    // come through DND as well -- mako behaved the same way.
    function suppressed(notification: var): bool {
        return root.dnd && notification.appName !== "notify-send";
    }

    // `qs -c dotfiles ipc call notifications toggleDnd`. Fires its own
    // confirmation, which is why the bypass above exists.
    function toggleDnd(): void {
        root.dnd = !root.dnd;
        Quickshell.execDetached(["notify-send", root.dnd ? "Silenced notifications" : "Enabled notifications"]);
    }

    // `makoctl dismiss`: the newest notification, which is the one on top.
    function dismissLast(): void {
        const values = server.trackedNotifications.values;
        if (values.length > 0)
            values[values.length - 1].dismiss();
    }

    // `makoctl dismiss --all`. dismiss() mutates trackedNotifications, so copy
    // into a plain array first rather than walking the live model. Copied by
    // index because `values` is a QML list, which is only array-*like*.
    function dismissAll(): void {
        const values = server.trackedNotifications.values;
        const pending = [];
        for (let i = 0; i < values.length; i++)
            pending.push(values[i]);
        for (let i = 0; i < pending.length; i++)
            pending[i].dismiss();
    }

    // The ObjectModel itself, so the Repeater inside can diff it. See the
    // comment on that Repeater for why `.values` would be wrong here.
    NotificationPopup {
        notifications: server.trackedNotifications
    }
}
