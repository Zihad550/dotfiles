const test = require("node:test");
const assert = require("node:assert");
const DisplayPanel = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/displayPanel.js");

test("monitor state includes enabled and disabled outputs", () => {
    const displays = DisplayPanel.parseDisplays(JSON.stringify([
        {
            name: "HDMI-A-1",
            description: "Dell U2414H",
            disabled: false,
            focused: true,
        },
        {
            name: "eDP-1",
            description: "Laptop panel",
            disabled: true,
            focused: false,
        },
    ]));

    assert.deepStrictEqual(displays, [
        {
            name: "HDMI-A-1",
            description: "Dell U2414H",
            enabled: true,
            focused: true,
        },
        {
            name: "eDP-1",
            description: "Laptop panel",
            enabled: false,
            focused: false,
        },
    ]);
    assert.strictEqual(DisplayPanel.enabledCount(displays), 1);
});

test("invalid monitor state becomes an empty list", () => {
    assert.deepStrictEqual(DisplayPanel.parseDisplays("not json"), []);
    assert.deepStrictEqual(DisplayPanel.parseDisplays(JSON.stringify([{ name: "" }, null])), []);
});
