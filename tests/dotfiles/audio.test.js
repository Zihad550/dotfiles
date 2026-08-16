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
