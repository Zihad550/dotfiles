import QtQuick
import Quickshell.Networking
import qs

// The Wi-Fi Page: NetworkItem's row expands into this, replacing Quick
// Settings' own rows in the same window -- see Page in CONTEXT.md.
//
// Order is fixed once, when the Page becomes visible, and held until it
// closes -- live signal jitter would otherwise swap rows under the pointer
// between aiming and clicking.
Column {
    id: root

    // Separate from Item.visible: QuickSettings hides this Page behind a
    // wrapper Item rather than toggling `visible` here directly, because a
    // Column stops updating implicitHeight while its own `visible` is false
    // -- and the popup's height reads that the instant this becomes active.
    property bool active: false

    signal back

    readonly property var device: Networking.devices.values.find(d => d.type === DeviceType.Wifi) ?? null
    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]

    // NetworkManager's cached results are already in `device.networks` by the
    // time this becomes visible, so the first sort has something to show
    // immediately; fresh scan results land here shortly after and append.
    readonly property var liveNetworks: root.device ? root.device.networks.values : []
    property var ordered: []

    function glyph(network) {
        const strength = network.signalStrength ?? 0;
        const index = Math.min(wifiIcons.length - 1, Math.floor(strength * wifiIcons.length));
        return wifiIcons[index];
    }

    function sorted(list) {
        return [...list].sort((a, b) => {
            if (a.connected !== b.connected)
                return a.connected ? -1 : 1;
            if (a.known !== b.known)
                return a.known ? -1 : 1;
            return b.signalStrength - a.signalStrength;
        });
    }

    onActiveChanged: {
        if (root.active)
            root.ordered = root.sorted(root.liveNetworks);
        else
            root.ordered = [];
    }

    // Survivors keep their spot rather than being re-sorted; drop-outs are
    // removed so a stale WifiNetwork is never held onto; new finds append at
    // the bottom. If `ordered` opened empty (cache not warm yet), the first
    // results still get the one sort instead of landing in scan order.
    onLiveNetworksChanged: {
        if (!root.active)
            return;
        if (root.ordered.length === 0) {
            root.ordered = root.sorted(root.liveNetworks);
            return;
        }
        const kept = root.ordered.filter(n => root.liveNetworks.includes(n));
        const additions = root.liveNetworks.filter(n => !kept.includes(n));
        if (kept.length !== root.ordered.length || additions.length > 0)
            root.ordered = kept.concat(additions);
    }

    // Only runs while this Page is on screen. QuickSettings resets
    // wifiPageShown on every dismiss path, which is what drives `active`.
    Binding {
        target: root.device
        property: "scannerEnabled"
        value: root.active
        when: root.device !== null
    }

    spacing: 2

    MenuRow {
        width: root.width
        // Plain arrow, not a nerd font glyph -- same reasoning as
        // SpecialWorkspaces' expand indicator.
        icon: "←"
        label: "Wi-Fi"
        onClicked: root.back()
    }

    Repeater {
        model: root.ordered

        delegate: MenuRow {
            required property var modelData

            width: root.width
            icon: root.glyph(modelData)
            label: modelData.name
            detail: {
                const pct = `${Math.round((modelData.signalStrength ?? 0) * 100)}%`;
                if (modelData.connected)
                    return `${pct} · Connected`;
                if (modelData.known)
                    return `${pct} · Saved`;
                return pct;
            }
        }
    }
}
