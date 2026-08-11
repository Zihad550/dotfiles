import QtQuick
import Quickshell.Networking
import qs

// The Wi-Fi Page: NetworkItem's row expands into this, replacing Quick
// Settings' own rows in the same window -- see Page in CONTEXT.md.
//
// Order is fixed once, when the Page becomes visible, and held until it
// closes -- live signal jitter would otherwise swap rows under the pointer
// between aiming and clicking.
//
// Ticket 04: clicking a row connects. Ticket 07: a secured network with no
// saved credentials asks for one first, in place, on the same row.
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

    // The network a connect/connectWithPsk is in flight for -- null when
    // nothing is attempting. Drives the "Connecting..." row and dims the rest
    // of the list rather than reading device/network `state` directly, so
    // only the row someone actually clicked reacts.
    property var connecting: null

    // The network whose last attempt failed, and why -- shown as this row's
    // detail until another attempt starts or the Page closes.
    property var failedNetwork: null
    property int failureReason: ConnectionFailReason.Unknown

    // The network with an open password field on its row. Distinct from
    // `failedNetwork`: a secrets failure sets both, to the same network, so
    // the field reopens already labelled with why.
    property var passwordTarget: null

    // Literal pre-shared-key types only. Excluded on purpose: Wpa2Eap,
    // WpaEap, Wpa3SuiteB192, DynamicWep, Leap are EAP-backed (ticket 09's
    // job); Open/Owe need no password; StaticWep's key isn't NM's `psk`
    // field, so connectWithPsk (see below) can't carry it either.
    readonly property var pskSecurityTypes: [WifiSecurityType.WpaPsk, WifiSecurityType.Wpa2Psk, WifiSecurityType.Sae]

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

    // Certain before the click, per ticket 07 -- known and security are both
    // already on the model, so there's no reason to attempt a connect that
    // is guaranteed to fail for want of a password.
    function needsPasswordPrompt(network) {
        return !network.known && root.pskSecurityTypes.includes(network.security);
    }

    function detailFor(network) {
        if (network === root.connecting)
            return "Connecting…";
        if (network === root.failedNetwork)
            return root.failureDetail(root.failureReason);
        const pct = `${Math.round((network.signalStrength ?? 0) * 100)}%`;
        if (network.connected)
            return `${pct} · Connected`;
        if (network.known)
            return `${pct} · Saved`;
        return pct;
    }

    // Ticket 04's reason table.
    function failureDetail(reason) {
        switch (reason) {
        case ConnectionFailReason.NoSecrets:
            return "Wrong password";
        case ConnectionFailReason.WifiAuthTimeout:
            return "Authentication timed out";
        case ConnectionFailReason.WifiNetworkLost:
            return "Network went away";
        default:
            return "Connection failed";
        }
    }

    function handleRowClick(network) {
        // In flight already -- ignore clicks on every row until it resolves,
        // rather than starting a second attempt on top of the first.
        if (root.connecting)
            return;
        if (root.needsPasswordPrompt(network)) {
            if (network !== root.failedNetwork)
                root.failedNetwork = null;
            root.passwordTarget = network;
            return;
        }
        root.attemptConnect(network);
    }

    function beginAttempt(network) {
        root.failedNetwork = null;
        root.passwordTarget = null;
        root.connecting = network;
    }

    function attemptConnect(network) {
        root.beginAttempt(network);
        network.connect();
    }

    // `psk` lives only in this call's argument list -- never assigned to a
    // property, never logged. The field that read it clears itself the
    // moment `passwordTarget` moves off its row.
    function attemptConnectWithPsk(network, psk) {
        root.beginAttempt(network);
        network.connectWithPsk(psk);
    }

    function clearAttempt() {
        root.connecting = null;
        root.failedNetwork = null;
        root.passwordTarget = null;
    }

    onActiveChanged: {
        if (root.active) {
            root.ordered = root.sorted(root.liveNetworks);
        } else {
            // Clears the password field (its visibility follows
            // `passwordTarget`) before the Repeater tears the delegates down
            // -- the other way round, `ordered = []` would destroy the field
            // out from under the clear.
            root.clearAttempt();
            root.ordered = [];
        }
    }

    // Survivors keep their spot rather than being re-sorted; drop-outs are
    // removed so a stale WifiNetwork is never held onto; new finds append at
    // the bottom. If `ordered` opened empty (cache not warm yet), the first
    // results still get the one sort instead of landing in scan order.
    //
    // `connecting`/`passwordTarget` are pinned regardless -- NetworkManager
    // prunes stale scan results mid-connect (see ticket 02's probe), and
    // this row's the one place that's happening.
    onLiveNetworksChanged: {
        if (!root.active)
            return;
        if (root.ordered.length === 0) {
            root.ordered = root.sorted(root.liveNetworks);
            return;
        }
        const pinned = [root.connecting, root.passwordTarget].filter(n => n !== null);
        const kept = root.ordered.filter(n => root.liveNetworks.includes(n) || pinned.includes(n));
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

    // Re-targets to whichever network `connecting` names. Reads `connecting`
    // into a local before touching it in either handler below -- the
    // property is this Connections' own `target`, so writing it first would
    // retarget out from under the read.
    Connections {
        target: root.connecting
        enabled: root.connecting !== null

        function onConnectionFailed(reason) {
            const network = root.connecting;
            root.connecting = null;
            root.failedNetwork = network;
            root.failureReason = reason;
            if (reason === ConnectionFailReason.NoSecrets)
                root.passwordTarget = network;
        }

        function onConnectedChanged() {
            const network = root.connecting;
            if (network && network.connected) {
                root.connecting = null;
                root.failedNetwork = null;
                root.back();
            }
        }
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

        delegate: Column {
            id: entry

            required property var modelData
            readonly property bool promptOpen: root.passwordTarget === entry.modelData

            width: root.width
            // Attempting or prompting is this row's own business; everything
            // else steps back so it reads clearly.
            opacity: root.connecting && root.connecting !== entry.modelData ? 0.4 : 1

            MenuRow {
                width: entry.width
                icon: root.glyph(entry.modelData)
                label: entry.modelData.name
                detail: root.detailFor(entry.modelData)

                onClicked: root.handleRowClick(entry.modelData)
            }

            Item {
                width: entry.width
                height: 24
                visible: entry.promptOpen

                Rectangle {
                    anchors.fill: parent
                    color: Theme.background
                    border.color: Theme.accent
                    border.width: 1
                    radius: 3
                    opacity: pwInput.activeFocus ? 1 : 0.4
                }

                TextInput {
                    id: pwInput

                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 6
                    verticalAlignment: TextInput.AlignVCenter
                    clip: true

                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize - 2
                    selectByMouse: true

                    // Dots only, no brief reveal of the last character typed
                    // -- ticket 07 criterion 2 says "never".
                    echoMode: TextInput.Password
                    passwordMaskDelay: 0

                    Keys.onEscapePressed: root.passwordTarget = null

                    onAccepted: root.attemptConnectWithPsk(entry.modelData, text)
                }
            }

            // Covers every path off this row's field: Escape and
            // attemptConnectWithPsk both go through `passwordTarget`, and the
            // Page-close reset in onActiveChanged does too.
            onPromptOpenChanged: {
                if (entry.promptOpen)
                    Qt.callLater(() => pwInput.forceActiveFocus());
                else
                    pwInput.clear();
            }
        }
    }
}
