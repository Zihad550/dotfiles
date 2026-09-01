// Tests for the Directories Provider's launch coordinator: the directory hint,
// stable application identity, focused-window correlation, and rename result.
//
//     node --test tests/launcher/directorylaunch.test.js

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const D = require("../../quickshell/.config/quickshell/launcher/lib/directories.js");
const L = require("../../quickshell/.config/quickshell/launcher/lib/directorylaunch.js");
const W = require("../../quickshell/.config/quickshell/launcher/lib/workspaces.js");

const HOME = "/home/jehad";

test("directoryHintOf prefers the first issue-bearing token and truncates it", () => {
    const cases = [
        ["frontend", "front"],
        ["fr212", "fr212"],
        ["feature-212-login", "212"],
        ["212-frontend", "212"],
        ["frontend-212", "212"],
        ["API_Server", "api"],
        ["long.project_name", "long"]
    ];

    for (const [basename, expected] of cases)
        assert.strictEqual(L.directoryHintOf(`/tmp/${basename}`), expected, basename);
});

test("directory hints use the basename only, so local and remote paths agree", () => {
    assert.strictEqual(
        L.directoryHintOf(`${HOME}/dev/frontend`),
        L.directoryHintOf(`ssh://arch-devbox${HOME}/dev/frontend`)
    );
    assert.strictEqual(L.directoryHintOf(`ssh://arch-devbox${HOME}/dev/frontend`), "front");
});

test("directory actions carry canonical application identities", () => {
    const apps = D.chooserApps(`${HOME}/dev/frontend`, false, HOME);
    assert.deepStrictEqual(apps.map(app => [app.name, app.application]), [
        ["Herdr", "herdr"],
        ["Zed", "zed"],
        ["VSCode", "code"],
        ["Cursor", "cursor"],
        ["Neovim", "nvim"],
        ["Files", "files"]
    ]);
});

test("a generated Launcher Workspace Name keeps the id, application, and hint", () => {
    assert.strictEqual(L.workspaceNameFor(3, "zed", "front"), "3-zed(front)");
    assert.strictEqual(L.workspaceNameFor("5", "zed", "fr212"), "5-zed(fr212)");
});

test("supported applications match their native and terminal-hosted window ids", () => {
    assert.ok(L.applicationMatches("zed", "dev.zed.Zed"));
    assert.ok(L.applicationMatches("code", "com.visualstudio.code"));
    assert.ok(L.applicationMatches("cursor", "com.todesktop.230313mzl4w4u92"));
    assert.ok(L.applicationMatches("files", "org.gnome.Nautilus"));
    assert.ok(L.applicationMatches("nvim", "com.mitchellh.ghostty"));
    assert.ok(L.applicationMatches("herdr", "com.mitchellh.ghostty"));
    assert.ok(!L.applicationMatches("zed", "com.mitchellh.ghostty"));
});

test("terminal-hosted applications only accept a newly created terminal window", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "nvim" };
    const before = [
        window("0xterminal", "com.mitchellh.ghostty", 4, false),
        window("0xold", "org.mozilla.firefox", 2, true)
    ];
    const after = [
        window("0xterminal", "com.mitchellh.ghostty", 4, true),
        window("0xold", "org.mozilla.firefox", 2, false)
    ];

    assert.strictEqual(L.destinationFor(before, after, request.application), null,
        "an unrelated existing terminal focus is not enough evidence");
});

function window(address, application, workspaceId, focused) {
    return { address, appId: application, workspaceId, workspaceName: String(workspaceId), focused };
}

function runCoordinator(request, snapshots) {
    const before = snapshots[0];
    let state = L.begin(before, request);
    let destination = null;

    for (const snapshot of snapshots.slice(1)) {
        const polled = L.poll(state, snapshot);
        state = polled.state;
        if (polled.done) {
            destination = polled.destination;
            break;
        }
    }

    return destination === null ? null : {
        launch: request.argv,
        argv: W.renameLuaArgv(
            destination.workspaceId,
            L.workspaceNameFor(destination.workspaceId, request.application,
                L.directoryHintOf(request.path))
        ),
        destination: destination
    };
}

test("a newly created focused application window determines the numbered destination", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };
    const result = runCoordinator(request, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false), window("0xnew", "dev.zed.Zed", 3, true)]
    ]);

    assert.deepStrictEqual(result.argv, [
        "hyprctl", "dispatch",
        'hl.dsp.workspace.rename({ workspace = "3", name = "3-zed(front)" })'
    ]);
});

test("an existing application window focused on another workspace wins over the launcher's original workspace", () => {
    const request = { path: `${HOME}/dev/fr212`, application: "zed" };
    const result = runCoordinator(request, [
        [window("0xzed", "dev.zed.Zed", 7, false), window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xzed", "dev.zed.Zed", 7, true), window("0xold", "org.mozilla.firefox", 2, false)]
    ]);

    assert.strictEqual(result.destination.workspaceId, 7);
    assert.strictEqual(result.argv[2],
        'hl.dsp.workspace.rename({ workspace = "7", name = "7-zed(fr212)" })');
});

test("the primary Directory Action uses the shared coordinator and launches Zed", () => {
    const entry = D.entryFor(`${HOME}/dev/frontend`, HOME, null);
    const argv = D.defaultOpenArgv(entry.target.path, false, ["uwsm-app", "--"]);
    const result = runCoordinator({
        path: entry.target.path,
        application: "zed",
        argv: argv
    }, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false), window("0xnew", "dev.zed.Zed", 3, true)]
    ]);

    assert.deepStrictEqual(result.launch, ["uwsm-app", "--", "zeditor", `${HOME}/dev/frontend`]);
    assert.match(result.argv[2], /3-zed\(front\)/);
});

test("every Chooser Action carries the same path and coordinator identity", () => {
    const entries = D.chooserEntriesFor(`${HOME}/dev/frontend`, false, HOME, ["uwsm-app", "--"], null);
    const zed = entries.find(entry => entry.name === "Zed");
    const result = runCoordinator(zed.target, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false), window("0xnew", "dev.zed.Zed", 3, true)]
    ]);

    assert.strictEqual(zed.target.application, "zed");
    assert.deepStrictEqual(result.launch, ["uwsm-app", "--", "zeditor", `${HOME}/dev/frontend`]);
    assert.match(result.argv[2], /3-zed\(front\)/);
});

test("all supported Chooser applications use stable names, including terminal-hosted ones", () => {
    const appIds = {
        herdr: "com.mitchellh.ghostty",
        zed: "dev.zed.Zed",
        code: "com.visualstudio.code",
        cursor: "com.todesktop.230313mzl4w4u92",
        nvim: "com.mitchellh.ghostty",
        files: "org.gnome.Nautilus"
    };
    const entries = D.chooserEntriesFor(`${HOME}/dev/frontend`, false, HOME, ["uwsm-app", "--"], null);

    for (const entry of entries) {
        const result = runCoordinator(entry.target, [
            [window("0xold", "org.mozilla.firefox", 2, true)],
            [window("0xold", "org.mozilla.firefox", 2, false),
                window("0xnew", appIds[entry.target.application], 3, true)]
        ]);
        assert.ok(result, `${entry.name} should produce a destination`);
        assert.match(result.argv[2], new RegExp(`3-${entry.target.application}\\(front\\)`));
    }
});

test("a manually named destination is overwritten by the latest directory launch", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };
    const result = runCoordinator(request, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false),
            { address: "0xnew", appId: "dev.zed.Zed", workspaceId: 3,
                workspaceName: "3-(manual)", focused: true }]
    ]);

    assert.strictEqual(result.destination.workspaceName, "3-(manual)");
    assert.strictEqual(result.argv[2],
        'hl.dsp.workspace.rename({ workspace = "3", name = "3-zed(front)" })');
});

test("a special workspace is never a rename destination", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };
    assert.strictEqual(runCoordinator(request, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false),
            { address: "0xnew", appId: "dev.zed.Zed", workspaceId: -99, workspaceName: "special:zed", focused: true }]
    ]), null);
});

test("wrong-app focus and ambiguous focus never rename a workspace", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };

    assert.strictEqual(runCoordinator(request, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xold", "org.mozilla.firefox", 2, false), window("0xnew", "com.mitchellh.ghostty", 3, true)]
    ]), null);

    assert.strictEqual(runCoordinator(request, [
        [window("0xold", "org.mozilla.firefox", 2, true)],
        [window("0xzed-a", "dev.zed.Zed", 3, true), window("0xzed-b", "dev.zed.Zed", 4, true)]
    ]), null);
});

test("a failed request that leaves its matching window focused does not rename", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };
    assert.strictEqual(runCoordinator(request, [
        [window("0xzed", "dev.zed.Zed", 3, true)],
        [window("0xzed", "dev.zed.Zed", 3, true)]
    ]), null);
});

test("polling times out after three seconds without changing the launch result", () => {
    const request = { path: `${HOME}/dev/frontend`, application: "zed" };
    const before = [window("0xold", "org.mozilla.firefox", 2, true)];
    let state = L.begin(before, request);
    let result = null;

    for (let i = 0; i < L.TIMEOUT_MS / L.POLL_INTERVAL_MS; i++) {
        const polled = L.poll(state, before);
        state = polled.state;
        result = polled;
    }

    assert.strictEqual(result.done, true);
    assert.strictEqual(result.destination, null);
    assert.strictEqual(state, null);
});

test("parallel launches claim different focused windows instead of renaming one twice", () => {
    const before = [window("0xold", "org.mozilla.firefox", 2, true)];
    const first = L.begin(before, { path: `${HOME}/dev/frontend`, application: "zed" });
    const second = L.begin(before, { path: `${HOME}/dev/backend`, application: "zed" });
    const afterFirst = [
        window("0xold", "org.mozilla.firefox", 2, false),
        window("0xfirst", "dev.zed.Zed", 3, true)
    ];

    const firstResult = L.poll(first, afterFirst, {});
    const secondWaiting = L.poll(second, afterFirst, { "0xfirst": true });
    assert.strictEqual(firstResult.destination.identity, "0xfirst");
    assert.strictEqual(secondWaiting.destination, null);
    assert.strictEqual(secondWaiting.done, false);

    const afterSecond = [
        window("0xold", "org.mozilla.firefox", 2, false),
        window("0xfirst", "dev.zed.Zed", 3, false),
        window("0xsecond", "dev.zed.Zed", 5, true)
    ];
    const secondResult = L.poll(secondWaiting.state, afterSecond, {});
    assert.strictEqual(secondResult.destination.identity, "0xsecond");
    assert.strictEqual(secondResult.destination.workspaceId, 5);
});

test("both Directory Action paths call one shared launch coordinator", () => {
    const qmlPath = path.join(__dirname, "../../quickshell/.config/quickshell/launcher/modules/Directories.qml");
    const qml = fs.readFileSync(qmlPath, "utf8");

    assert.match(qml, /function openDefault[\s\S]*?root\.openDirectory\(/);
    assert.match(qml, /function openWith[\s\S]*?root\.openDirectory\(/);
    assert.strictEqual((qml.match(/function openDirectory\(/g) || []).length, 1);
    assert.match(qml, /pendingLaunches/);
    assert.match(qml, /claimed/);
});
