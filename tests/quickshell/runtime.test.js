const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");

// Each step waits for its condition under a deadline rather than a fixed
// tick, then the fixture reports and quits itself.
const fixture = `
import QtQuick
import Quickshell
import qs.modules
import qs.launcher.modules as Providers

ShellRoot {
    id: root

    function check(condition, message): void {
        if (!condition)
            root.finish("RUNTIME FAIL " + message);
    }

    property bool done: false
    function finish(result): void {
        if (root.done)
            return;
        root.done = true;
        console.log(result);
        Qt.quit();
    }

    property int stepIndex: 0
    property int waited: 0
    readonly property var steps: [
        {
            name: "shared shell compiles",
            ready: () => true,
            run: () => {
                const desktop = Qt.createComponent("Desktop.qml");
                root.check(desktop.status === Component.Ready, desktop.errorString());
                root.check(eagerRetention.retained && root.eagerRefreshes === 1,
                           "initially selected provider did not refresh exactly once");
                root.check(!retention.retained && root.refreshes === 0, "startup eagerly refreshed");
                root.check(clipboard.catalog.entries.length === 0, "startup populated clipboard");
                root.selected = true;
                root.check(retention.retained && root.refreshes === 1, "selection did not refresh");
                root.selected = false;
                root.check(retention.retained, "retention released before its grace period");
                root.selected = true;
                root.selected = false;
            }
        },
        {
            name: "retention expires",
            ready: () => !retention.retained,
            run: () => {
                root.check(root.refreshes === 2, "reselect did not refresh once");
                listing.retained = true;
                listing.request();
                listing.request();
                root.check(listing.pending, "a request during a run was dropped");
            }
        },
        {
            name: "queued listing runs once",
            ready: () => root.listingStarts === 2 && !listing.running && root.lastSettled === "done\\n",
            run: () => {
                root.check(!listing.pending, "queued request ran more than once");
                commandListing.retained = true;
                commandListing.request(["sh", "-c", "sleep 0.1; echo first"]);
                commandListing.request(["sh", "-c", "echo stale"]);
                commandListing.request(["sh", "-c", "echo latest"]);
            }
        },
        {
            name: "latest queued command wins",
            ready: () => root.commandSettled === "latest\\n" && !commandListing.running,
            run: () => {
                root.check(!root.staleRan, "a superseded queued command ran");
                listing.request();
                root.check(listing.running, "listing did not start");
                listing.retained = false;
                root.check(root.lastSettled === "", "expired listing kept its output");
            }
        },
        {
            name: "expired listing stops",
            ready: () => !listing.running,
            run: () => {
                root.check(listing.text === "", "expired listing kept its collector");
                root.selected = true;
            }
        },
        {
            name: "clipboard lists on selection",
            ready: () => clipboard.catalog.entries.length === 1,
            run: () => root.selected = false
        },
        {
            name: "clipboard releases after expiry",
            ready: () => !clipboard.retention.retained,
            run: () => {
                root.check(clipboard.catalog.entries.length === 0 && clipboard.listingText === "",
                           "expiry retained the prepared catalog");
                root.check(clipboard.finder.text === "", "completed stdout buffer survived expiry");
                root.pageShown = true;
                root.currentPage = 1;
                root.check(surface.item !== null, "current page did not load");
            }
        },
        {
            name: "page fades in",
            ready: () => surface.opacity === 1,
            run: () => {
                root.currentPage = 0;
                root.check(surface.item !== null, "page unloaded before its exit fade");
            }
        },
        {
            name: "page fades out",
            ready: () => surface.opacity > 0 && surface.opacity < 1,
            run: () => root.check(surface.item !== null, "page unloaded during its exit fade")
        },
        {
            name: "page unloads after its exit fade",
            ready: () => surface.item === null && surface.opacity === 0,
            run: () => {
                root.currentPage = 1;
                root.check(surface.item !== null, "page did not reload on navigation");
                root.pageShown = false;
                root.check(surface.item === null, "closing the panel did not release the page at once");
            }
        },
    ]

    Timer {
        interval: 20
        repeat: true
        running: true
        onTriggered: {
            if (root.done)
                return;
            const step = root.steps[root.stepIndex];
            if (!step.ready()) {
                root.waited += interval;
                if (root.waited > 3000)
                    root.finish("RUNTIME FAIL timed out waiting for: " + step.name);
                return;
            }
            root.waited = 0;
            step.run();
            root.stepIndex += 1;
            if (root.stepIndex === root.steps.length)
                root.finish("RUNTIME PASS");
        }
    }

    property bool selected: false
    property int refreshes: 0
    Providers.ProviderRetention {
        id: retention
        selected: root.selected
        releaseDelay: 60
        onRefreshRequested: root.refreshes += 1
    }

    property int eagerRefreshes: 0
    Providers.ProviderRetention {
        id: eagerRetention
        selected: true
        onRefreshRequested: root.eagerRefreshes += 1
    }

    property int listingStarts: 0
    property string lastSettled: "unset"
    Providers.ListingProcess {
        id: listing
        retained: false
        command: ["sh", "-c", "sleep 0.1; echo done"]
        onStarted: root.listingStarts += 1
        onSettled: output => root.lastSettled = output
    }

    property string commandSettled: ""
    property bool staleRan: false
    Providers.ListingProcess {
        id: commandListing
        retained: false
        onSettled: output => {
            root.commandSettled = output;
            if (output === "stale\\n")
                root.staleRan = true;
        }
    }

    Providers.Clipboard {
        id: clipboard
        catalogSelected: root.selected
        Component.onCompleted: clipboard.retention.releaseDelay = 60
    }

    property bool pageShown: false
    property int currentPage: 0
    QuickSettingsPageSurface {
        id: surface
        width: 100
        height: 100
        page: 1
        currentPage: root.currentPage
        shown: root.pageShown
        sourceComponent: Item {}
    }
}
`;

test("shared shell compiles, and provider retention, listings and Quick Settings pages release on time", t => {
    if (!process.env.WAYLAND_DISPLAY || !process.env.XDG_RUNTIME_DIR) {
        t.skip("requires the Quickshell Wayland backend");
        return;
    }
    const binary = spawnSync("quickshell", ["-V"]);
    if (binary.error?.code === "ENOENT") {
        t.skip("quickshell is unavailable");
        return;
    }
    assert.ifError(binary.error);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qs-runtime-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const config = path.join(directory, "config");
    const bin = path.join(directory, "bin");
    fs.cpSync(path.join(root, "quickshell/.config/quickshell/dotfiles"), config, { recursive: true });
    fs.renameSync(path.join(config, "shell.qml"), path.join(config, "Desktop.qml"));
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "cliphist"), "#!/bin/sh\nsleep 0.2\nprintf '1\\tfixture entry\\n'\n", { mode: 0o755 });
    fs.writeFileSync(path.join(config, "shell.qml"), fixture);

    const result = spawnSync("timeout", ["--signal=TERM", "--kill-after=2", "30", "quickshell", "-p", config, "--no-color"], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, QS_DISABLE_FILE_WATCHER: "1", QS_NO_RELOAD_POPUP: "1" },
        encoding: "utf8",
        timeout: 40000,
    });
    assert.ifError(result.error);
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, /RUNTIME FAIL|failed to load configuration|TypeError|ReferenceError|Duplicate property/i);
    assert.match(output, /RUNTIME PASS/);
});
