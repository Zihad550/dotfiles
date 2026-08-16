import QtQuick
import Quickshell
import Quickshell.Networking
import qs

// The Wi-Fi Page: the Tile's chevron enters this, replacing the primary Quick
// Settings surface in the same window -- see Page in CONTEXT.md.
//
// Order is fixed once, when the Page becomes visible, and held until it
// closes -- live signal jitter would otherwise swap rows under the pointer
// between aiming and clicking.
//
// Ticket 04: clicking a row connects. Ticket 07: a secured network with no
// saved credentials asks for one first, in place, on the same row. Ticket 08:
// right-click or the trailing overflow opens Disconnect/Forget. Ticket 09:
// unsaved enterprise networks hand off to nmtui instead of attempting a
// connect that can't succeed.
QuickSettingsPage {
    id: root

    title: "Wi-Fi"

    // Ticket 09: the nmtui hand-off closes the whole panel, not just this
    // Page -- nmtui is a terminal window that would otherwise open behind it.
    // Distinct from `back`, which only returns to Quick Settings' own rows.
    signal closeRequested

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

    // Ticket 08: the network with an open right-click menu. A network is
    // never both this and `passwordTarget` -- Forget requires `known`, and a
    // password prompt requires `!known`, so the two states can't land on the
    // same network.
    property var contextMenuTarget: null

    // Literal pre-shared-key types only. Excluded on purpose: Wpa2Eap,
    // WpaEap, Wpa3SuiteB192, DynamicWep, Leap are EAP-backed (see
    // enterpriseSecurityTypes below); Open/Owe need no password; StaticWep's
    // key isn't NM's `psk` field, so connectWithPsk (see below) can't carry
    // it either.
    readonly property var pskSecurityTypes: [WifiSecurityType.WpaPsk, WifiSecurityType.Wpa2Psk, WifiSecurityType.Sae]

    // Ticket 09: the EAP-backed family excluded from pskSecurityTypes above.
    // connectWithPsk can't carry these -- an identity, certificates and a
    // profile have to exist first, which only nmtui can build.
    readonly property var enterpriseSecurityTypes: [WifiSecurityType.Wpa2Eap, WifiSecurityType.WpaEap, WifiSecurityType.Wpa3SuiteB192, WifiSecurityType.DynamicWep, WifiSecurityType.Leap]

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

    function isEnterprise(network) {
        return root.enterpriseSecurityTypes.includes(network.security);
    }

    // Ticket 09: the mark takes the slot a percentage would otherwise fill --
    // signal strength on an enterprise network is not the useful number here,
    // whether it's connected, saved, or neither.
    function detailFor(network) {
        if (network === root.connecting)
            return "Connecting…";
        if (network === root.failedNetwork)
            return root.failureDetail(network, root.failureReason);
        if (root.isEnterprise(network)) {
            if (network.connected)
                return "enterprise · Connected";
            if (network.known)
                return "enterprise · Saved";
            return "enterprise";
        }
        const pct = `${Math.round((network.signalStrength ?? 0) * 100)}%`;
        if (network.connected)
            return `${pct} · Connected`;
        if (network.known)
            return `${pct} · Saved`;
        return pct;
    }

    // Ticket 04's reason table. Ticket 09: NoSecrets on an enterprise
    // network is a rejected identity/certificate, not a wrong PSK -- the
    // generic wording would mislead about what to retry.
    function failureDetail(network, reason) {
        if (reason === ConnectionFailReason.NoSecrets && root.isEnterprise(network))
            return "Enterprise credentials rejected";
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
        // Left-click stays purely "connect" -- an open menu belongs to
        // whichever row was right-clicked, and a left-click elsewhere reads
        // as leaving it.
        root.contextMenuTarget = null;
        // Ticket 09: no profile exists yet and connectWithPsk can't build
        // one -- nmtui is the only thing that can enrol it. A saved
        // enterprise network skips this and falls through to the ordinary
        // connect below, same as any other known network.
        if (!network.known && root.isEnterprise(network)) {
            Quickshell.execDetached(["ghostty", "-e", "nmtui"]);
            root.closeRequested();
            return;
        }
        if (root.needsPasswordPrompt(network)) {
            if (network !== root.failedNetwork)
                root.failedNetwork = null;
            root.passwordTarget = network;
            return;
        }
        root.attemptConnect(network);
    }

    // Offers only what applies: Disconnect on the network you're on, Forget
    // on any saved one, both on a network that's both. Neither -- nothing
    // opens, per ticket 08.
    function handleRowRightClick(network) {
        if (root.connecting)
            return;
        // Mirrors handleRowClick clearing `contextMenuTarget`: a right-click
        // is its own row's business, so any password field left open on
        // another row closes rather than sitting open alongside this menu.
        root.passwordTarget = null;
        if (!network.connected && !network.known) {
            root.contextMenuTarget = null;
            return;
        }
        root.contextMenuTarget = root.contextMenuTarget === network ? null : network;
    }

    function disconnectNetwork(network) {
        root.contextMenuTarget = null;
        network.disconnect();
    }

    function forgetNetwork(network) {
        root.contextMenuTarget = null;
        network.forget();
    }

    function beginAttempt(network) {
        root.failedNetwork = null;
        root.passwordTarget = null;
        root.contextMenuTarget = null;
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
        root.contextMenuTarget = null;
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
    // `connecting`/`passwordTarget`/`contextMenuTarget` are pinned regardless
    // -- NetworkManager prunes stale scan results mid-connect (see ticket
    // 02's probe), and this row's the one place that's happening.
    onLiveNetworksChanged: {
        if (!root.active)
            return;
        if (root.ordered.length === 0) {
            root.ordered = root.sorted(root.liveNetworks);
            return;
        }
        const pinned = [root.connecting, root.passwordTarget, root.contextMenuTarget].filter(n => n !== null);
        const kept = root.ordered.filter(n => root.liveNetworks.includes(n) || pinned.includes(n));
        const additions = root.liveNetworks.filter(n => !kept.includes(n));
        if (kept.length !== root.ordered.length || additions.length > 0)
            root.ordered = kept.concat(additions);
    }

    // Only runs while this Page is on screen. QuickSettings resets its single
    // navigation state on every dismiss path, which is what drives `active`.
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
            // A saved enterprise network's secrets can't be retyped through
            // this field -- connectWithPsk only carries the PSK family (see
            // pskSecurityTypes above). Ticket 09: it stays on failureDetail
            // instead, rather than opening a field it can never satisfy.
            if (reason === ConnectionFailReason.NoSecrets && root.pskSecurityTypes.includes(network.security))
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

    Repeater {
        model: root.ordered

        delegate: Column {
            id: entry

            required property var modelData
            readonly property bool promptOpen: root.passwordTarget === entry.modelData
            readonly property bool menuOpen: root.contextMenuTarget === entry.modelData

            width: root.width
            // Attempting or prompting is this row's own business; everything
            // else steps back so it reads clearly.
            opacity: root.connecting && root.connecting !== entry.modelData ? 0.4 : 1

            Behavior on opacity {
                NumberAnimation {
                    duration: Theme.quickSettingsFastMotion
                    easing.type: Easing.OutCubic
                }
            }

            PageRow {
                width: entry.width
                icon: root.glyph(entry.modelData)
                label: entry.modelData.name
                detail: root.detailFor(entry.modelData)
                overflowVisible: entry.modelData.connected || entry.modelData.known

                onClicked: root.handleRowClick(entry.modelData)
                onRightClicked: root.handleRowRightClick(entry.modelData)
                onOverflowClicked: root.handleRowRightClick(entry.modelData)
            }

            // Ticket 08: right-click's Disconnect/Forget, indented under the
            // row they act on. `handleRowRightClick` already refuses to open
            // `menuOpen` for a network that's neither connected nor known, so
            // at least one of these two is visible whenever it's open.
            PageRow {
                x: 12
                width: entry.width - 12
                visible: entry.menuOpen && entry.modelData.connected
                label: "Disconnect"

                onClicked: root.disconnectNetwork(entry.modelData)
            }

            PageRow {
                x: 12
                width: entry.width - 12
                visible: entry.menuOpen && entry.modelData.known
                label: "Forget"

                onClicked: root.forgetNetwork(entry.modelData)
            }

            Item {
                width: entry.width
                height: Theme.quickSettingsRowHeight
                visible: entry.promptOpen

                Rectangle {
                    anchors.fill: parent
                    color: Qt.rgba(
                        Theme.foreground.r,
                        Theme.foreground.g,
                        Theme.foreground.b,
                        0.08
                    )
                    border.color: Theme.accent
                    border.width: pwInput.activeFocus ? 2 : 0
                    radius: 10
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
                    activeFocusOnTab: entry.promptOpen

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
