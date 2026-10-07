const test = require("node:test");
const assert = require("node:assert");

const Audio = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/audio.js");

test("audio output availability keeps sinks without ports", () => {
    assert.strictEqual(Audio.hasAvailablePort({ name: "speakers", ports: [] }), true);
    assert.strictEqual(Audio.hasAvailablePort({ name: "speakers" }), true);
});

test("audio output availability keeps a sink with any usable port", () => {
    assert.strictEqual(Audio.hasAvailablePort({
        ports: [{ availability: "not available" }, { availability: "unknown" }],
    }), true);
});

test("audio output availability rejects sinks whose every port is unavailable", () => {
    assert.strictEqual(Audio.hasAvailablePort({
        ports: [{ availability: "not available" }, { availability: "not available" }],
    }), false);
});

test("available sink names retain pactl order and drop malformed records", () => {
    assert.deepStrictEqual(Audio.availableSinkNames([
        { name: "hdmi", ports: [{ availability: "not available" }] },
        { name: "headphones", ports: [{ availability: "available" }] },
        { name: "speakers", ports: [] },
        { name: "unknown", ports: [{ availability: "unknown" }] },
        { name: "" },
        null,
    ]), ["headphones", "speakers", "unknown"]);
});

test("stereo slider keeps an explicitly disabled channel silent", () => {
    const channels = ["left", "right"];
    const saved = { left: 0.6 };
    assert.strictEqual(Audio.enabledChannelVolume([0, 0.6], channels, saved), 0.6);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0.6], channels, saved, 0.8), [0, 0.8]);
    assert.deepStrictEqual(saved, { left: 0.6 });
});

test("stereo slider leaves both disabled channels silent, including from zero", () => {
    assert.strictEqual(Audio.enabledChannelVolume([0, 0], ["left", "right"], { left: 0.4, right: 0.7 }), 0);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0], ["left", "right"], { left: 0.4, right: 0.7 }, 1), [0, 0]);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0], ["left", "right"], {}, 0.5), [0.5, 0.5]);
});

test("channel volume changes preserve balance, cap amplification, and support mono", () => {
    const balanced = Audio.setEnabledChannelVolume([0.2, 0.4], ["left", "right"], {}, 0.15);
    assert.ok(Math.abs(balanced[0] - 0.1) < 1e-12);
    assert.ok(Math.abs(balanced[1] - 0.2) < 1e-12);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0.2, 0.4], ["left", "right"], {}, 1), [2 / 3, 1]);
    assert.ok(Math.abs(Audio.setEnabledChannelVolume([0.2], ["mono"], {}, 0.8)[0] - 0.8) < 1e-12);
    assert.strictEqual(Audio.enabledChannelVolume([], [], {}), 0);
});
