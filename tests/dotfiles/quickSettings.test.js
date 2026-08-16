const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dotfilesRoot = path.resolve(__dirname, "../../quickshell/.config/quickshell/dotfiles");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

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
