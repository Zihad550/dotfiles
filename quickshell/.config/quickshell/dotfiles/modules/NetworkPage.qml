import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Networking
import qs
import "lib/network.js" as Model

QuickSettingsPage {
    id: root

    title: "Network"

    signal closeRequested

    property var modelState: Model.emptyState()
    property string statusCommand: "df-network-status"
    property string wiredCommand: "df-network-wired"
    property string wifiCommand: "df-network-wifi"
    property string bandCommand: "df-network-band"
    property string dnsCommand: "df-network-dns"
    property string speedTestCommand: "df-network-speedtest"
    property int sampleTime: 0
    property var wiredProfiles: []
    property var wiredChoiceDevice: null
    property var wiredActionDevice: null
    property string wiredProfileUuid: ""
    property bool wiredProfileLoading: false
    property var wiredAction: ({
        action: "",
        iface: "",
        status: "idle",
        error: "",
        confirmed: false
    })

    readonly property bool networkManagerAvailable: Networking.backend === NetworkBackendType.NetworkManager
    readonly property var networkDevices: Networking.devices ? Networking.devices.values : []
    readonly property var wifiDevices: root.networkDevices
    readonly property var connectedWifiDevices: Model.activeWifiDevices(root.wifiDevices, DeviceType.Wifi)
    property string wifiTargetInterface: ""
    property string bandDefaultInterface: ""
    readonly property var wifiDevice: (root.pendingBandInterface
        ? root.wifiDevices.find(device =>
            root.wifiInterfaceForDevice(device) === root.pendingBandInterface) || null
        : null)
        || Model.selectWifiDevice(
            root.wifiDevices,
            root.wifiTargetInterface,
            root.routeInfo.kind === "wifi" ? root.routeInfo.iface : "",
            root.bandDefaultInterface,
            DeviceType.Wifi
        ) || root.wifiDevices.find(device => device.type === DeviceType.Wifi) || null
    readonly property var wifiTargetDevice: root.wifiDevice
    readonly property var wifiNetworkObjects: root.wifiDevice && root.wifiDevice.networks
        ? root.wifiDevice.networks.values : []
    property var wifiRows: []
    property var scannerDevice: null
    property bool wifiScanning: false
    property var wifiActionNetwork: null
    property var wifiAction: ({
        action: "",
        key: "",
        status: "idle",
        error: "",
        token: 0,
        confirmed: false
    })
    property int wifiActionToken: 0
    property var wifiCredentialTarget: null
    property string wifiIdentityText: ""
    property string wifiSecretText: ""
    property var wifiContextTarget: null
    property string bandCurrent: ""
    property string bandSelected: "auto"
    property var bandAvailable: []
    property string pendingBand: ""
    property string pendingBandInterface: ""
    property string bandFailure: ""
    property var bandDevices: []
    property var dnsProfile: ({
        available: false,
        iface: "",
        uuid: "",
        profile: "",
        provider: "Automatic",
        ipv4Dns: [],
        ipv6Dns: [],
        dns: []
    })
    property bool dnsStatusLoading: false
    property string dnsCustomText: ""
    property bool dnsCustomOpen: false
    property bool dnsProviderOpen: false
    property bool connectionInfoOpen: false
    property var dnsAction: ({
        target: "",
        custom: "",
        uuid: "",
        status: "idle",
        error: "",
        confirmed: false,
        requiredReconnection: false,
        token: 0,
        previous: null
    })
    property int dnsActionToken: 0
    property bool speedDependenciesAvailable: false
    property bool speedDependenciesLoading: false
    property string speedDependenciesInterface: ""
    property bool qrDependenciesAvailable: false
    property bool qrDependenciesLoading: false
    property bool speedTestOpen: false
    property bool speedTestRunning: false
    property bool speedTestExpectedStop: false
    property bool speedTestPhaseExpectedStop: false
    property bool speedTestPendingRun: false
    property int speedTestToken: 0
    property string speedTestPhase: ""
    property string speedTestInterface: ""
    property string speedTestLabel: ""
    property real speedTestDownload: 0
    property real speedTestUpload: 0
    property string speedTestError: ""

    readonly property bool wifiActionBusy: root.wifiAction.status === "pending"
    readonly property string wifiAvailability: Model.wifiState(
        root.wifiDevice,
        root.networkManagerAvailable,
        Networking.wifiEnabled,
        Networking.wifiHardwareEnabled,
        root.wifiScanning
    )
    readonly property var pskSecurityTypes: [
        WifiSecurityType.WpaPsk,
        WifiSecurityType.Wpa2Psk,
        WifiSecurityType.Sae
    ]
    readonly property var commonEnterpriseSecurityTypes: [
        WifiSecurityType.Wpa2Eap,
        WifiSecurityType.WpaEap
    ]
    readonly property var enterpriseSecurityTypes: [
        WifiSecurityType.Wpa3SuiteB192,
        WifiSecurityType.Wpa2Eap,
        WifiSecurityType.WpaEap,
        WifiSecurityType.DynamicWep,
        WifiSecurityType.Leap
    ]

    readonly property var wiredDevices: root.networkDevices.filter(
        device => device.type === DeviceType.Wired
    )
    readonly property var routeInfo: Model.routeAvailability(root.modelState)
    readonly property bool routeAvailable: root.routeInfo.available
    readonly property bool wiredActionBusy: root.wiredAction.status === "pending"
        || root.wiredProfileLoading
    readonly property bool bandActionBusy: root.pendingBand !== ""
    readonly property bool dnsActionBusy: root.dnsAction.status === "pending"
        || root.dnsAction.status === "reconnection-required"
    readonly property bool speedTestAvailable: root.routeAvailable
        && !!root.routeInfo.iface
        && root.speedDependenciesAvailable
        && root.speedDependenciesInterface === root.routeInfo.iface
    readonly property bool speedTestActionBusy: root.speedTestRunning
    readonly property bool qrShareAvailable: root.qrDependenciesAvailable
        && root.networkManagerAvailable
    readonly property bool bandControlsVisible: !!root.wifiDevice
        && root.networkManagerAvailable
        && (!!root.wifiDevice.connected || root.bandActionBusy)
        && (root.bandAvailable.length > 0 || root.bandSelected !== "auto" || root.bandActionBusy)
    readonly property string bandInterface: root.pendingBandInterface
        || root.wifiInterfaceForDevice(root.wifiDevice)
    readonly property var dnsProviders: ["Automatic", "Cloudflare", "Google", "Custom"]

    function wiredInterface(device): string {
        return device?.name || device?.interfaceName || "";
    }

    function wiredLabel(device): string {
        return device?.network?.name || device?.description || root.wiredInterface(device) || "Wired";
    }

    function wiredChoices(device): var {
        return Model.wiredProfileChoice(root.wiredProfiles, root.wiredInterface(device)).profiles;
    }

    function wiredBusyFor(device): bool {
        return root.wiredActionDevice === device && root.wiredActionBusy;
    }

    function wiredDetail(device): string {
        if (root.wiredActionDevice === device && root.wiredProfileLoading)
            return "Checking profiles…";
        if (root.wiredActionDevice === device && root.wiredAction.status === "pending")
            return root.wiredAction.action === "disconnect" ? "Disconnecting…" : "Connecting…";
        if (root.wiredActionDevice === device && root.wiredAction.status === "failed") {
            switch (root.wiredAction.error) {
            case "no-eligible-profile":
                return "No eligible profile";
            case "profile-query-failed":
                return "Profiles unavailable";
            case "confirmation-timeout":
                return "Connection not confirmed";
            default:
                return "Connection failed";
            }
        }
        if (root.routeAvailable && root.routeInfo.iface === root.wiredInterface(device))
            return "Default Route";
        return device?.connected ? "Connected" : "Disconnected";
    }

    function wifiInterfaceForDevice(device): string {
        return Model.wifiDeviceInterface(device);
    }

    function wifiInterface(): string {
        return root.wifiInterfaceForDevice(root.wifiDevice);
    }

    function selectWifiAdapter(device): void {
        const iface = root.wifiInterfaceForDevice(device);
        const connected = root.connectedWifiDevices.some(candidate =>
            root.wifiInterfaceForDevice(candidate) === iface);
        if (!iface || !connected || root.bandActionBusy)
            return;
        if (root.wifiTargetInterface === iface)
            return;
        root.wifiTargetInterface = iface;
        root.bandFailure = "";
        root.wifiRows = [];
        root.refreshBand();
        root.syncWifiRows();
    }

    function syncWifiTarget(): void {
        if (root.wifiTargetInterface
                && !root.connectedWifiDevices.some(device =>
                    root.wifiInterfaceForDevice(device) === root.wifiTargetInterface))
            root.wifiTargetInterface = "";
    }

    function wifiNetworkKey(network): string {
        return Model.wifiRowKey(network);
    }

    function wifiNetworkForRow(row): var {
        if (!row)
            return null;
        return root.wifiNetworkObjects.find(network => root.wifiNetworkKey(network) === row.key) ?? null;
    }

    function wifiIsEnterprise(row): bool {
        return !!row && root.enterpriseSecurityTypes.includes(row.security);
    }

    function wifiNeedsCredentials(row): bool {
        return !!row && root.pskSecurityTypes.includes(row.security);
    }

    function wifiRequiresCredentials(row): bool {
        return !!row && Model.wifiRequiresCredentials(
            row.security,
            WifiSecurityType.Open,
            WifiSecurityType.Owe
        );
    }

    function wifiSupportsInPageAuth(row): bool {
        return root.wifiNeedsCredentials(row) || (
            root.wifiIsEnterprise(row) && root.commonEnterpriseSecurityTypes.includes(row.security)
        );
    }

    function wifiIcon(row): string {
        return Model.wifiIconFor(row?.signal ?? 0);
    }

    function wifiStatusLabel(): string {
        switch (root.wifiAvailability) {
        case "software-disabled":
            return "Wi-Fi is off";
        case "hardware-blocked":
            return "Wi-Fi hardware blocked";
        case "unavailable":
            return "Wi-Fi unavailable";
        case "scanning":
            return "Scanning for networks…";
        case "connected":
            return "Wi-Fi networks";
        default:
            return "Available Wi-Fi networks";
        }
    }

    function setWifiScannerEnabled(enabled: bool): void {
        const canScan = enabled && root.active && root.networkManagerAvailable
            && root.wifiDevice !== null && Networking.wifiEnabled
            && Networking.wifiHardwareEnabled;
        const nextDevice = canScan ? root.wifiDevice : null;
        if (root.scannerDevice && root.scannerDevice !== nextDevice)
            root.scannerDevice.scannerEnabled = false;
        root.scannerDevice = nextDevice;
        if (root.scannerDevice)
            root.scannerDevice.scannerEnabled = enabled;
    }

    function syncWifiRows(): void {
        root.syncWifiTarget();
        root.wifiRows = Model.projectWifiRows(root.wifiNetworkObjects, root.wifiRows);
        if (root.wifiActionBusy) {
            const actionRow = root.wifiRows.find(row => row.key === root.wifiAction.key);
            const currentNetwork = actionRow ? root.wifiNetworkForRow(actionRow) : null;
            if (currentNetwork)
                root.wifiActionNetwork = currentNetwork;
        }
        if (root.wifiCredentialTarget
                && !root.wifiRows.some(row => row.key === root.wifiCredentialTarget.key))
            root.cancelWifiCredentials();
        if (root.wifiContextTarget
                && !root.wifiRows.some(row => row.key === root.wifiContextTarget.key))
            root.wifiContextTarget = null;
        root.checkWifiAction();
    }

    function beginWifiAction(action, row): int {
        const network = root.wifiNetworkForRow(row);
        if (!network || root.wifiActionBusy)
            return 0;
        root.wifiActionToken += 1;
        root.wifiActionNetwork = network;
        root.wifiContextTarget = null;
        root.wifiCredentialTarget = null;
        root.clearWifiCredentials();
        root.wifiAction = Model.wifiActionState(
            { key: row.key }, action, "pending", root.wifiActionToken
        );
        return root.wifiActionToken;
    }

    function finishWifiAction(phase, error, token): void {
        if (token !== undefined && token !== root.wifiAction.token)
            return;
        if (root.wifiAction.status !== "pending")
            return;
        root.wifiAction = Model.wifiActionState(
            root.wifiAction,
            root.wifiAction.action,
            phase,
            root.wifiAction.token,
            error
        );
        wifiActionTimeout.stop();
        root.wifiActionNetwork = null;
        if (phase !== "pending") {
            root.wifiCredentialTarget = null;
            root.clearWifiCredentials();
            wifiCredentialProcess.secret = "";
        }
    }

    function clearWifiCredentials(): void {
        root.wifiIdentityText = "";
        root.wifiSecretText = "";
    }

    function cancelWifiAction(): void {
        if (root.wifiAction.status === "pending") {
            root.wifiActionToken += 1;
            root.finishWifiAction("cancelled", "cancelled", root.wifiAction.token);
        }
        if (wifiCredentialProcess.running)
            wifiCredentialProcess.running = false;
        root.wifiActionNetwork = null;
        root.wifiContextTarget = null;
        root.wifiCredentialTarget = null;
        root.clearWifiCredentials();
        wifiCredentialProcess.secret = "";
    }

    function checkWifiAction(): void {
        if (!root.wifiActionBusy)
            return;
        const row = root.wifiRows.find(candidate => candidate.key === root.wifiAction.key);
        // Forget can remove the row from the scan model before its QObject
        // emits the final state. Keep the action's live target as the
        // confirmation source in that interval, without retaining it in the
        // rendered model.
        const network = (row ? root.wifiNetworkForRow(row) : null)
            || root.wifiActionNetwork;
        if (!network)
            return;
        if (root.wifiAction.action === "connect" && network.connected)
            root.finishWifiAction("confirmed", "", root.wifiAction.token);
        else if (root.wifiAction.action === "disconnect" && !network.connected && !network.stateChanging)
            root.finishWifiAction("confirmed", "", root.wifiAction.token);
        else if (root.wifiAction.action === "forget" && !network.known && !network.stateChanging)
            root.finishWifiAction("confirmed", "", root.wifiAction.token);
    }

    function startWifiNativeAction(action, row): void {
        if (root.wifiActionBusy || !row)
            return;
        const network = root.wifiNetworkForRow(row);
        const token = root.beginWifiAction(action, row);
        if (!token)
            return;
        if (action === "connect")
            network.connect();
        else if (action === "disconnect")
            network.disconnect();
        else if (action === "forget")
            network.forget();
        if (root.wifiAction.status === "pending")
            wifiActionTimeout.restart();
    }

    function showWifiCredentials(row): void {
        if (root.wifiActionBusy || !row)
            return;
        if (!root.wifiCredentialTarget || root.wifiCredentialTarget.key !== row.key)
            root.clearWifiCredentials();
        root.wifiContextTarget = null;
        root.wifiCredentialTarget = row;
    }

    function cancelWifiCredentials(): void {
        root.wifiCredentialTarget = null;
        root.clearWifiCredentials();
    }

    function submitWifiCredentials(row): void {
        if (root.wifiActionBusy
                || !root.wifiCredentialTarget
                || root.wifiCredentialTarget.key !== row.key
                || !root.wifiSecretText)
            return;
        if (root.wifiIsEnterprise(row) && !root.wifiIdentityText)
            return;
        const identity = root.wifiIdentityText;
        const secret = root.wifiSecretText;
        const token = root.beginWifiAction("connect", row);
        if (!token)
            return;
        wifiCredentialProcess.token = token;
        wifiCredentialProcess.secret = secret;
        root.clearWifiCredentials();
        const command = root.wifiIsEnterprise(row) ? "connect-enterprise" : "connect-psk";
        wifiCredentialProcess.command = root.wifiIsEnterprise(row)
            ? [root.wifiCommand, command, root.wifiInterface(), row.ssid, identity]
            : [root.wifiCommand, command, root.wifiInterface(), row.ssid];
        root.wifiCredentialTarget = null;
        wifiCredentialProcess.running = true;
        wifiActionTimeout.restart();
    }

    function clickWifiRow(row, keyboard): void {
        if (root.wifiActionBusy || !row)
            return;
        if (row.connected) {
            root.startWifiNativeAction("disconnect", row);
            return;
        }
        if (root.wifiIsEnterprise(row) && !root.commonEnterpriseSecurityTypes.includes(row.security)) {
            root.cancelWifiCredentials();
            Quickshell.execDetached(["ghostty", "-e", "nmtui"]);
            root.closeRequested();
            return;
        }
        if (!row.known && root.wifiRequiresCredentials(row)
                && !root.wifiSupportsInPageAuth(row)) {
            root.cancelWifiCredentials();
            Quickshell.execDetached(["ghostty", "-e", "nmtui"]);
            root.closeRequested();
            return;
        }
        if (!row.known && root.wifiSupportsInPageAuth(row)) {
            root.showWifiCredentials(row);
            return;
        }
        root.startWifiNativeAction("connect", row);
    }

    function openWifiActions(row): void {
        if (root.wifiActionBusy || !row || (!row.connected && !row.known))
            return;
        root.wifiCredentialTarget = null;
        root.clearWifiCredentials();
        root.wifiContextTarget = root.wifiContextTarget && root.wifiContextTarget.key === row.key
            ? null : row;
    }

    function shareWifi(row): void {
        if (!root.qrShareAvailable || !row || !row.connected
                || root.wifiActionBusy || root.bandActionBusy)
            return;
        const iface = root.wifiInterface();
        if (!iface)
            return;
        root.wifiContextTarget = null;
        root.wifiCredentialTarget = null;
        root.clearWifiCredentials();
        wifiShareOverlay.open(iface);
    }

    function wifiDetail(row): string {
        if (root.wifiAction.key === row.key) {
            if (root.wifiAction.status === "pending") {
                if (root.wifiAction.action === "disconnect") return "Disconnecting…";
                if (root.wifiAction.action === "forget") return "Forgetting…";
                return "Connecting…";
            }
            if (root.wifiAction.status === "failed")
                return Model.wifiFailureLabel(root.wifiAction.error);
            if (root.wifiAction.status === "cancelled")
                return "Cancelled";
        }
        if (row.hidden)
            return row.connected ? "Connected" : (row.known ? "Saved" : "Hidden");
        if (root.wifiIsEnterprise(row)) {
            if (row.connected) return "Enterprise · Connected";
            if (row.known) return "Enterprise · Saved";
            return "Enterprise";
        }
        const signal = `${row.signal}%`;
        if (row.connected) return `${signal} · Connected`;
        if (row.known) return `${signal} · Saved`;
        return signal;
    }

    function bandProcessCommand(): var {
        const iface = root.pendingBandInterface || root.wifiTargetInterface;
        return iface
            ? [root.bandCommand, "--interface", iface]
            : [root.bandCommand];
    }

    function refreshBand(): void {
        if (!root.active || !root.networkManagerAvailable || bandStatusProcess.running)
            return;
        bandStatusProcess.command = root.bandProcessCommand();
        bandStatusProcess.running = true;
    }

    function acceptBandStatus(raw: string, exitCode: int): void {
        if (exitCode !== 0)
            return;
        const status = Model.parseBandStatus(raw);
        if ((root.bandActionBusy || root.bandFailure) && status.available.length === 0)
            return;
        if (status.device)
            root.bandDefaultInterface = status.device;
        root.bandDevices = status.devices;
        root.bandCurrent = status.band;
        root.bandSelected = status.selected;
        root.bandAvailable = status.available;
    }

    function bandDetail(): string {
        if (root.bandActionBusy)
            return `Switching from ${Model.bandLabel(root.bandSelected) || "Automatic"} to ${Model.bandLabel(root.pendingBand) || "Automatic"}…`;
        if (root.bandFailure)
            return Model.bandFailureLabel(root.bandFailure);
        if (root.bandSelected !== "auto")
            return Model.bandLabel(root.bandSelected);
        return root.bandCurrent ? `Automatic · ${Model.bandLabel(root.bandCurrent)}` : "Automatic";
    }

    function dnsStatusCommand(): var {
        return root.routeAvailable && root.routeInfo.iface
            ? [root.dnsCommand, "status", root.routeInfo.iface]
            : [];
    }

    function dnsDetail(): string {
        if (root.dnsStatusLoading)
            return "Checking NetworkManager…";
        if (root.dnsActionBusy) {
            if (root.dnsAction.status === "reconnection-required")
                return `Reconnecting for ${root.dnsAction.target}…`;
            return `Applying ${root.dnsAction.target}…`;
        }
        if (root.dnsAction.status === "confirmed")
            return `${root.dnsProfile.provider} · Confirmed`;
        if (root.dnsAction.status === "failed" || root.dnsAction.status === "cancelled")
            return Model.dnsFailureLabel(root.dnsAction.error);
        return root.dnsProfile.available ? root.dnsProfile.provider : "Unavailable";
    }

    function finishDnsAction(phase, error, token): void {
        if (token !== undefined && token !== root.dnsAction.token)
            return;
        if (!root.dnsActionBusy && phase !== "cancelled")
            return;
        root.dnsAction = Model.dnsActionState(
            root.dnsAction,
            root.dnsAction.target,
            phase,
            error,
            root.dnsAction.token
        );
        dnsConfirmationTimeout.stop();
        root.dnsProviderOpen = false;
        root.dnsCustomOpen = false;
        if (phase !== "reconnection-required" && phase !== "pending")
            root.dnsCustomText = "";
    }

    function acceptDnsStatus(raw: string, exitCode: int): void {
        const status = Model.parseDnsStatus(raw, exitCode);
        root.dnsStatusLoading = false;
        if (!status.available) {
            if (!root.dnsActionBusy)
                root.dnsProfile = status;
            return;
        }

        if (root.dnsActionBusy) {
            if (Model.dnsStatusMatches(
                    status,
                    root.dnsAction.target,
                    root.dnsAction.uuid,
                    root.dnsAction.custom)) {
                root.dnsProfile = status;
                root.finishDnsAction("confirmed", "", root.dnsAction.token);
            }
            return;
        }
        root.dnsProfile = status;
    }

    function refreshDns(): void {
        if (!root.active || !root.networkManagerAvailable || !root.routeAvailable || !root.routeInfo.iface
                || dnsStatusProcess.running)
            return;
        const needsInitialStatus = !root.dnsProfile.available
            || root.dnsProfile.iface !== root.routeInfo.iface;
        if (needsInitialStatus)
            root.dnsStatusLoading = true;
        dnsStatusProcess.command = root.dnsStatusCommand();
        dnsStatusProcess.running = true;
    }

    function startDnsAction(provider, custom): void {
        if (root.dnsActionBusy || !root.routeAvailable || !root.dnsProfile.available
                || !root.dnsProfile.uuid)
            return;
        const selected = provider === "DHCP" ? "Automatic" : provider;
        const customResult = selected === "Custom" ? Model.validateDnsServers(custom) : null;
        if (selected === "Custom" && !customResult.valid) {
            root.dnsActionToken += 1;
            root.dnsAction = Model.dnsActionState(
                { uuid: root.dnsProfile.uuid },
                selected,
                "failed",
                "custom-validation-failed",
                root.dnsActionToken
            );
            return;
        }

        root.dnsActionToken += 1;
        root.dnsAction = Model.dnsActionState({
            uuid: root.dnsProfile.uuid,
            custom: selected === "Custom" ? customResult.servers.join(" ") : "",
            previous: root.dnsProfile
        }, selected, "pending", "", root.dnsActionToken);
        dnsActionProcess.token = root.dnsActionToken;
        dnsActionProcess.custom = selected === "Custom" ? customResult.servers.join(" ") : "";
        dnsActionProcess.command = [
            root.dnsCommand,
            "apply",
            root.routeInfo.iface,
            selected,
            root.dnsProfile.uuid
        ];
        dnsActionProcess.running = true;
    }

    function setDnsProvider(provider): void {
        if (!provider || root.dnsActionBusy || !root.routeAvailable || !root.dnsProfile.available)
            return;
        root.dnsProviderOpen = false;
        if (provider === "Custom") {
            root.dnsCustomOpen = true;
            return;
        }
        root.dnsCustomOpen = false;
        root.startDnsAction(provider, "");
    }

    function submitCustomDns(): void {
        const result = Model.validateDnsServers(root.dnsCustomText);
        if (!result.valid) {
            root.dnsActionToken += 1;
            root.dnsAction = Model.dnsActionState(
                { uuid: root.dnsProfile.uuid },
                "Custom",
                "failed",
                result.error,
                root.dnsActionToken
            );
            return;
        }
        root.startDnsAction("Custom", result.servers.join(" "));
    }

    function cancelDnsAction(): void {
        if (dnsActionProcess.running)
            dnsActionProcess.running = false;
        root.dnsActionToken += 1;
        if (root.dnsActionBusy)
            root.dnsAction = Model.dnsActionState(
                root.dnsAction,
                root.dnsAction.target,
                "cancelled",
                "cancelled",
                root.dnsActionToken
            );
        dnsConfirmationTimeout.stop();
        root.dnsProviderOpen = false;
        root.dnsCustomOpen = false;
        root.dnsCustomText = "";
    }

    function setBand(band): void {
        if (!root.networkManagerAvailable || !band || root.bandActionBusy || !root.bandInterface
                || (!root.bandAvailable.includes(band) && band !== "auto"))
            return;
        root.bandFailure = "";
        root.pendingBandInterface = root.bandInterface;
        root.pendingBand = band;
        bandActionProcess.command = [
            root.bandCommand,
            "--interface",
            root.bandInterface,
            band
        ];
        bandActionProcess.running = true;
    }

    function cancelBandAction(): void {
        if (root.bandActionBusy)
            return;
        root.pendingBand = "";
    }

    function beginWiredAction(action, device, profile): void {
        const iface = root.wiredInterface(device);
        if (!iface || !device || root.wiredActionBusy)
            return;
        root.wiredChoiceDevice = null;
        root.wiredActionDevice = device;
        root.wiredProfileUuid = profile?.uuid || "";
        root.wiredAction = Model.wiredActionState({ iface: iface }, action, "pending");
        wiredActionProcess.running = true;
    }

    function toggleWired(device): void {
        if (!root.networkManagerAvailable || !device || root.wiredActionBusy)
            return;
        if (device.connected) {
            root.beginWiredAction("disconnect", device, null);
            return;
        }
        root.wiredActionDevice = device;
        root.wiredAction = {
            action: "reconnect",
            iface: root.wiredInterface(device),
            status: "idle",
            error: "",
            confirmed: false
        };
        root.wiredProfileUuid = "";
        root.wiredChoiceDevice = device;
        root.wiredProfiles = [];
        root.wiredProfileLoading = true;
        wiredProfilesProcess.running = true;
    }

    function chooseWiredProfile(profile): void {
        if (!root.wiredChoiceDevice || !profile || root.wiredActionBusy)
            return;
        root.beginWiredAction("reconnect", root.wiredChoiceDevice, profile);
    }

    function finishWiredAction(phase, error): void {
        root.wiredAction = Model.wiredActionState(
            root.wiredAction,
            root.wiredAction.action,
            phase,
            undefined,
            error
        );
        confirmationTimer.stop();
        confirmationTimeout.stop();
        root.wiredProfileUuid = "";
    }

    function cancelWiredAction(): void {
        if (wiredActionProcess.running)
            wiredActionProcess.running = false;
        if (wiredProfilesProcess.running)
            wiredProfilesProcess.running = false;
        root.wiredProfileLoading = false;
        root.wiredChoiceDevice = null;
        if (root.wiredAction.status === "pending")
            root.finishWiredAction("cancelled", "cancelled");
    }

    function refreshSpeedDependencies(): void {
        if (!root.active || !root.routeAvailable || !root.routeInfo.iface) {
            root.speedDependenciesAvailable = false;
            root.speedDependenciesInterface = "";
            return;
        }
        if (root.speedDependenciesInterface === root.routeInfo.iface
                && !root.speedDependenciesLoading)
            return;
        if (speedDependencyProcess.running)
            return;
        root.speedDependenciesLoading = true;
        root.speedDependenciesInterface = root.routeInfo.iface;
        speedDependencyProcess.command = [
            root.speedTestCommand,
            "--check",
            "--interface",
            root.routeInfo.iface
        ];
        speedDependencyProcess.running = true;
    }

    function refreshQrDependencies(): void {
        if (!root.active || qrDependencyProcess.running)
            return;
        root.qrDependenciesLoading = true;
        qrDependencyProcess.running = true;
    }

    function speedTestDetail(): string {
        if (root.speedTestRunning)
            return root.speedTestPhase === "up" ? "Testing upload…" : "Testing download…";
        if (root.speedDependenciesLoading)
            return "Checking dependencies…";
        if (!root.speedDependenciesAvailable)
            return "Unavailable";
        return root.routeInfo.iface;
    }

    function updateSpeedTestLine(line, token): void {
        if (token !== undefined && token !== root.speedTestToken)
            return;
        const sample = Model.parseSpeedProgress(line, root.speedTestPhase);
        if (!sample || sample.phase !== root.speedTestPhase)
            return;
        if (sample.phase === "down")
            root.speedTestDownload = sample.mbps;
        else
            root.speedTestUpload = sample.mbps;
    }

    function startSpeedPhase(phase): void {
        if (!root.speedTestRunning || !root.speedTestOpen || !root.speedTestInterface)
            return;
        root.speedTestPhase = phase;
        root.speedTestPhaseExpectedStop = false;
        root.speedTestError = "";
        speedTestProcess.token = root.speedTestToken;
        speedTestProcess.phase = phase;
        speedTestProcess.command = [root.speedTestCommand, "--interface", root.speedTestInterface, phase];
        speedTestProcess.running = true;
        speedTestPhaseTimer.restart();
    }

    function runSpeedTest(): void {
        if (!root.speedTestAvailable || !root.routeInfo.iface)
            return;
        if (speedTestProcess.running) {
            root.speedTestPendingRun = true;
            root.speedTestExpectedStop = true;
            speedTestProcess.running = false;
            return;
        }
        root.speedTestToken += 1;
        root.speedTestExpectedStop = false;
        root.speedTestPhaseExpectedStop = false;
        root.speedTestPendingRun = false;
        root.speedTestOpen = true;
        root.speedTestRunning = true;
        root.speedTestPhase = "down";
        root.speedTestInterface = root.routeInfo.iface;
        root.speedTestLabel = root.statusLabel();
        root.speedTestDownload = 0;
        root.speedTestUpload = 0;
        root.speedTestError = "";
        speedTestTimeoutTimer.restart();
        root.startSpeedPhase("down");
    }

    function closeSpeedTest(reason, closeOverlay): void {
        const message = reason || "cancelled";
        root.speedTestToken += 1;
        root.speedTestExpectedStop = true;
        root.speedTestPhaseExpectedStop = false;
        root.speedTestPendingRun = false;
        root.speedTestRunning = false;
        root.speedTestPhase = "";
        speedTestPhaseTimer.stop();
        speedTestTimeoutTimer.stop();
        if (speedTestProcess.running)
            speedTestProcess.running = false;
        if (speedDependencyProcess.running)
            speedDependencyProcess.running = false;
        root.speedTestError = Model.speedTestFailureLabel(message);
        if (closeOverlay)
            root.speedTestOpen = false;
    }

    function checkSpeedTestRoute(): void {
        if ((!root.speedTestRunning && !speedTestProcess.running)
                || !root.speedTestInterface)
            return;
        if (!root.routeAvailable || root.routeInfo.iface !== root.speedTestInterface)
            root.closeSpeedTest(
                root.routeAvailable ? "route-changed" : "route-lost",
                false
            );
    }

    function checkWiredConfirmation(): void {
        const device = root.wiredActionDevice;
        if (!device || root.wiredAction.status !== "pending")
            return;
        const connected = !!device.connected;
        if ((root.wiredAction.action === "disconnect" && !connected)
                || (root.wiredAction.action !== "disconnect" && connected))
            root.finishWiredAction("confirmed", "");
    }

    function refresh(): void {
        if (!root.active || statusProcess.running)
            return;
        statusProcess.running = true;
    }

    function acceptStatus(raw: string, exitCode: int): void {
        const now = Date.now();
        root.sampleTime = now;
        if (!root.networkManagerAvailable) {
            root.modelState = Model.emptyState({
                status: "unavailable",
                reason: "networkmanager-unavailable",
                failure: "networkmanager-unavailable"
            });
            return;
        }
        root.modelState = Model.stateWithSamples(root.modelState, raw, now, exitCode);
        root.checkSpeedTestRoute();
    }

    function setModelState(next): void {
        root.modelState = Model.normalizeState(next);
    }

    function statusLabel(): string {
        if (!root.networkManagerAvailable)
            return "NetworkManager unavailable";
        switch (root.modelState.status) {
        case "connected":
            return root.modelState.label || root.modelState.iface;
        case "disconnected":
            return "Disconnected";
        case "busy":
            return root.modelState.label || "Connecting…";
        default:
            return "Network unavailable";
        }
    }

    function statusDetail(): string {
        if (!root.networkManagerAvailable)
            return "Install and start NetworkManager to manage connections";
        if (root.modelState.status === "connected") {
            const transport = root.modelState.kind === "wifi" ? "Wi-Fi" : "Wired";
            return `${transport} · ${root.modelState.iface}`;
        }
        if (root.modelState.status === "unavailable")
            return Model.failureLabel(root.modelState.failure || root.modelState.reason);
        return root.modelState.reason === "no-route" ? "No Default Route" : "";
    }

    function valueOrPlaceholder(value): string {
        return value === undefined || value === null || value === "" ? "--" : String(value);
    }

    onActiveChanged: {
        if (root.active) {
            root.refresh();
            root.refreshBand();
            root.refreshDns();
            root.refreshSpeedDependencies();
            root.refreshQrDependencies();
            refreshTimer.restart();
            root.syncWifiRows();
            wifiScanStart.restart();
        } else {
            refreshTimer.stop();
            statusProcess.running = false;
            bandStatusProcess.running = false;
            dnsStatusProcess.running = false;
            qrDependencyProcess.running = false;
            root.qrDependenciesLoading = false;
            root.qrDependenciesAvailable = false;
            root.closeSpeedTest("cancelled", true);
            wifiScanStart.stop();
            wifiScanSettle.stop();
            wifiScanTimer.stop();
            root.wifiScanning = false;
            root.setWifiScannerEnabled(false);
            root.wifiRows = [];
            root.cancelWifiAction();
            root.cancelWiredAction();
            root.cancelDnsAction();
            root.dnsProviderOpen = false;
            root.connectionInfoOpen = false;
            wifiShareOverlay.close();
        }
    }

    onNetworkManagerAvailableChanged: {
        if (!root.networkManagerAvailable)
            root.modelState = Model.emptyState({
                status: "unavailable",
                reason: "networkmanager-unavailable",
                failure: "networkmanager-unavailable"
            });
        else if (root.active) {
            root.refresh();
            root.refreshBand();
            root.refreshDns();
            root.refreshQrDependencies();
        }
    }

    onRouteAvailableChanged: {
        if (root.routeAvailable)
            root.refreshDns();
        else if (!root.dnsActionBusy)
            root.dnsProfile = Model.parseDnsStatus("", 1);
        root.checkSpeedTestRoute();
        root.refreshSpeedDependencies();
    }

    onRouteInfoChanged: {
        root.checkSpeedTestRoute();
        root.refreshDns();
        root.refreshSpeedDependencies();
    }

    onDnsCustomOpenChanged: {
        if (root.dnsCustomOpen)
            Qt.callLater(() => dnsInput.forceActiveFocus());
    }

    onWifiDeviceChanged: {
        if (wifiShareOverlay.opened)
            wifiShareOverlay.close();
        if (root.wifiActionBusy)
            root.cancelWifiAction();
        root.setWifiScannerEnabled(root.active);
        root.wifiRows = [];
        if (root.active) {
            root.syncWifiRows();
            root.refreshBand();
        }
    }

    onWifiNetworkObjectsChanged: root.syncWifiRows()

    Connections {
        target: Networking

        function onWifiEnabledChanged() {
            root.setWifiScannerEnabled(root.active);
            if (!Networking.wifiEnabled)
                root.wifiScanning = false;
        }

        function onWifiHardwareEnabledChanged() {
            root.setWifiScannerEnabled(root.active);
            if (!Networking.wifiHardwareEnabled)
                root.wifiScanning = false;
        }
    }

    Process {
        id: statusProcess

        command: [root.statusCommand, "--verbose"]

        stdout: StdioCollector {
            id: statusOutput
        }
        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            root.acceptStatus(statusOutput.text, exitCode);
            if (root.active)
                refreshTimer.restart();
        }
    }

    Process {
        id: bandStatusProcess

        command: [root.bandCommand]

        stdout: StdioCollector {
            id: bandStatusOutput
        }
        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            root.acceptBandStatus(bandStatusOutput.text, exitCode);
            if (root.active && root.bandActionBusy === false)
                bandPoll.restart();
        }
    }

    Process {
        id: dnsStatusProcess

        stdout: StdioCollector {
            id: dnsStatusOutput
        }
        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            root.acceptDnsStatus(dnsStatusOutput.text, exitCode);
            if (root.active && root.routeAvailable)
                dnsPoll.restart();
        }
    }

    Process {
        id: dnsActionProcess

        property int token: 0
        property string custom: ""
        stdinEnabled: true

        onStarted: {
            if (custom !== "") {
                write(custom + "\n");
                custom = "";
            }
        }

        stdout: StdioCollector { waitForEnd: true }
        stderr: StdioCollector {
            id: dnsActionError
            waitForEnd: true
        }

        onExited: (exitCode, exitStatus) => {
            const resultToken = dnsActionProcess.token;
            if (resultToken !== root.dnsAction.token || !root.dnsActionBusy)
                return;
            if (exitCode !== 0) {
                root.finishDnsAction(
                    "failed",
                    Model.classifyDnsProcessFailure(dnsActionError.text, exitCode),
                    resultToken
                );
                root.refreshDns();
                return;
            }
            root.finishDnsAction("reconnection-required", "", resultToken);
            dnsConfirmationTimeout.restart();
            root.refreshDns();
        }
    }

    Process {
        id: bandActionProcess

        stdout: StdioCollector { waitForEnd: true }
        stderr: StdioCollector {
            id: bandActionError
            waitForEnd: true
        }

        onExited: (exitCode, exitStatus) => {
            if (!root.bandActionBusy)
                return;
            const target = root.pendingBand;
            root.pendingBand = "";
            root.pendingBandInterface = "";
            if (exitCode === 0) {
                root.bandSelected = target;
                root.bandFailure = "";
            } else {
                root.bandFailure = /not available/i.test(bandActionError.text)
                    ? "unavailable" : "reassociation-failed";
            }
            root.refreshBand();
        }
    }

    Timer {
        id: refreshTimer

        interval: 1500
        repeat: true
        running: root.active
        onTriggered: root.refresh()
    }

    Timer {
        id: bandPoll

        interval: 4000
        repeat: true
        running: root.active
        onTriggered: root.refreshBand()
    }

    Timer {
        id: dnsPoll

        interval: 1500
        repeat: true
        running: root.active && root.routeAvailable
        onTriggered: root.refreshDns()
    }

    Timer {
        id: dnsConfirmationTimeout

        interval: 7000
        repeat: false
        onTriggered: {
            if (root.dnsActionBusy) {
                root.finishDnsAction("failed", "confirmation-timeout", root.dnsAction.token);
                root.refreshDns();
            }
        }
    }

    Timer {
        id: wifiScanStart

        interval: 100
        repeat: false
        onTriggered: {
            if (!root.active || !root.wifiDevice || !root.networkManagerAvailable
                    || !Networking.wifiEnabled || !Networking.wifiHardwareEnabled)
                return;
            root.wifiScanning = true;
            root.setWifiScannerEnabled(true);
            wifiScanSettle.restart();
            wifiScanTimer.start();
        }
    }

    Timer {
        id: wifiScanSettle

        interval: 1200
        repeat: false
        onTriggered: root.wifiScanning = false
    }

    Timer {
        id: wifiScanTimer

        interval: 1500
        repeat: true
        running: root.active && root.wifiDevice !== null
        onTriggered: root.syncWifiRows()
    }

    Timer {
        id: wifiActionTimeout

        interval: 30000
        repeat: false
        onTriggered: {
            if (root.wifiAction.status === "pending")
                root.finishWifiAction("failed", "timeout", root.wifiAction.token);
        }
    }

    Timer {
        id: speedTestPhaseTimer

        // Stop each direction after a short sample; the overall timer below
        // still bounds a helper that ignores termination or never progresses.
        interval: 5000
        repeat: false
        onTriggered: {
            if (!root.speedTestRunning || !speedTestProcess.running)
                return;
            root.speedTestPhaseExpectedStop = true;
            speedTestProcess.running = false;
        }
    }

    Timer {
        id: speedTestTimeoutTimer

        interval: 30000
        repeat: false
        onTriggered: {
            if (!root.speedTestRunning || !speedTestProcess.running)
                return;
            root.speedTestError = Model.speedTestFailureLabel("timeout");
            root.speedTestExpectedStop = true;
            root.speedTestPhaseExpectedStop = false;
            root.speedTestRunning = false;
            root.speedTestPhase = "";
            speedTestPhaseTimer.stop();
            speedTestProcess.running = false;
        }
    }

    Connections {
        target: root.wifiActionNetwork
        enabled: root.wifiAction.status === "pending" && root.wifiActionNetwork !== null

        function onConnectionFailed(reason) {
            if (!root.wifiActionBusy || !root.wifiActionNetwork)
                return;
            const row = root.wifiRows.find(candidate => candidate.key === root.wifiAction.key);
            const security = row ? row.security : root.wifiActionNetwork?.security;
            const credentialed = root.pskSecurityTypes.includes(security)
                || root.enterpriseSecurityTypes.includes(security);
            const error = Model.wifiFailureForReason(reason, credentialed, {
                NoSecrets: ConnectionFailReason.NoSecrets,
                WifiAuthTimeout: ConnectionFailReason.WifiAuthTimeout,
                WifiNetworkLost: ConnectionFailReason.WifiNetworkLost,
                WifiClientDisconnected: ConnectionFailReason.WifiClientDisconnected,
                WifiClientFailed: ConnectionFailReason.WifiClientFailed
            });
            const reprompt = Model.shouldRepromptWifi(reason, credentialed, {
                NoSecrets: ConnectionFailReason.NoSecrets,
                WifiAuthTimeout: ConnectionFailReason.WifiAuthTimeout
            });
            root.finishWifiAction("failed", error, root.wifiAction.token);
            if (reprompt && row) {
                if (root.wifiSupportsInPageAuth(row))
                    root.showWifiCredentials(row);
                else if (root.wifiIsEnterprise(row)) {
                    Quickshell.execDetached(["ghostty", "-e", "nmtui"]);
                    root.closeRequested();
                }
            }
        }

        function onConnectedChanged() {
            root.syncWifiRows();
            root.checkWifiAction();
        }

        function onKnownChanged() {
            root.syncWifiRows();
            root.checkWifiAction();
        }

        function onStateChangingChanged() {
            root.checkWifiAction();
        }
    }

    Process {
        id: speedDependencyProcess

        stdout: StdioCollector { waitForEnd: true }
        stderr: StdioCollector { waitForEnd: true }

        onExited: (exitCode, exitStatus) => {
            root.speedDependenciesLoading = false;
            const checkedInterface = root.speedDependenciesInterface;
            if (!root.active || !root.routeAvailable
                    || root.routeInfo.iface !== checkedInterface) {
                if (root.active)
                    root.refreshSpeedDependencies();
                return;
            }
            root.speedDependenciesAvailable = exitCode === 0;
        }
    }

    Process {
        id: qrDependencyProcess

        command: ["df-network-qr", "--check"]

        onExited: (exitCode, exitStatus) => {
            root.qrDependenciesLoading = false;
            root.qrDependenciesAvailable = exitCode === 0;
        }
    }

    Process {
        id: speedTestProcess

        property int token: 0
        property string phase: ""

        stdout: SplitParser {
            onRead: root.updateSpeedTestLine(data, speedTestProcess.token)
        }
        stderr: StdioCollector {
            id: speedTestStderr
            waitForEnd: true
            onStreamFinished: {
                if (speedTestProcess.token === root.speedTestToken
                        && !root.speedTestExpectedStop
                        && !root.speedTestPhaseExpectedStop
                        && String(text || "").trim() !== "")
                    root.speedTestError = String(text).trim();
            }
        }

        onExited: (exitCode, exitStatus) => {
            speedTestPhaseTimer.stop();
            if (speedTestProcess.token !== root.speedTestToken)
                return;
            if (root.speedTestPendingRun) {
                root.speedTestPendingRun = false;
                root.speedTestExpectedStop = false;
                if (root.speedTestOpen)
                    Qt.callLater(() => root.runSpeedTest());
                return;
            }
            if (root.speedTestExpectedStop || root.speedTestPhase === "") {
                root.speedTestExpectedStop = false;
                return;
            }
            if (root.speedTestPhaseExpectedStop) {
                root.speedTestPhaseExpectedStop = false;
                if (root.speedTestPhase === "down")
                    root.startSpeedPhase("up");
                else {
                    speedTestTimeoutTimer.stop();
                    root.speedTestPhase = "";
                    root.speedTestRunning = false;
                }
                return;
            }
            if (exitCode !== 0) {
                speedTestTimeoutTimer.stop();
                if (root.speedTestError === "")
                    root.speedTestError = "Speed test failed";
                root.speedTestPhase = "";
                root.speedTestRunning = false;
                return;
            }
            speedTestTimeoutTimer.stop();
            root.speedTestPhase = "";
            root.speedTestRunning = false;
        }
    }

    Process {
        id: wifiCredentialProcess

        property int token: 0
        property string secret: ""
        stdinEnabled: true

        onStarted: {
            write(secret + "\n");
            secret = "";
        }

        stdout: StdioCollector {}
        stderr: StdioCollector {
            id: wifiCredentialError
        }

        onExited: (exitCode, exitStatus) => {
            const resultToken = wifiCredentialProcess.token;
            if (resultToken !== root.wifiAction.token || root.wifiAction.status !== "pending")
                return;
            if (exitCode !== 0) {
                root.finishWifiAction(
                    "failed",
                    Model.classifyWifiProcessFailure(wifiCredentialError.text, exitCode),
                    resultToken
                );
                return;
            }
            root.checkWifiAction();
            if (root.wifiAction.status === "pending")
                wifiActionTimeout.restart();
        }
    }

    Component.onDestruction: {
        root.setWifiScannerEnabled(false);
        bandStatusProcess.running = false;
        dnsStatusProcess.running = false;
        qrDependencyProcess.running = false;
        root.closeSpeedTest("cancelled", true);
        root.cancelWifiAction();
        root.cancelDnsAction();
    }

    Process {
        id: wiredProfilesProcess

        command: [root.wiredCommand, "profiles"]

        stdout: StdioCollector {
            id: wiredProfilesOutput
        }
        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            root.wiredProfileLoading = false;
            if (exitCode !== 0) {
                const failedDevice = root.wiredChoiceDevice;
                root.wiredChoiceDevice = null;
                root.wiredActionDevice = failedDevice;
                root.wiredAction = Model.wiredActionState(
                    { iface: root.wiredInterface(failedDevice) },
                    "reconnect",
                    "failed",
                    exitCode,
                    "profile-query-failed"
                );
                return;
            }

            root.wiredProfiles = Model.parseWiredProfiles(wiredProfilesOutput.text);
            const device = root.wiredChoiceDevice;
            if (!device)
                return;
            const choice = Model.wiredProfileChoice(root.wiredProfiles, root.wiredInterface(device));
            if (choice.choice === "one") {
                root.beginWiredAction("reconnect", device, null);
            } else if (choice.choice === "none") {
                root.wiredChoiceDevice = null;
                root.wiredActionDevice = device;
                root.wiredAction = Model.wiredActionState(
                    { iface: root.wiredInterface(device) },
                    "reconnect",
                    "failed",
                    undefined,
                    "no-eligible-profile"
                );
            }
        }
    }

    Process {
        id: wiredActionProcess

        command: root.wiredProfileUuid !== ""
            ? [root.wiredCommand, "activate", root.wiredAction.iface, root.wiredProfileUuid]
            : [root.wiredCommand, root.wiredAction.action, root.wiredAction.iface]

        stdout: StdioCollector {}
        stderr: StdioCollector {}

        onExited: (exitCode, exitStatus) => {
            if (root.wiredAction.status !== "pending")
                return;
            if (exitCode !== 0) {
                root.finishWiredAction("failed", "action-failed");
                return;
            }
            root.checkWiredConfirmation();
            if (root.wiredAction.status === "pending") {
                confirmationTimer.restart();
                confirmationTimeout.restart();
            }
        }
    }

    Timer {
        id: confirmationTimer

        interval: 100
        repeat: true
        onTriggered: root.checkWiredConfirmation()
    }

    Timer {
        id: confirmationTimeout

        interval: 4000
        repeat: false
        onTriggered: {
            if (root.wiredAction.status === "pending")
                root.finishWiredAction("failed", "confirmation-timeout");
        }
    }

    Column {
        width: root.width
        spacing: Theme.quickSettingsGap

        Item {
            width: parent.width
            implicitHeight: 76

            Rectangle {
                anchors.fill: parent
                radius: 12
                color: root.modelState.status === "connected"
                    ? Theme.accent
                    : Qt.rgba(Theme.foreground.r, Theme.foreground.g, Theme.foreground.b, 0.10)
            }

            Text {
                anchors.left: parent.left
                anchors.leftMargin: 16
                anchors.top: parent.top
                anchors.topMargin: 12
                text: Model.connectionIcon(root.modelState)
                color: root.modelState.status === "connected" ? Theme.background : Theme.foreground
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSize + 9
                textFormat: Text.PlainText
            }

            Column {
                anchors.left: parent.left
                anchors.leftMargin: 52
                anchors.right: parent.right
                anchors.rightMargin: 12
                anchors.verticalCenter: parent.verticalCenter
                spacing: 2

                Text {
                    width: parent.width
                    text: root.statusLabel()
                    color: root.modelState.status === "connected" ? Theme.background : Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize + 2
                    font.weight: Font.DemiBold
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }

                Text {
                    width: parent.width
                    text: root.statusDetail()
                    color: root.modelState.status === "connected" ? Theme.background : Theme.foreground
                    opacity: 0.70
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.fontSize - 2
                    textFormat: Text.PlainText
                    elide: Text.ElideRight
                }
            }
        }

        PageRow {
            width: parent.width
            icon: "󰩟"
            label: "Connection info"
            detail: root.routeAvailable
                ? `${root.routeInfo.kind === "wifi" ? "Wi-Fi" : "Wired"} · ${root.routeInfo.iface}`
                : "Unavailable"
            disclosureVisible: true
            disclosureOpen: root.connectionInfoOpen
            onClicked: root.connectionInfoOpen = !root.connectionInfoOpen
        }

        Column {
            x: 12
            width: parent.width - 12
            spacing: 4
            visible: root.connectionInfoOpen

            PageRow {
            width: parent.width
            icon: "󰩟"
            label: "Default Route"
            detail: root.routeAvailable
                ? `${root.routeInfo.kind === "wifi" ? "Wi-Fi" : "Wired"} · ${root.routeInfo.iface}`
                : "Unavailable"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰩟"
            label: "Address"
            detail: root.routeAvailable ? root.valueOrPlaceholder(Model.formatAddress(root.modelState)) : "--"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰖟"
            label: "Gateway"
            detail: root.routeAvailable ? root.valueOrPlaceholder(root.modelState.gateway) : "--"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰓅"
            label: "Link"
            detail: root.routeAvailable ? root.valueOrPlaceholder(Model.formatLink(root.modelState)) : "--"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰄉"
            label: "Latency"
            detail: root.routeAvailable ? root.valueOrPlaceholder(root.modelState.internetPingLatency >= 0
                ? `${Math.round(root.modelState.internetPingLatency)} ms`
                : "--") : "--"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰇚"
            label: "Traffic"
            detail: root.routeAvailable ? root.valueOrPlaceholder(root.modelState.rxBytes !== null
                ? `${Model.formatBytes(root.modelState.rxBytes)} ↓  ${Model.formatBytes(root.modelState.txBytes)} ↑`
                : "--") : "--"
            interactive: false
            visible: true
        }

        PageRow {
            width: parent.width
            icon: "󰁯"
            label: "Rate"
            detail: root.routeAvailable
                ? `${Model.formatRate(root.modelState.downloadRate)} ↓  ${Model.formatRate(root.modelState.uploadRate)} ↑`
                : "--"
            interactive: false
            visible: true
        }

        }

        PageRow {
            width: parent.width
            icon: "󰓅"
            label: "Run speed test"
            detail: root.speedTestDetail()
            visible: root.routeAvailable && !!root.routeInfo.iface
            enabled: root.speedTestAvailable && !root.speedTestActionBusy
            onClicked: root.runSpeedTest()
        }

        Column {
            width: parent.width
            spacing: 4
            visible: root.routeAvailable && root.dnsProfile.available

            PageRow {
                width: parent.width
                icon: root.dnsActionBusy ? "󰔟" : "󰖟"
                label: "DNS provider"
                detail: root.dnsDetail()
                enabled: !root.dnsActionBusy
                disclosureVisible: true
                disclosureOpen: root.dnsProviderOpen
                onClicked: root.dnsProviderOpen = !root.dnsProviderOpen
            }

            Repeater {
                model: root.dnsProviderOpen ? root.dnsProviders : []

                delegate: PageRow {
                    required property string modelData
                    property string provider: modelData

                    width: parent.width - 12
                    x: 12
                    icon: root.dnsProfile.provider === provider ? "✓" : "○"
                    label: provider
                    detail: root.dnsProfile.provider === provider ? "Confirmed" : ""
                    enabled: !root.dnsActionBusy

                    onClicked: root.setDnsProvider(provider)
                }
            }

            Item {
                width: parent.width - 12
                x: 12
                height: root.dnsCustomOpen ? customDnsForm.childrenRect.height + 16 : 0
                visible: root.dnsCustomOpen

                Rectangle {
                    anchors.fill: parent
                    radius: 10
                    color: Qt.rgba(
                        Theme.foreground.r,
                        Theme.foreground.g,
                        Theme.foreground.b,
                        0.08
                    )
                    border.color: Theme.accent
                    border.width: dnsInput.activeFocus ? 2 : 0
                }

                Column {
                    id: customDnsForm

                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.margins: 8
                    spacing: 4

                    Text {
                        width: parent.width
                        text: "DNS servers (space or comma separated)"
                        color: Theme.foreground
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 2
                        textFormat: Text.PlainText
                    }

                    TextInput {
                        id: dnsInput

                        width: parent.width
                        height: Theme.quickSettingsRowHeight
                        text: root.dnsCustomText
                        color: Theme.foreground
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.fontSize - 2
                        selectByMouse: true
                        clip: true
                        activeFocusOnTab: root.dnsCustomOpen
                        onTextChanged: if (activeFocus) root.dnsCustomText = text
                        Keys.onEscapePressed: root.dnsCustomOpen = false
                        Keys.onReturnPressed: root.submitCustomDns()
                        Component.onCompleted: if (root.dnsCustomOpen) forceActiveFocus()
                    }

                    PageRow {
                        width: parent.width
                        icon: "✓"
                        label: "Apply custom DNS"
                        enabled: !!root.dnsCustomText && !root.dnsActionBusy
                        onClicked: root.submitCustomDns()
                    }

                    PageRow {
                        width: parent.width
                        icon: "×"
                        label: "Cancel"
                        enabled: !root.dnsActionBusy
                        onClicked: root.dnsCustomOpen = false
                    }
                }
            }

            PageRow {
                width: parent.width
                icon: "×"
                label: "Cancel DNS action"
                detail: root.dnsAction.target
                visible: root.dnsActionBusy
                onClicked: root.cancelDnsAction()
            }
        }

        PageRow {
            width: parent.width
            icon: ""
            label: "DNS change failed"
            detail: Model.dnsFailureLabel(root.dnsAction.error)
            enabled: false
            visible: root.dnsAction.status === "failed"
                || root.dnsAction.status === "cancelled"
        }

        Repeater {
            model: root.wiredDevices

            delegate: PageRow {
                property var device: modelData

                width: parent.width
                icon: "󰀂"
                label: root.wiredLabel(device)
                detail: root.wiredDetail(device)
                enabled: root.networkManagerAvailable && !root.wiredActionBusy

                onClicked: root.toggleWired(device)
            }
        }

        PageRow {
            width: parent.width
            icon: "×"
            label: "Cancel wired action"
            detail: root.wiredAction.action === "disconnect" ? "Disconnect" : "Connect"
            enabled: true
            visible: root.wiredAction.status === "pending"

            onClicked: root.cancelWiredAction()
        }

        Column {
            width: parent.width
            spacing: 4
            visible: root.wiredChoiceDevice !== null

            PageRow {
                width: parent.width
                icon: "󰀂"
                label: "Choose a wired profile"
                detail: root.wiredProfileLoading ? "Checking…" : "NetworkManager profiles"
                enabled: false
            }

            Repeater {
                model: root.wiredChoiceDevice ? root.wiredChoices(root.wiredChoiceDevice) : []

                delegate: PageRow {
                    property var profile: modelData

                    width: parent.width
                    icon: "󰖪"
                    label: profile.name || profile.uuid
                    detail: profile.interfaceName || "Autoconnect"
                    enabled: !root.wiredProfileLoading && !root.wiredActionBusy

                    onClicked: root.chooseWiredProfile(profile)
                }
            }

            PageRow {
                width: parent.width
                icon: "×"
                label: "Cancel"
                detail: ""
                enabled: true

                onClicked: root.cancelWiredAction()
            }
        }

        PageRow {
            width: parent.width
            icon: root.wifiAvailability === "hardware-blocked" ? "󰤭" : "󰤮"
            label: root.wifiStatusLabel()
            detail: root.wifiActionBusy
                ? "Working…"
                : (root.wifiAvailability === "unavailable" ? "NetworkManager unavailable" : "")
            enabled: root.networkManagerAvailable && root.wifiDevice !== null
                && Networking.wifiHardwareEnabled && !root.wifiActionBusy
            onClicked: Networking.wifiEnabled = !Networking.wifiEnabled
        }

        Column {
            width: parent.width
            spacing: 4
            visible: root.connectedWifiDevices.length > 1

            PageRow {
                width: parent.width
                icon: "󰤨"
                label: "Wi-Fi adapter"
                detail: root.wifiInterface()
                enabled: false
            }

            Repeater {
                model: root.connectedWifiDevices

                delegate: PageRow {
                    property var device: modelData

                    width: parent.width
                    x: 12
                    icon: root.wifiInterfaceForDevice(device) === root.wifiInterface() ? "✓" : "󰤮"
                    label: root.wifiInterfaceForDevice(device)
                    detail: root.wifiInterfaceForDevice(device) === root.wifiInterface()
                        ? "Selected" : "Connected"
                    enabled: !root.wifiActionBusy && !root.bandActionBusy

                    onClicked: root.selectWifiAdapter(device)
                }
            }
        }

        Column {
            width: parent.width
            spacing: 4
            visible: root.bandControlsVisible

            PageRow {
                width: parent.width
                icon: root.bandActionBusy ? "󰔟" : "󰖩"
                label: "Wi-Fi band"
                detail: root.bandDetail()
                enabled: false
            }

            PageRow {
                width: parent.width
                icon: root.bandSelected === "auto" ? "✓" : "○"
                label: "Automatic"
                detail: root.bandSelected === "auto" ? "Selected" : "Let Wi-Fi choose"
                enabled: !root.bandActionBusy
                onClicked: root.setBand("auto")
            }

            Repeater {
                model: root.bandAvailable

                delegate: PageRow {
                    property string band: modelData

                    width: parent.width
                    x: 12
                    icon: root.bandSelected === band ? "✓" : "○"
                    label: Model.bandLabel(band)
                    detail: root.bandCurrent === band ? "Available · Active" : "Available"
                    enabled: !root.bandActionBusy
                    onClicked: root.setBand(band)
                }
            }

            PageRow {
                width: parent.width
                icon: ""
                label: "Band change failed"
                detail: Model.bandFailureLabel(root.bandFailure)
                enabled: false
                visible: root.bandFailure !== ""
            }
        }

        Column {
            width: parent.width
            spacing: 4
            visible: root.wifiDevice !== null

            PageRow {
                width: parent.width
                icon: "󰤨"
                label: "Nearby Wi-Fi networks"
                detail: root.wifiScanning ? "Scanning…" : `${root.wifiRows.length}`
                enabled: false
            }

            PageRow {
                width: parent.width
                icon: root.wifiAvailability === "software-disabled" ? "󰤭" : "󰤮"
                label: root.wifiAvailability === "software-disabled"
                    ? "Wi-Fi is off"
                    : (root.wifiRows.length === 0 ? "No networks found" : "No network selected")
                detail: root.wifiAvailability === "scanning" ? "Scanning…" : ""
                enabled: false
                visible: root.wifiRows.length === 0 || root.wifiAvailability === "software-disabled"
            }

            Repeater {
                model: root.wifiRows

                delegate: Column {
                    id: wifiEntry

                    required property var modelData
                    readonly property bool menuOpen: root.wifiContextTarget
                        && root.wifiContextTarget.key === wifiEntry.modelData.key
                    readonly property bool promptOpen: root.wifiCredentialTarget
                        && root.wifiCredentialTarget.key === wifiEntry.modelData.key

                    width: parent.width
                    spacing: 2

                    PageRow {
                        width: wifiEntry.width
                        icon: root.wifiIcon(wifiEntry.modelData)
                        label: wifiEntry.modelData.label
                        detail: root.wifiDetail(wifiEntry.modelData)
                        overflowVisible: wifiEntry.modelData.connected || wifiEntry.modelData.known
                        enabled: root.networkManagerAvailable && !root.wifiActionBusy

                        onClicked: keyboard => root.clickWifiRow(wifiEntry.modelData, keyboard)
                        onRightClicked: root.openWifiActions(wifiEntry.modelData)
                        onOverflowClicked: root.openWifiActions(wifiEntry.modelData)
                    }

                    PageRow {
                        x: 12
                        width: wifiEntry.width - 12
                        visible: wifiEntry.menuOpen && wifiEntry.modelData.connected
                        enabled: root.qrShareAvailable
                            && !root.wifiActionBusy && !root.bandActionBusy
                        label: "Share Wi-Fi"
                        detail: root.qrDependenciesLoading ? "Checking…"
                            : (root.qrShareAvailable ? "Show QR code" : "QR unavailable")
                        onClicked: root.shareWifi(wifiEntry.modelData)
                    }

                    PageRow {
                        x: 12
                        width: wifiEntry.width - 12
                        visible: wifiEntry.menuOpen && wifiEntry.modelData.connected
                        enabled: !root.wifiActionBusy
                        label: "Disconnect"
                        onClicked: root.startWifiNativeAction("disconnect", wifiEntry.modelData)
                    }

                    PageRow {
                        x: 12
                        width: wifiEntry.width - 12
                        visible: wifiEntry.menuOpen && wifiEntry.modelData.known
                        enabled: !root.wifiActionBusy
                        label: "Forget"
                        onClicked: root.startWifiNativeAction("forget", wifiEntry.modelData)
                    }

                    Item {
                        width: wifiEntry.width
                        // Size from the form's own implicit height. Using
                        // childrenRect here creates a binding loop while the
                        // delegate is being laid out, which leaves the input
                        // visually pinned to the top of the network row.
                        height: wifiEntry.promptOpen ? credentialForm.implicitHeight + 16 : 0
                        visible: wifiEntry.promptOpen

                        Rectangle {
                            anchors.fill: parent
                            radius: 10
                            color: Qt.rgba(
                                Theme.foreground.r,
                                Theme.foreground.g,
                                Theme.foreground.b,
                                0.08
                            )
                            border.color: Theme.accent
                            border.width: passwordInput.activeFocus || identityInput.activeFocus ? 2 : 0
                        }

                        Column {
                            id: credentialForm

                            anchors.top: parent.top
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.margins: 8
                            spacing: 4

                            TextInput {
                                id: identityInput

                                visible: root.wifiIsEnterprise(wifiEntry.modelData)
                                width: parent.width
                                height: visible ? Theme.quickSettingsRowHeight : 0
                                text: root.wifiIdentityText
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize - 2
                                verticalAlignment: TextInput.AlignVCenter
                                selectByMouse: true
                                clip: true
                                activeFocusOnTab: visible
                                onTextChanged: if (activeFocus) root.wifiIdentityText = text
                                Keys.onReturnPressed: passwordInput.forceActiveFocus()
                                Keys.onEnterPressed: passwordInput.forceActiveFocus()
                            }

                            TextInput {
                                id: passwordInput

                                width: parent.width
                                height: Theme.quickSettingsRowHeight
                                text: root.wifiSecretText
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.fontSize - 2
                                verticalAlignment: TextInput.AlignVCenter
                                selectByMouse: true
                                clip: true
                                activeFocusOnTab: wifiEntry.promptOpen
                                echoMode: TextInput.Password
                                passwordMaskDelay: 0
                                onTextChanged: if (activeFocus) root.wifiSecretText = text
                                Keys.onEscapePressed: root.cancelWifiCredentials()
                                onAccepted: root.submitWifiCredentials(wifiEntry.modelData)
                            }

                            PageRow {
                                width: parent.width
                                icon: "✓"
                                label: root.wifiIsEnterprise(wifiEntry.modelData)
                                    ? "Connect with identity"
                                    : "Connect with password"
                                enabled: !!root.wifiSecretText
                                    && (!root.wifiIsEnterprise(wifiEntry.modelData) || !!root.wifiIdentityText)
                                onClicked: root.submitWifiCredentials(wifiEntry.modelData)
                            }

                            PageRow {
                                width: parent.width
                                icon: "×"
                                label: "Cancel"
                                onClicked: root.cancelWifiCredentials()
                            }
                        }

                    }

                    onPromptOpenChanged: {
                        if (wifiEntry.promptOpen) {
                            Qt.callLater(() => {
                                if (identityInput.visible)
                                    identityInput.forceActiveFocus();
                                else
                                    passwordInput.forceActiveFocus();
                            });
                        } else {
                            identityInput.clear();
                            passwordInput.clear();
                            root.clearWifiCredentials();
                        }
                    }
                }
            }

            PageRow {
                width: parent.width
                icon: "×"
                label: "Cancel Wi-Fi action"
                detail: root.wifiAction.action === "forget" ? "Forget" : "Connect"
                visible: root.wifiAction.status === "pending"
                onClicked: root.cancelWifiAction()
            }
        }

        PageRow {
            width: parent.width
            icon: "󰤮"
            label: root.modelState.status === "busy" ? "Checking connection" : "No connection"
            detail: root.modelState.status === "busy" ? "Please wait…" : "Connect a network to continue"
            enabled: false
            visible: root.modelState.status === "disconnected" || root.modelState.status === "busy"
        }

        PageRow {
            width: parent.width
            icon: ""
            label: "Network status unavailable"
            detail: root.statusDetail()
            enabled: false
            visible: root.modelState.status === "unavailable"
        }
    }

    WifiShareOverlay {
        id: wifiShareOverlay
    }

    SpeedTestOverlay {
        id: speedTestOverlay

        opened: root.speedTestOpen
        running: root.speedTestRunning
        interfaceName: root.speedTestInterface
        connectionLabel: root.speedTestLabel
        phase: root.speedTestPhase
        downloadMbps: root.speedTestDownload
        uploadMbps: root.speedTestUpload
        error: root.speedTestError
        canRunAgain: root.speedTestAvailable

        onCloseRequested: root.closeSpeedTest("cancelled", true)
        onRunAgainRequested: root.runSpeedTest()
    }
}
