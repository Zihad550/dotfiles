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

    assert.ok(
        quickSettings.indexOf("WiredStatus {") < quickSettings.indexOf("id: tileGrid"),
        "Wired status belongs above the Tile grid",
    );
    assert.doesNotMatch(quickSettings, /legacyRows|WiredRow/);
    assert.match(quickSettings, /id:\s*wifiTile[\s\S]*id:\s*bluetoothTile[\s\S]*id:\s*tailscaleTile[\s\S]*id:\s*devcontainerTile/);
    assert.match(quickSettings, /wifiTile[\s\S]*navigationContainer:\s*tileGrid/);
    assert.match(tile, /Key_Left[\s\S]*Key_Right[\s\S]*Key_Up[\s\S]*Key_Down/);
    assert.match(tile, /mapToItem\(root\.navigationContainer/);
    assert.match(audioPage, /reconnectTimer\.stop\(\)[\s\S]*sinkList\.running\s*=\s*false/);
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
    assert.match(quickSettings, /lockAction[\s\S]*Quickshell\.execDetached\(\["hyprlock"\]\)[\s\S]*root\.dismiss\(\)/);
    assert.match(quickSettings, /powerAction[\s\S]*root\.navigate\(QuickSettings\.Power/);
});

test("Power Page keeps existing actions in their established order", () => {
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(quickSettings, /enum Page \{[\s\S]*Primary,[\s\S]*Wifi,[\s\S]*Power[\s\S]*\}/);
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
            && quickSettings.indexOf("Brightness {") < quickSettings.indexOf("WiredStatus {"),
        "Brightness belongs immediately after Volume and before Wired status",
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

    assert.match(quickSettings, /id:\s*tileGrid[\s\S]*visible:\s*root\.wifiDevice !== null \|\| TailscaleService\.installed/);
    assert.match(quickSettings, /id:\s*tileGrid[\s\S]*height:\s*tileGrid\.visible \? tileGrid\.implicitHeight : 0/);
    assert.match(quickSettings, /id:\s*wifiTile[\s\S]*visible:\s*root\.wifiDevice !== null/);
    assert.match(quickSettings, /id:\s*tailscaleTile[\s\S]*visible:\s*TailscaleService\.installed[\s\S]*icon:\s*TailscaleService\.icon[\s\S]*label:\s*TailscaleService\.tailnet\s*\|\|\s*"Tailscale"[\s\S]*active:\s*TailscaleService\.connected[\s\S]*busy:\s*TailscaleService\.busy[\s\S]*chevronVisible:\s*false[\s\S]*onClicked:\s*TailscaleService\.toggle\(\)/);
    assert.doesNotMatch(quickSettings, /TailscaleRow/);
});
