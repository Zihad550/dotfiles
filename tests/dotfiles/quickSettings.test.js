const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

test("Primary surface keeps the finished hierarchy and spatial Tile navigation", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const tile = source("modules/Tile.qml");
    const audioPage = source("modules/AudioPage.qml");
    const networkTiles = source("modules/NetworkQuickSettings.qml");

    assert.doesNotMatch(quickSettings, /legacyRows|WiredStatus|WifiPage|WiredRow/);
    assert.match(quickSettings, /NetworkQuickSettings\s*\{[\s\S]*id:\s*networkQuickSettings[\s\S]*controller:\s*networkPage/);
    assert.match(networkTiles, /id:\s*tileGrid[\s\S]*id:\s*wifiTile/);
    assert.match(networkTiles, /WiredTile\s*\{/);
    assert.match(quickSettings, /id:\s*bluetoothTile[\s\S]*id:\s*tailscaleTile[\s\S]*id:\s*devcontainerTile/);
    assert.match(networkTiles, /wifiTile[\s\S]*navigationContainer:\s*tileGrid/);
    assert.match(tile, /Key_Left[\s\S]*Key_Right[\s\S]*Key_Up[\s\S]*Key_Down/);
    assert.match(tile, /mapToItem\(root\.navigationContainer/);
    assert.match(audioPage, /reconnectTimer\.stop\(\)[\s\S]*sinkList\.running\s*=\s*false/);
});

test("Network Tiles size from their lexical grid id", () => {
    const networkTiles = source("modules/NetworkQuickSettings.qml");

    assert.match(
        networkTiles,
        /implicitHeight:\s*root\.available\s*\?\s*tileGrid\.implicitHeight\s*:\s*0/,
        "the root Item must read the Flow id directly, so transport Tiles can render",
    );
    assert.doesNotMatch(networkTiles, /root\.tileGrid\.implicitHeight/);
});

test("read-only PageRows stay legible without accepting interaction", () => {
    const pageRow = source("modules/PageRow.qml");
    const networkPage = source("modules/NetworkPage.qml");

    assert.match(pageRow, /property bool interactive: true/);
    assert.match(pageRow, /property bool disclosureVisible: false/);
    assert.match(pageRow, /text: root\.disclosureOpen \? "⌃" : "⌄"/);
    assert.match(pageRow, /activeFocusOnTab: root\.enabled && root\.interactive && root\.visible/);
    assert.match(pageRow, /enabled: root\.enabled && root\.interactive/);
    assert.match(pageRow, /opacity: root\.enabled \? 1 : 0\.45/);

    for (const label of ["Address", "Gateway", "Link", "Latency", "Traffic", "Rate"]) {
        const row = new RegExp(`label: "${label}"[\\s\\S]*?interactive: false[\\s\\S]*?visible: true`);
        assert.match(networkPage, row);
    }
});

test("Quick Settings keeps its parent open while the speed-test overlay owns focus", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(
        quickSettings,
        /HyprlandFocusGrab\s*\{[\s\S]*active:\s*root\.shown && !networkPage\.speedTestOpen/,
    );
});

test("Stay Awake is a persistent, visible Tile in the primary surface", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const state = source("StayAwakeState.qml");

    assert.match(quickSettings, /StayAwakeState\.enabled/);
    assert.match(quickSettings, /id:\s*stayAwakeTile[\s\S]*visible:\s*true[\s\S]*label:\s*"Stay Awake"[\s\S]*active:\s*StayAwakeState\.enabled[\s\S]*busy:\s*StayAwakeState\.busy[\s\S]*onClicked:\s*StayAwakeState\.toggle\(\)/);
    assert.match(state, /togglePath:\s*`\$\{root\.togglesDir\}\/stay-awake`/);
    assert.match(state, /watchChanges:\s*true/);
    assert.match(state, /onLoaded:\s*root\.enabled\s*=\s*true/);
    assert.match(state, /onLoadFailed:\s*root\.enabled\s*=\s*false/);
    assert.match(state, /mkdir -p[\s\S]*touch/);
    assert.match(state, /rm[\s\S]*root\.togglePath/);
});

test("Stay Awake writes through its local Process and FileView objects", () => {
    const state = source("StayAwakeState.qml");

    assert.doesNotMatch(state, /root\.toggleProcess|root\.toggleFile/,
        "QML ids are lexical objects, not properties exposed on the Singleton root");
    assert.match(state, /toggleProcess\.command/);
    assert.match(state, /toggleProcess\.running/);
    assert.match(state, /onExited:\s*toggleFile\.reload\(\)/);
});

test("Quick Settings exposes laptop battery state and immediate header actions", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(quickSettings, /UPower\.displayDevice/);
    assert.match(quickSettings, /battery\?\.isLaptopBattery/);
    assert.match(quickSettings, /batteryPercent/);
    assert.match(quickSettings, /batteryGlyph:\s*Status\.batteryIcon/);
    assert.match(quickSettings, /id:\s*batterySummary[\s\S]*radius:\s*height\s*\/\s*2/);
    assert.match(quickSettings, /text:\s*`\$\{root\.batteryPercent\}%`/);
    assert.match(quickSettings, /id:\s*batterySummary[\s\S]*anchors\.left:\s*parent\.left/);
    assert.match(quickSettings, /id:\s*headerActions[\s\S]*anchors\.right:\s*parent\.right/);
    assert.match(quickSettings, /HeaderAction\s*{[\s\S]*id:\s*lockAction/);
    assert.match(quickSettings, /HeaderAction\s*{[\s\S]*id:\s*powerAction/);
    assert.match(quickSettings, /lockAction[\s\S]*Quickshell\.execDetached\(\["qs", "-c", "lock", "ipc", "call", "lock", "lock"\]\)[\s\S]*root\.dismiss\(\)/);
    assert.match(quickSettings, /powerAction[\s\S]*root\.navigate\(QuickSettings\.Power/);
});

test("Power Page keeps existing actions in their established order", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(quickSettings, /enum Page \{[\s\S]*Primary,[\s\S]*Network,[\s\S]*Power[\s\S]*\}/);
    assert.match(quickSettings, /QuickSettingsPage\s*{[\s\S]*id:\s*powerPage[\s\S]*title:\s*"Power"/);
    assert.match(quickSettings, /id:\s*powerPage[\s\S]*onBack:\s*keyboard\s*=>\s*root\.showPrimary\(keyboard\)/);

    const actions = quickSettings.match(/label:\s*"(Suspend|Restart|Shutdown|Log out)"/g);
    assert.deepStrictEqual(actions, [
        'label: "Suspend"',
        'label: "Restart"',
        'label: "Shutdown"',
        'label: "Log out"',
    ]);
    assert.match(quickSettings, /label: "Suspend",\s*command: \["systemctl", "suspend"\]/);
    assert.match(quickSettings, /label: "Restart",\s*command: \["systemctl", "reboot"\]/);
    assert.match(quickSettings, /label: "Shutdown",\s*command: \["systemctl", "poweroff"\]/);
    assert.match(quickSettings, /label: "Log out",\s*command: \["uwsm", "stop"\]/);

    assert.match(quickSettings, /PageRow\s*{[\s\S]*Quickshell\.execDetached\(modelData\.command\)[\s\S]*root\.dismiss\(\)/);
    assert.match(quickSettings, /onEscapePressed:[\s\S]*root\.currentPage === QuickSettings\.Primary[\s\S]*root\.showPrimary\(true\)/);
    assert.match(quickSettings, /onShownChanged:[\s\S]*root\.currentPage = QuickSettings\.Primary/);
});

test("Audio Page is native, availability-aware, and keeps advanced settings as a hand-off", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const volume = source("modules/Volume.qml");
    const audioPage = source("modules/AudioPage.qml");

    assert.match(quickSettings, /enum Page \{[\s\S]*Audio[\s\S]*\}/);
    assert.match(quickSettings, /AudioPage\s*\{/);
    assert.match(audioPage, /title:\s*"Audio"/);
    assert.match(audioPage, /Pipewire\.preferredDefaultAudioSink\s*=\s*node/);
    assert.match(volume, /Pipewire\.defaultAudioSink/);
    assert.match(volume, /signal pageRequested\(bool keyboard\)/);
    assert.match(audioPage, /pactl.*-f.*json.*list.*sinks/);
    assert.match(audioPage, /availableSinkNames/);
    assert.match(audioPage, /Pipewire\.nodes\.values/);
    assert.match(audioPage, /Pipewire\.defaultAudioSink/);
    assert.match(audioPage, /label:\s*"Advanced audio settings"/);
    assert.match(audioPage, /Quickshell\.execDetached\(\["pavucontrol"\]\)/);
});

test("Volume shows a persistent percentage and its Tooltip responds to hover", () => {
    const volume = source("modules/Volume.qml");

    const percentLabelMatch = volume.match(/id:\s*percentLabel[\s\S]*?\n {4}\}/);
    assert.ok(percentLabelMatch, "expected a percentLabel block to extract");
    const percentLabelBlock = percentLabelMatch[0];
    assert.match(percentLabelBlock, /width:\s*44/);
    assert.match(percentLabelBlock, /text:\s*`\$\{Math\.max\(0, Math\.min\(100, root\.volume\)\)\}%`/);
    assert.doesNotMatch(percentLabelBlock, /muted/);

    assert.match(volume, /id:\s*trackMouse[\s\S]*?hoverEnabled:\s*true/);
    assert.match(volume, /id:\s*muteMouse[\s\S]*?hoverEnabled:\s*true/);
    assert.match(volume, /id:\s*pageMouse[\s\S]*?hoverEnabled:\s*true/);
    assert.match(volume, /id:\s*percentMouse[\s\S]*?hoverEnabled:\s*true/);

    assert.match(
        volume,
        /shown:\s*root\.muteFocusVisible \|\| muteMouse\.containsMouse \|\| root\.sliderFocusVisible \|\| trackMouse\.containsMouse \|\| percentMouse\.containsMouse \|\| root\.pageFocusVisible \|\| pageMouse\.containsMouse/,
    );
    assert.match(volume, /text:\s*root\.available \? `Volume \$\{root\.volume\}%\$\{root\.muted \? " \(muted\)" : ""\}` : "Volume unavailable"/);
});

test("Brightness sits between Volume and Wired, refreshes on open, and never raises the OSD itself", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const brightness = source("modules/Brightness.qml");

    assert.ok(
        quickSettings.indexOf("Volume {") < quickSettings.indexOf("Brightness {")
            && quickSettings.indexOf("Brightness {") < quickSettings.indexOf("NetworkQuickSettings {"),
        "Brightness belongs immediately after Volume and before network Tiles",
    );
    assert.match(quickSettings, /onShownChanged:[\s\S]*BacklightService\.refresh\(\)/);

    assert.match(brightness, /readonly property bool available:\s*BacklightService\.available/);
    assert.match(brightness, /readonly property int percent:\s*BacklightService\.requested/);
    assert.match(brightness, /visible:\s*root\.available/);
    assert.doesNotMatch(brightness, /Tile\s*{|QuickSettingsPage|chevron|StatusCluster/i);

    assert.match(brightness, /BacklightService\.setAbsolute/);
    assert.match(brightness, /Key_Left \|\| event\.key === Qt\.Key_Down[\s\S]*root\.setBrightness\(root\.percent - 5\)/);
    assert.match(brightness, /Key_Right \|\| event\.key === Qt\.Key_Up[\s\S]*root\.setBrightness\(root\.percent \+ 5\)/);
    assert.match(brightness, /Key_Home[\s\S]*root\.setBrightness\(0\)/);
    assert.match(brightness, /Key_End[\s\S]*root\.setBrightness\(100\)/);
    assert.match(brightness, /onWheel:[\s\S]*root\.setBrightness\(root\.percent \+ 5\)[\s\S]*root\.setBrightness\(root\.percent - 5\)/);
    assert.match(brightness, /activeFocusOnTab:\s*root\.available && root\.visible/);
});

test("Devcontainer routing uses a Tile and a dedicated Page", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const tile = source("modules/DevcontainerRoutingTile.qml");
    const page = source("modules/DevcontainerRoutingPage.qml");

    assert.match(quickSettings, /enum Page \{[\s\S]*Devcontainer[\s\S]*\}/);
    assert.match(quickSettings, /DevcontainerRoutingState\s*\{\s*id:\s*devcontainerRouting/);
    assert.match(quickSettings, /DevcontainerRoutingTile\s*\{[\s\S]*routingState:\s*devcontainerRouting[\s\S]*onPageRequested:[\s\S]*QuickSettings\.Devcontainer/);
    assert.match(quickSettings, /DevcontainerRoutingPage\s*\{[\s\S]*routingState:\s*devcontainerRouting/);
    assert.doesNotMatch(quickSettings, /DevcontainerRoutingRow/);
    assert.equal(fs.existsSync(path.join(dotfilesRoot, "modules/DevcontainerRoutingRow.qml")), false);

    assert.match(tile, /label:\s*root\.routingState\.routingEnabled\s*&&\s*root\.routingState\.customHost\s*\?\s*root\.routingState\.customHost\s*:\s*"Devcontainer"/,
        "the generic label is the fallback, not the label: a pill still reading "
        + "\"Devcontainer\" once a host is committed is what #80 fixed, and one reading a "
        + "host while routing is off claims a route that does not exist");
    assert.match(tile, /active:\s*root\.routingState\.routingEnabled/);
    assert.match(tile, /busy:\s*root\.routingState\.busy/);
    assert.match(tile, /onClicked:\s*root\.routingState\.toggle\(\)/);
    assert.match(tile, /chevronVisible:\s*true/);

    assert.match(page, /title:\s*"Devcontainer"/);
    assert.match(page, /TextInput\s*\{/);
    assert.match(page, /onAccepted:\s*root\.commitHost\(\)/);
    assert.match(page, /if \(!activeFocus && root\.routingState\.routingEnabled\)/);
    assert.match(page, /root\.routingState\.commitHost\(hostInput\.text\)/);
});

test("Devcontainer routing settles from the file and serializes writes", () => {
    const state = source("DevcontainerRoutingState.qml");

    assert.match(state, /readonly property bool busy:\s*toggleProcess\.running/);
    assert.match(state, /if \(root\.busy\)\s*return/);
    assert.match(state, /toggleProcess\.running\s*=\s*true/);
    assert.match(state, /onExited:\s*root\.toggleFile\.reload\(\)/);
    assert.match(state, /onLoaded:\s*root\.routingEnabled\s*=\s*true/);
    assert.match(state, /onLoadFailed:\s*root\.routingEnabled\s*=\s*false/);
    assert.match(state, /onFileChanged:\s*reload\(\)/);
    assert.doesNotMatch(state, /execDetached/);
});

test("Bluetooth is an optional Tile with authoritative adapter state", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const availability = source("BluetoothAvailability.qml");
    const runtime = source("modules/BluetoothRuntime.qml");
    const tile = source("modules/Tile.qml");

    assert.doesNotMatch(quickSettings, /import Quickshell\.Bluetooth/);
    assert.match(quickSettings, /BluetoothAvailability\.available/);
    assert.match(quickSettings, /source:\s*"BluetoothRuntime\.qml"/);
    assert.match(quickSettings, /enum Page \{[\s\S]*Bluetooth[\s\S]*\}/);
    assert.match(availability, /busctl.*org\.bluez/);
    assert.match(availability, /root\.available\s*=\s*exitCode === 0/);
    assert.match(runtime, /import Quickshell\.Bluetooth/);
    assert.match(runtime, /Bluetooth\.defaultAdapter/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*visible:[\s\S]*bluetoothAdapter/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*active:[\s\S]*bluetoothAdapter\.enabled/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*enabled:[\s\S]*bluetoothAdapter/);
    assert.match(quickSettings, /bluetoothTogglePending/);
    assert.match(quickSettings, /setBluetoothEnabled[\s\S]*bluetoothTogglePending[\s\S]*return/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*busy:[\s\S]*bluetoothTogglePending/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*onClicked:[\s\S]*setBluetoothEnabled/);
    assert.match(quickSettings, /bluetoothTile[\s\S]*onChevronClicked:[\s\S]*QuickSettings\.Bluetooth/);
    assert.doesNotMatch(quickSettings, /BluetoothItem\s*{/);
    assert.equal(fs.existsSync(path.join(dotfilesRoot, "modules/BluetoothItem.qml")), false);
    assert.match(tile, /elide:\s*Text\.ElideRight/);
    assert.match(tile, /Tooltip\s*{[\s\S]*text:\s*root\.label/);
});

test("Bluetooth Page operates on paired devices and keeps authenticated pairing external", () => {
    const quickSettings = source("modules/QuickSettings.qml");
    const bluetoothPage = source("modules/BluetoothPage.qml");

    assert.match(quickSettings, /id:\s*bluetoothPageLoader[\s\S]*source:\s*"BluetoothPage\.qml"/);
    assert.match(bluetoothPage, /title:\s*"Bluetooth"/);
    assert.match(bluetoothPage, /Bluetooth\.devices\.values[\s\S]*\.filter\([\s\S]*paired/);
    assert.match(bluetoothPage, /device\.connect\(\)/);
    assert.match(bluetoothPage, /device\.disconnect\(\)/);
    assert.match(bluetoothPage, /device\.forget\(\)/);
    assert.match(bluetoothPage, /overflowVisible:[\s\S]*modelData\.paired/);
    assert.match(bluetoothPage, /onRightClicked:/);
    assert.match(bluetoothPage, /onOverflowClicked:/);
    assert.match(bluetoothPage, /label:\s*"Forget"/);
    assert.match(bluetoothPage, /Quickshell\.execDetached\(\["ghostty", "-e", "bluetui"\]\)/);
    assert.match(bluetoothPage, /root\.closeRequested\(\)/);
    assert.doesNotMatch(bluetoothPage, /device\.pair\(\)/);
});

test("Tailscale is an availability-aware Tile in the shared grid", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(source("modules/NetworkQuickSettings.qml"), /readonly property bool available/);
    assert.match(quickSettings, /id:\s*tileGrid[\s\S]*height:\s*tileGrid\.visible \? tileGrid\.implicitHeight : 0/);
    assert.match(source("modules/NetworkQuickSettings.qml"), /id:\s*wifiTile[\s\S]*visible:\s*root\.wifiDevice !== null/);
    assert.match(quickSettings, /id:\s*tailscaleTile[\s\S]*visible:\s*TailscaleService\.installed[\s\S]*icon:\s*TailscaleService\.icon[\s\S]*label:\s*TailscaleService\.tailnet\s*\|\|\s*"Tailscale"[\s\S]*active:\s*TailscaleService\.connected[\s\S]*busy:\s*TailscaleService\.busy[\s\S]*chevronVisible:\s*true[\s\S]*onClicked:\s*TailscaleService\.toggle\(\)/);
    assert.doesNotMatch(quickSettings, /TailscaleRow/);
});

test("The Tailscale Tile's chevron opens the Page and requests enable without gating on it", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(
        quickSettings,
        /id:\s*tailscaleTile[\s\S]*onChevronClicked:\s*keyboard\s*=>\s*\{[\s\S]*root\.navigate\(QuickSettings\.Tailscale,\s*keyboard\)[\s\S]*TailscaleService\.enable\(\)[\s\S]*\}/,
    );
    assert.match(quickSettings, /enum Page \{[\s\S]*Tailscale[\s\S]*\}/);
    assert.match(quickSettings, /TailscalePage\s*\{[\s\S]*id:\s*tailscalePage/);
    assert.match(
        quickSettings,
        /id:\s*tailscalePage[\s\S]*active:\s*root\.shown && root\.currentPage === QuickSettings\.Tailscale[\s\S]*onBack:\s*keyboard\s*=>\s*root\.showPrimary\(keyboard\)/,
    );
    assert.match(quickSettings, /root\.currentPage === QuickSettings\.Tailscale[\s\S]*return tailscalePage\.implicitHeight/);
    assert.match(quickSettings, /root\.currentPage === QuickSettings\.Tailscale\s*\)\s*\n\s*tailscalePage\.focusHeader\(\)/);
});

test("TailscaleService, not the Page, owns Profile loading and normalized Profile state", () => {
    const service = source("TailscaleService.qml");
    const page = source("modules/TailscalePage.qml");

    assert.match(service, /property var profiles: \[\]/);
    assert.match(service, /property string profilesState: ""/);
    assert.match(service, /property string profilesMessage: ""/);
    assert.match(service, /readonly property bool profilesLoading:\s*profilesProc\.running/);
    assert.match(service, /function loadProfiles\(\): void \{/);
    assert.match(service, /function enable\(\): void \{/);
    assert.match(service, /id:\s*profilesProc[\s\S]*command:\s*\["df-tailscale", "profiles"\]/);
    assert.match(service, /Model\.classifyProfiles\(exitCode, profilesStdout\.text, profilesStderr\.text\)/);
    assert.match(service, /Model\.mergeProfilesResult\(/);
    assert.doesNotMatch(service, /Timer\s*\{[\s\S]*profilesProc\.running\s*=\s*true/,
        "Profile loading must not be polled; it refreshes only when the Page opens");

    assert.doesNotMatch(page, /property var profiles:\s*\[\]/,
        "the Page must read Profile state from the singleton, not keep its own copy");
    assert.match(page, /TailscaleService\.loadProfiles\(\)/);
    assert.match(page, /TailscaleService\.profiles/);
    assert.match(page, /TailscaleService\.profilesState/);
});

test("Tailscale Page renders Rows for every visible Profile state", () => {
    const page = source("modules/TailscalePage.qml");

    assert.match(page, /title:\s*"Tailscale"/);
    assert.match(page, /onActiveChanged:\s*\{[\s\S]*if \(root\.active\)[\s\S]*TailscaleService\.loadProfiles\(\)/);

    assert.match(
        page,
        /Repeater\s*\{[\s\S]*model:\s*TailscaleService\.profiles\b[\s\S]*delegate:\s*PageRow\s*\{/,
    );
    assert.doesNotMatch(page, /model:\s*TailscaleService\.profilesState === "ready"/,
        "a failed refresh retains the last useful list, so Rows are not gated on the state");
    assert.match(page, /icon:\s*modelData\.current \? "✓" : "○"/);
    assert.match(page, /label:\s*modelData\.label[\s\S]*current:\s*modelData\.current/);

    assert.match(page, /visible:\s*TailscaleService\.profilesState === "empty"[\s\S]*label:\s*TailscaleService\.profilesMessage/);
    assert.match(page, /visible:\s*TailscaleService\.profilesState === "unsupported"[\s\S]*label:\s*TailscaleService\.profilesMessage/);
    assert.match(page, /visible:\s*TailscaleService\.profilesState === "daemon-failure"[\s\S]*label:\s*TailscaleService\.profilesMessage/);
    assert.match(page, /visible:\s*TailscaleService\.profilesState === "malformed"[\s\S]*label:\s*TailscaleService\.profilesMessage/);

    const code = page.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /login|Login|account.?management|peer|exit.?node|Taildrop/i);
});

test("TailscaleService owns the switch/connect transition, unbound from any Page's lifetime", () => {
    const service = source("TailscaleService.qml");

    assert.match(service, /property string switchingProfileId: ""/);
    assert.match(service, /readonly property bool switching:\s*switchingProfileId !== ""/);
    assert.match(service, /function switchProfile\(id: string\): void \{/);

    // transition locking: a second activation while any transition is running
    // is refused -- busy, not switching, so a chevron-started connect counts
    assert.match(service, /function switchProfile\(id: string\): void \{[\s\S]{0,200}if \(busy \|\| !id\)\s*\n\s*return;/);
    assert.doesNotMatch(service, /if \(switching \|\| !id\)/);

    // activating the current Profile only (re)connects, and is a true no-op once connected
    assert.match(
        service,
        /const current = Model\.currentProfile\(root\.profiles\);[\s\S]*if \(current && current\.id === id\) \{[\s\S]*if \(root\.connected\)[\s\S]*return;[\s\S]*connectProc\.running = true;/,
    );
    // a non-current Profile switches by ID first
    assert.match(service, /switchProc\.command = \["df-tailscale", "switch", id\];[\s\S]*switchProc\.running = true;/);

    // refresh after every attempt: both Processes' onExited call loadProfiles()
    assert.match(
        service,
        /id:\s*switchProc[\s\S]*onExited:[\s\S]*if \(exitCode === 0\)\s*\{[\s\S]*connectProc\.running = true;[\s\S]*return;[\s\S]*\}[\s\S]*root\.switchingProfileId = "";[\s\S]*root\.loadProfiles\(\);/,
    );
    assert.match(
        service,
        /id:\s*connectProc[\s\S]*command:\s*\["df-tailscale", "connect"\][\s\S]*onExited:[\s\S]*root\.switchingProfileId = "";[\s\S]*root\.loadProfiles\(\);/,
    );

    // failure reconciliation: neither Process assigns root.profiles itself --
    // only the mandatory loadProfiles() refresh may change what is shown
    assert.doesNotMatch(service, /switchProc[\s\S]{0,400}root\.profiles\s*=/);
    assert.doesNotMatch(service, /connectProc[\s\S]{0,400}root\.profiles\s*=/);

    // closure survival: switchProc/connectProc's `running` is only ever set
    // imperatively from switchProfile(), never bound to a Page's `active`
    assert.doesNotMatch(service, /switchProc\.running:\s*/);
    assert.doesNotMatch(service, /connectProc\.running:\s*/);
    assert.doesNotMatch(service, /\bactive\b/);
});

test("Tailscale Page Rows are activatable, disabled during a transition, and show progress only on the selected Row", () => {
    const page = source("modules/TailscalePage.qml");

    // busy covers a connect started by the Tile's chevron, not just a Row switch
    assert.match(page, /delegate:\s*PageRow\s*\{[\s\S]*enabled:\s*!TailscaleService\.busy/);
    assert.match(page, /onClicked:\s*TailscaleService\.switchProfile\(modelData\.id\)/);
    assert.match(
        page,
        /detail:\s*modelData\.id === TailscaleService\.switchingProfileId \? "Switching…"/,
    );
    // a Profile stuck on browser authentication shows exactly this, and
    // only on its own Row -- every other Row keeps reading modelData.detail
    assert.match(
        page,
        /modelData\.id === TailscaleService\.failedOperationProfileId && TailscaleService\.failedOperationState === "authentication-required"\) \? "This Profile needs authentication"\s*\n\s*: modelData\.detail/,
    );
    // the current marker itself is untouched by activation -- it only ever
    // reads modelData.current, which comes from the refreshed Profile list
    assert.match(page, /current:\s*modelData\.current/);
    assert.doesNotMatch(page, /current:\s*modelData\.id === TailscaleService\.switchingProfileId/);
});

test("PageRow's current styling layers accent color without dropping the trailing detail", () => {
    const pageRow = source("modules/PageRow.qml");

    assert.match(pageRow, /property bool current: false/);
    assert.match(pageRow, /text:\s*root\.icon\s*\n\s*color:\s*root\.current \? Theme\.accent : Theme\.foreground/);
    assert.match(pageRow, /text:\s*root\.label\s*\n\s*color:\s*root\.current \? Theme\.accent : Theme\.foreground/);
    assert.match(pageRow, /id:\s*detailText[\s\S]*text:\s*root\.detail/,
        "current styling must not remove the detail Text element");
});

// #143: privilege and failure handling for enabling, listing, switching, and
// connecting. See docs/adr/0030-tailscale-privilege-and-failure-handling.md.
// TailscaleService.qml/TailscalePage.qml drive Quickshell, which does not run
// in this test environment (see docs/agents/issue-tracker.md's Host
// verification), so these assert on source shape the same way #142's tests
// already do.

test("TailscaleService tracks a single failed operation for the Retry Row, distinct from Profile-list state", () => {
    const service = source("TailscaleService.qml");

    assert.match(service, /property string failedOperation: ""/);
    assert.match(service, /property string failedOperationProfileId: ""/);
    assert.match(service, /property string failedOperationState: ""/);
    assert.match(service, /property string failedOperationMessage: ""/);
    assert.match(service, /function reportOperationFailure\(operation: string, profileId: string, result: var\): void \{/);
});

test("retryFailedOperation reruns exactly the failed operation, once, and only when called", () => {
    const service = source("TailscaleService.qml");

    assert.match(service, /function retryFailedOperation\(\): void \{/);
    // guarded: refuses while busy, and when there is nothing to retry
    assert.match(
        service,
        /function retryFailedOperation\(\): void \{\s*\n\s*if \(root\.busy \|\| root\.failedOperation === ""\)\s*\n\s*return;/,
    );
    // clears the failure before dispatching, so a second activation before
    // this one resolves finds nothing left to retry
    assert.match(
        service,
        /const operation = root\.failedOperation;[\s\S]*const profileId = root\.failedOperationProfileId;[\s\S]*root\.failedOperation = "";/,
    );
    assert.match(service, /if \(operation === "profiles"\) \{[\s\S]*root\.loadProfiles\(\);/);
    assert.match(
        service,
        /else if \(operation === "switch"\) \{[\s\S]*switchProc\.command = \["df-tailscale", "switch", profileId\];[\s\S]*switchProc\.running = true;/,
    );
    assert.match(
        service,
        /else if \(operation === "connect"\) \{[\s\S]*connectProc\.running = true;/,
    );

    // no automatic retry loop: nothing but retryFailedOperation() itself
    // ever clears a set failedOperation back through this path, and no
    // Timer calls it
    assert.doesNotMatch(service, /Timer\s*\{[\s\S]*retryFailedOperation\(\)/);
});

test("a Profile-list permission or timeout failure is retained and retryable, distinct from #142's own inline states", () => {
    const service = source("TailscaleService.qml");
    const model = fs.readFileSync(
        path.join(dotfilesRoot, "modules/lib/tailscale.js"),
        "utf8",
    );

    assert.match(
        service,
        /if \(Model\.isRetryableState\(result\.state\)\) \{[\s\S]*root\.reportOperationFailure\("profiles", "", result\);[\s\S]*\} else if \(root\.failedOperation === "profiles"\) \{[\s\S]*root\.failedOperation = "";/,
    );
    assert.match(model, /function isRetryableState\(state\) \{/);
    // retryable is "a later attempt could answer differently": a version fact
    // ("unsupported") and a successful answer ("empty") are not
    assert.match(model, /function isRetryableState\(state\) \{[\s\S]{0,240}state === "permission-cancelled"[\s\S]{0,240}state === "timeout"[\s\S]{0,240}state === "authentication-required"[\s\S]{0,240}state === "daemon-failure"[\s\S]{0,240}state === "malformed"/);
    assert.doesNotMatch(model, /isRetryableState[\s\S]{0,300}state === "unsupported"/);
});

test("switch and connect failures are classified with Model.classifyAction and reported, never silently discarded", () => {
    const service = source("TailscaleService.qml");

    // #143: both Processes now collect stdout/stderr to classify failures,
    // where before neither parsed them at all
    assert.match(service, /id:\s*switchProc[\s\S]{0,200}stdout:\s*StdioCollector\s*\{[\s\S]{0,50}id:\s*switchStdout/);
    assert.match(service, /id:\s*switchProc[\s\S]{0,300}stderr:\s*StdioCollector\s*\{[\s\S]{0,50}id:\s*switchStderr/);
    assert.match(service, /id:\s*connectProc[\s\S]{0,300}stdout:\s*StdioCollector\s*\{[\s\S]{0,50}id:\s*connectStdout/);
    assert.match(service, /id:\s*connectProc[\s\S]{0,400}stderr:\s*StdioCollector\s*\{[\s\S]{0,50}id:\s*connectStderr/);

    assert.match(
        service,
        /Model\.classifyAction\(exitCode, switchStdout\.text, switchStderr\.text\)[\s\S]*root\.reportOperationFailure\("switch", root\.switchingProfileId, result\);/,
    );
    assert.match(
        service,
        /Model\.classifyAction\(exitCode, connectStdout\.text, connectStderr\.text\)[\s\S]*root\.reportOperationFailure\("connect", root\.switchingProfileId, result\);/,
    );
});

test("enabling Tailscale and the Tile's own toggle-on both funnel through connect(), reusing df-tailscale's connect subcommand", () => {
    const service = source("TailscaleService.qml");

    assert.match(service, /function connect\(\): void \{[\s\S]*connectProc\.running = true;/);
    assert.match(service, /function enable\(\): void \{[\s\S]*root\.connect\(\);/);
    assert.match(
        service,
        /function toggle\(\): void \{[\s\S]*if \(root\.connected\) \{[\s\S]*"down"[\s\S]*return;[\s\S]*\}\s*\n\s*root\.connect\(\);/,
    );
    // busy now also covers connectProc and mid-switch, so an enable/toggle
    // cannot overlap a switch or another connect already in flight
    assert.match(service, /readonly property bool busy:\s*toggleProc\.running \|\| connectProc\.running \|\| switching/);
});

test("Page visibility is counted, not a single flag, so a two-monitor session cannot double-notify", () => {
    const service = source("TailscaleService.qml");
    const page = source("modules/TailscalePage.qml");

    assert.match(service, /property int visiblePageCount: 0/);
    assert.match(service, /function pageShown\(\): void \{\s*\n\s*root\.visiblePageCount \+= 1;/);
    assert.match(
        service,
        /function pageHidden\(\): void \{\s*\n\s*root\.visiblePageCount = Math\.max\(0, root\.visiblePageCount - 1\);/,
    );
    assert.match(
        service,
        /function notifyIfHidden\(message: string\): void \{\s*\n\s*if \(root\.visiblePageCount > 0\)\s*\n\s*return;\s*\n\s*Quickshell\.execDetached\(\["notify-send", "-u", "critical", "Tailscale", message\]\);/,
    );

    // every Page instance (one per monitor) registers and unregisters itself
    assert.match(
        page,
        /onActiveChanged:\s*\{\s*\n\s*if \(root\.active\) \{[\s\S]*TailscaleService\.pageShown\(\);[\s\S]*\} else \{[\s\S]*TailscaleService\.pageHidden\(\);/,
    );
    // a monitor unplugged mid-Page must not leave the count stuck above zero,
    // which would mute every later notification
    assert.match(
        page,
        /Component\.onDestruction:\s*\{\s*\n\s*if \(root\.active\)\s*\n\s*TailscaleService\.pageHidden\(\);/,
    );
});

test("a Retry Row appears only once an operation has failed and reruns it on click, never automatically", () => {
    const page = source("modules/TailscalePage.qml");

    assert.match(
        page,
        /visible:\s*TailscaleService\.failedOperation !== ""\s*\n\s*enabled:\s*!TailscaleService\.busy[\s\S]{0,120}label:\s*"Retry"[\s\S]{0,80}onClicked:\s*TailscaleService\.retryFailedOperation\(\)/,
        "the Retry Row is inert while the operation it would rerun is still running",
    );
});

test("switch/connect/enable failures render inline on the Page, without duplicating the Profile-list Row", () => {
    const page = source("modules/TailscalePage.qml");

    assert.match(
        page,
        /visible:\s*TailscaleService\.failedOperation !== "" && TailscaleService\.failedOperation !== "profiles"[\s\S]{0,260}label:\s*TailscaleService\.failedOperationMessage/,
    );
    // a Profile's own Row already says "This Profile needs authentication";
    // the generic Row must not repeat it underneath
    assert.match(
        page,
        /&& !\(TailscaleService\.failedOperationState === "authentication-required"\s*\n\s*&& TailscaleService\.failedOperationProfileId !== ""\)/,
    );
    assert.match(
        page,
        /visible:\s*TailscaleService\.profilesState === "permission-cancelled" \|\| TailscaleService\.profilesState === "timeout"/,
    );
});

test("TailscaleService, bin/df-tailscale, and the Tailscale Page never grant standing operator access", () => {
    const service = source("TailscaleService.qml");
    const page = source("modules/TailscalePage.qml");
    const command = fs.readFileSync(path.join(dotfilesRoot, "../../../../bin/df-tailscale"), "utf8");

    for (const text of [service, page, command]) {
        assert.doesNotMatch(text, /set\s+--operator/);
        assert.doesNotMatch(text, /NOPASSWD/i);
    }
    // the Page never opens an authentication URL or a browser itself
    assert.doesNotMatch(page, /xdg-open|Qt\.openUrlExternally|login\.tailscale\.com/i);
});
