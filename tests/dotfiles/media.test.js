const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const media = require("../../quickshell/.config/quickshell/dotfiles/media/MediaModel.js");

const servicePath = path.join(__dirname, "../../quickshell/.config/quickshell/dotfiles/media/Service.qml");

// Execute the original QML service's JavaScript methods with controlled players.
function service(players) {
    const context = {
        MediaModel: media, players, playbackStreams: [], preferredPlayerKey: "",
        playerStartedAt: {}, playSerial: 0, shell: null,
        Qt: { callLater: callback => callback() }
    };
    context.root = context;
    vm.createContext(context);
    const functions = fs.readFileSync(servicePath, "utf8").match(/^  function [\s\S]*?^  }/gm);
    vm.runInContext(functions.join("\n"), context);
    Object.defineProperties(context, {
        activePlayer: { get: () => context.selectActivePlayer() },
        sourcePlayers: { get: () => context.orderedSourcePlayers() },
        sourceCyclePlayers: { get: () => context.orderedCycleSourcePlayers() }
    });
    context.syncPlayingOrder();
    return context;
}

function player(name, playing) {
    return {
        dbusName: name, identity: name, trackTitle: name, isPlaying: playing,
        canPlay: true, canPause: true, canTogglePlaying: true, canGoNext: true,
        play() { this.isPlaying = true; },
        pause() { this.isPlaying = false; },
        next() { this.nextCalled = true; }
    };
}

test("empty player list has no active player and cannot handle playback", () => {
    const state = service([]);
    assert.equal(state.activePlayer, null);
    assert.equal(state.runAction("playPause", false), false);
});

test("playing selection wins display, but global pause targets oldest playing player", () => {
    const mpv = player("mpv", true);
    const browser = player("browser", true);
    const state = service([mpv, browser]);
    assert.equal(state.activePlayer, mpv);
    state.selectPlayer("browser");
    assert.equal(state.activePlayer, browser);
    state.runAction("playPause", false);
    assert.equal(mpv.isPlaying, false);
    assert.equal(browser.isPlaying, true);
});

test("popup targeted actions control the displayed player", () => {
    const mpv = player("mpv", true);
    const browser = player("browser", true);
    const state = service([mpv, browser]);
    state.runAction("playPause", false, "browser");
    assert.equal(browser.isPlaying, false);
    assert.equal(mpv.isPlaying, true);
});

test("selecting a paused player does not displace a playing player", () => {
    const mpv = player("mpv", true);
    const browser = player("browser", false);
    const state = service([mpv, browser]);
    state.selectPlayer("browser");
    assert.equal(state.activePlayer, mpv);
});

test("a playing player with an audio stream outranks one without a stream", () => {
    const state = service([player("browser", true), player("mpv", true)]);
    state.playbackStreams = [{ ready: true, properties: { "application.name": "mpv" } }];
    assert.equal(state.activePlayer.identity, "mpv");
});

test("source switching transfers playback and player removal clears preference", () => {
    const browser = player("browser", true);
    const mpv = player("mpv", false);
    const state = service([browser, mpv]);
    assert.equal(state.switchSource(1, true, false), true);
    assert.equal(browser.isPlaying, false);
    assert.equal(mpv.isPlaying, true);
    assert.equal(state.preferredPlayerKey, "mpv");
    state.players = [browser];
    state.syncPlayingOrder();
    assert.equal(state.preferredPlayerKey, "");
});

test("media defaults are idempotent and preserve unrelated MIME associations", () => {
    const home = fs.mkdtempSync("/tmp/dotfiles-media-test-");
    try {
        const config = path.join(home, ".config");
        fs.mkdirSync(config);
        const mimeFile = path.join(config, "mimeapps.list");
        fs.writeFileSync(mimeFile, "[Default Applications]\ntext/plain=editor.desktop\nvideo/mp4=old.desktop\n");
        const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_DATA_HOME: path.join(home, ".local/share") };
        const setup = path.join(__dirname, "../../setup/arch-workstation/setup-packages/setup-media");
        execFileSync("bash", [setup], { env });
        const first = fs.readFileSync(mimeFile, "utf8");
        execFileSync("bash", [setup], { env });
        assert.equal(fs.readFileSync(mimeFile, "utf8"), first);
        assert.match(first, /text\/plain=editor.desktop/);
        assert.match(first, /video\/mp4=mpv.desktop/);
        assert.match(first, /video\/webm=mpv.desktop/);
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
