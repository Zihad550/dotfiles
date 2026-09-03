import QtQuick
import qs

// Rows switch and connect a Profile (#142), including the pkexec/permission
// fallback, timeout, and browser-authentication handling (#143). Login,
// account management, peers, exit nodes, and Taildrop remain out of scope.
// Privilege and failure handling:
// docs/adr/0030-tailscale-privilege-and-failure-handling.md
QuickSettingsPage {
    id: root

    title: "Tailscale"

    onActiveChanged: {
        if (root.active) {
            TailscaleService.loadProfiles();
            TailscaleService.pageShown();
        } else {
            TailscaleService.pageHidden();
        }
    }

    // A monitor unplugged while its Page shows would otherwise leave the
    // count above zero forever, muting every later notification.
    Component.onDestruction: {
        if (root.active)
            TailscaleService.pageHidden();
    }

    Repeater {
        // Not gated on "ready": a failed refresh retains the last useful list
        // and shows its error Row alongside it.
        model: TailscaleService.profiles

        delegate: PageRow {
            required property var modelData

            width: root.width
            enabled: !TailscaleService.busy
            icon: modelData.current ? "✓" : "○"
            label: modelData.label
            // The current marker itself stays modelData.current, driven only
            // by the refreshed list -- never flipped optimistically here.
            detail: modelData.id === TailscaleService.switchingProfileId ? "Switching…"
                : (modelData.id === TailscaleService.failedOperationProfileId && TailscaleService.failedOperationState === "authentication-required") ? "This Profile needs authentication"
                : modelData.detail
            current: modelData.current

            onClicked: TailscaleService.switchProfile(modelData.id)
        }
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "" && TailscaleService.profilesLoading
        enabled: false
        icon: ""
        label: "Loading Tailscale profiles…"
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "empty"
        enabled: false
        icon: ""
        label: TailscaleService.profilesMessage
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "unsupported"
        enabled: false
        icon: ""
        label: TailscaleService.profilesMessage
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "daemon-failure"
        enabled: false
        icon: ""
        label: TailscaleService.profilesMessage
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "malformed"
        enabled: false
        icon: ""
        label: TailscaleService.profilesMessage
    }

    PageRow {
        width: root.width
        visible: TailscaleService.profilesState === "permission-cancelled" || TailscaleService.profilesState === "timeout"
        enabled: false
        icon: ""
        label: TailscaleService.profilesMessage
    }

    // Switch/connect/enable failures: "profiles" already has its own Row
    // above, so this only covers the other three operations, and never
    // duplicates a Profile Row's own "This Profile needs authentication".
    PageRow {
        width: root.width
        visible: TailscaleService.failedOperation !== "" && TailscaleService.failedOperation !== "profiles"
            && !(TailscaleService.failedOperationState === "authentication-required"
                && TailscaleService.failedOperationProfileId !== "")
        enabled: false
        icon: ""
        label: TailscaleService.failedOperationMessage
    }

    // Reruns only the operation that failed, and only when clicked -- see
    // TailscaleService.retryFailedOperation().
    PageRow {
        width: root.width
        visible: TailscaleService.failedOperation !== ""
        enabled: !TailscaleService.busy
        icon: "↻"
        label: "Retry"

        onClicked: TailscaleService.retryFailedOperation()
    }
}
