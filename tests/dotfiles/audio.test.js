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
    assert.strictEqual(Audio.sharedChannelVolume([0, 0.6], channels, saved), 0.6);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0.6], channels, saved, 0.8), [0, 0.8]);
    assert.deepStrictEqual(saved, { left: 0.6 });
});

test("stereo slider leaves both disabled channels silent, including from zero", () => {
    assert.strictEqual(Audio.sharedChannelVolume([0, 0], ["left", "right"], { left: 0.6, right: 0.6 }), 0.6);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0], ["left", "right"], { left: 0.4, right: 0.7 }, 1), [0, 0]);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0, 0], ["left", "right"], {}, 0.5), [0.5, 0.5]);
});

test("volume changes give enabled channels one shared level, including unequal initial balance", () => {
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0.2, 0.4], ["left", "right"], {}, 0.15), [0.15, 0.15]);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0.2, 0.4], ["left", "right"], {}, 1), [1, 1]);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume([0.2], ["mono"], {}, 0.8), [0.8]);
    assert.strictEqual(Audio.sharedChannelVolume([], [], {}), 0);
});

test("re-enabling both speakers resets stereo balance to the active speaker volume", () => {
    const channels = ["left", "right"];
    const disabled = Audio.toggleSpeakerChannel([0.4, 0.4], channels, {}, "right");
    const raised = Audio.setEnabledChannelVolume(disabled.volumes, channels, disabled.savedVolumes, 0.8);
    const both = Audio.toggleSpeakerChannel(raised, channels, disabled.savedVolumes, "right");
    assert.ok(both.volumes.every(volume => Math.abs(volume - 0.8) < 1e-12));
    assert.deepStrictEqual(both.savedVolumes, {});
    const leftOff = Audio.toggleSpeakerChannel(both.volumes, channels, both.savedVolumes, "left");
    assert.strictEqual(leftOff.volumes[0], 0);
    assert.ok(Math.abs(leftOff.volumes[1] - 0.8) < 1e-12);
});

test("speaker selection remains explicit when the slider is at zero", () => {
    const channels = ["left", "right"];
    const disabled = Audio.toggleSpeakerChannel([0, 0], channels, {}, "left");
    assert.notStrictEqual(disabled.savedVolumes.left, undefined);
    assert.deepStrictEqual(Audio.setEnabledChannelVolume(disabled.volumes, channels, disabled.savedVolumes, 0.6), [0, 0.6]);
    const both = Audio.toggleSpeakerChannel([0, 0.6], channels, disabled.savedVolumes, "left");
    assert.deepStrictEqual(both.volumes, [0.6, 0.6]);
});

test("backend volume readback follows channel order and rejects malformed results", () => {
    assert.deepStrictEqual(Audio.sinkChannelVolumes({
        channel_map: "front-right,front-left",
        volume: { "front-left": { value: 0 }, "front-right": { value: 32768 } },
    }), [0.5, 0]);
    assert.strictEqual(Audio.sinkChannelVolumes({ channel_map: "front-left", volume: {} }), null);
    assert.strictEqual(Audio.sinkChannelVolumes({ channel_map: "front-left", volume: { "front-left": { value: -1 } } }), null);
    assert.strictEqual(Audio.sinkChannelVolumes({}), null);
});

test("backend confirmation requires exact silence on disabled channels", () => {
    assert.strictEqual(Audio.channelVolumesMatch([0, 0.70001], [0, 0.7]), true);
    assert.strictEqual(Audio.channelVolumesMatch([0.001, 0.7], [0, 0.7]), false);
    assert.strictEqual(Audio.channelVolumesMatch([0.4, 0.4], [0, 0]), false);
    assert.strictEqual(Audio.channelVolumesMatch(null, [0, 0]), false);
    assert.strictEqual(Audio.channelVolumesMatch([0], [0, 0]), false);
});

test("enabling channels uses the shared level when both are disabled, including zero", () => {
    const channels = ["left", "right"];
    const left = Audio.toggleSpeakerChannel([0, 0], channels, { left: 0.8, right: 0.8 }, "left");
    assert.deepStrictEqual(left.volumes, [0.8, 0]);
    const both = Audio.toggleSpeakerChannel(left.volumes, channels, left.savedVolumes, "right");
    assert.deepStrictEqual(both.volumes, [0.8, 0.8]);
    const zero = Audio.toggleSpeakerChannel([0, 0], channels, { left: 0.8 }, "left");
    assert.deepStrictEqual(zero.volumes, [0, 0]);
    assert.deepStrictEqual(zero.savedVolumes, {});
});
