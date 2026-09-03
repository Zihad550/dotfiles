// Calendar and Quick Settings integration seams.
//
// The QML runtime needs a Wayland compositor, so these checks assert the
// public wiring and exercise the small state helper directly. They avoid
// matching delegate order, animation details, or other incidental QML shape.

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const dotfilesRoot = path.join(repoRoot, "quickshell/.config/quickshell/dotfiles");
const coordinatorPath = path.join(dotfilesRoot, "BarPanelCoordinator.qml");
const panelState = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/barPanel.js");

function source(relativePath) {
    return fs.readFileSync(path.join(dotfilesRoot, relativePath), "utf8");
}

function run(command, args, options = {}) {
    return childProcess.spawnSync(command, args, {
        cwd: repoRoot,
        encoding: "utf8",
        ...options,
    });
}

test("each Bar popup stays with the window that owns its trigger", () => {
    const calendar = source("modules/CalendarPanel.qml");
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(calendar, /anchor\.item\s*:\s*root\.target/);
    assert.match(calendar, /anchor\.adjustment\s*:\s*PopupAdjustment\.Slide/);
    assert.doesNotMatch(calendar, /anchor\.window\s*:/,
        "setting anchor.window would unset the monitor-owning anchor.item");
    assert.doesNotMatch(calendar, /^\s*screen\s*:/m,
        "PopupWindow owns its screen through the anchored parent window");

    assert.match(quickSettings, /anchor\.item\s*:\s*root\.target/);
    assert.doesNotMatch(quickSettings, /anchor\.window\s*:/);
});

test("both popups bound their size to the monitor and keep overflow scrollable", () => {
    const calendar = source("modules/CalendarPanel.qml");
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(calendar, /availableWidth[\s\S]*screen\.width[\s\S]*Math\.max\(1/);
    assert.match(calendar, /availableHeight[\s\S]*screen\.height[\s\S]*Theme\.barHeight/);
    assert.match(calendar, /implicitWidth\s*:\s*Math\.min\([\s\S]*root\.availableWidth/);
    assert.match(calendar, /implicitHeight\s*:\s*Math\.min\([\s\S]*root\.availableHeight/);
    assert.match(calendar, /Flickable\s*\{[\s\S]*contentWidth\s*:\s*calendarColumn\.width[\s\S]*contentHeight\s*:\s*calendarColumn\.implicitHeight[\s\S]*clip\s*:\s*true/);
    assert.match(calendar, /ScrollBar\.horizontal:[\s\S]*ScrollBar\.AsNeeded/);
    assert.match(calendar, /ScrollBar\.vertical:[\s\S]*ScrollBar\.AsNeeded/);

    assert.match(quickSettings, /monitorWidth[\s\S]*screen\.width[\s\S]*Math\.max\(1/);
    assert.match(quickSettings, /monitorAvailableHeight[\s\S]*screen\.height[\s\S]*Theme\.barHeight/);
    assert.match(quickSettings, /implicitWidth\s*:\s*Math\.min\([\s\S]*root\.monitorWidth/);
    assert.match(quickSettings, /implicitHeight\s*:\s*Math\.min\([\s\S]*root\.monitorAvailableHeight/);
    assert.match(quickSettings, /Flickable\s*\{[\s\S]*contentHeight\s*:\s*primaryContent\.implicitHeight[\s\S]*clip\s*:\s*true/);
});

test("Bar panels claim one focus owner in either opening direction", () => {
    const calendar = source("modules/CalendarPanel.qml");
    const quickSettings = source("modules/QuickSettings.qml");
    const coordinator = fs.readFileSync(coordinatorPath, "utf8");

    assert.match(coordinator, /property var activePanel/);
    assert.match(coordinator, /function claim\s*\(panel/);
    assert.match(coordinator, /root\.activePanel\s*=\s*panel/);
    assert.match(coordinator, /previous\.shown[\s\S]*typeof previous\.dismiss === "function"[\s\S]*previous\.dismiss\(\)/);
    assert.match(coordinator, /function release\s*\(panel/);
    assert.match(calendar, /function open\(\)[\s\S]*BarPanelCoordinator\.claim\(root\)[\s\S]*root\.shown\s*=\s*true/);
    assert.match(quickSettings, /function toggle\(keyboardFocus[\s\S]*BarPanelCoordinator\.claim\(root\)[\s\S]*root\.shown\s*=\s*true/);
    assert.match(calendar, /onShownChanged[\s\S]*BarPanelCoordinator\.release\(root\)/);
    assert.match(quickSettings, /onShownChanged[\s\S]*BarPanelCoordinator\.release\(root\)/);
});

test("focus-grab dismissal suppresses the click that caused it", () => {
    const calendar = source("modules/CalendarPanel.qml");
    const quickSettings = source("modules/QuickSettings.qml");

    assert.match(calendar, /onCleared[\s\S]*root\.lastCleared\s*=\s*Date\.now\(\)/);
    assert.match(quickSettings, /onCleared[\s\S]*root\.lastCleared\s*=\s*Date\.now\(\)/);
    assert.match(calendar, /BarPanel\.shouldSuppressReopen\(root\.lastCleared,\s*Date\.now\(\)\)/);
    assert.match(quickSettings, /BarPanel\.shouldSuppressReopen\(root\.lastCleared,\s*Date\.now\(\)\)/);

    assert.equal(panelState.shouldSuppressReopen(1000, 1000), true);
    assert.equal(panelState.shouldSuppressReopen(1000, 1000 + panelState.REOPEN_SUPPRESSION_MS - 1), true);
    assert.equal(panelState.shouldSuppressReopen(1000, 1000 + panelState.REOPEN_SUPPRESSION_MS), false);
    assert.equal(panelState.shouldSuppressReopen(1000, 999), false);
});

test("an open calendar follows today across midnight while preserving browsing", () => {
    const calendar = source("modules/CalendarPanel.qml");

    assert.match(calendar, /SystemClock\s*\{[\s\S]*precision\s*:\s*SystemClock\.Minutes/);
    assert.match(calendar, /Calendar\.keyForDate\(clock\.date\)\s*===\s*root\.todayKey/);
    assert.match(calendar, /root\.today\s*=\s*clock\.date/);
    assert.match(calendar, /if \(followToday\)\s*root\.goToToday\(\)/);
    assert.match(calendar, /yearDone:\s*Calendar\.yearProgress\([\s\S]*root\.today\.getFullYear\(\)/);
    assert.match(calendar, /todayKey:\s*Calendar\.keyForDate\(root\.today\)/);
});

test("both open panels use live Theme properties for their surface and text", () => {
    for (const relativePath of ["modules/CalendarPanel.qml", "modules/QuickSettings.qml"]) {
        const panel = source(relativePath);
        assert.match(panel, /Theme\.background/);
        assert.match(panel, /Theme\.foreground/);
        assert.doesNotMatch(panel, /property\s+(?:color|string)\s+(?:background|foreground|accent)\s*:/);
    }

    assert.match(source("modules/CalendarPanel.qml"), /Theme\.accent/);
    assert.match(source("modules/QuickSettings.qml"), /Theme\.(?:ok|warn|error)/);
});

test("the Quickshell load check is honest when host runtime pieces are absent", () => {
    const script = path.join(repoRoot, "bin/df-qs-load-check");
    const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), "df-qs-empty-")).toString();
    try {
        const missingBinary = run("/bin/bash", [script], { env: { PATH: emptyPath } });
        assert.equal(missingBinary.status, 0);
        assert.match(missingBinary.stdout, /^UNAVAILABLE: quickshell binary not found/);

        const noWayland = run("/bin/bash", [script], {
            env: { ...process.env, WAYLAND_DISPLAY: "", XDG_RUNTIME_DIR: "" },
        });
        assert.equal(noWayland.status, 0);
        assert.match(noWayland.stdout, /^UNAVAILABLE:/);

        const missingConfig = run("/bin/bash", [script, path.join(emptyPath, "missing")], {
            env: { ...process.env, WAYLAND_DISPLAY: "", XDG_RUNTIME_DIR: "" },
        });
        assert.equal(missingConfig.status, 1);
        assert.match(missingConfig.stderr, /^FAIL: no shell\.qml/);
    } finally {
        fs.rmSync(emptyPath, { recursive: true, force: true });
    }
});

test("the host handoff names every runtime check and needs-info action", () => {
    const handoff = fs.readFileSync(path.join(repoRoot, "docs/issue-148-calendar-verification.md"), "utf8");
    for (const phrase of [
        "appearance",
        "pointer",
        "keyboard",
        "focus",
        "theme",
        "multi-monitor",
        "constrained",
        "needs-info",
    ]) {
        assert.match(handoff.toLowerCase(), new RegExp(phrase));
    }
    assert.match(handoff, /Pass:/);
});
