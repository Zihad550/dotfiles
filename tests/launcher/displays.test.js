const test = require("node:test");
const assert = require("node:assert");
const Displays = require("../../quickshell/.config/quickshell/launcher/lib/displays.js");
const Catalog = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const CatalogCheck = require("./catalog-check.js");

const LISTING = JSON.stringify([
    { name: "HDMI-A-1", description: "Dell U2414H", enabled: true, focused: true },
    { name: "eDP-1", description: "Laptop panel", enabled: false, focused: false },
]);

test("display listing produces searchable on and off entries", () => {
    const displays = Displays.parseListing(LISTING);
    const entries = displays.map(display => Displays.entryFor(display, null));

    assert.deepStrictEqual(entries.map(entry => [entry.name, entry.subtext, entry.key]), [
        ["HDMI-A-1", "On · Dell U2414H", "display:HDMI-A-1"],
        ["eDP-1", "Off · Laptop panel", "display:eDP-1"],
    ]);
    assert.deepStrictEqual(Displays.textsFor(displays[1], entries[1]),
        ["eDP-1", "Laptop panel", "off disabled"]);

    const catalog = Catalog.ownedCatalog(displays,
        display => Displays.entryFor(display, null), Displays.textsFor);
    CatalogCheck.nameFirst(catalog);
});

test("display commands use the repository helper by absolute path", () => {
    assert.deepStrictEqual(Displays.listArgv("/home/test"), [
        "/home/test/dotfiles/bin/df-hypr-close-display", "list",
    ]);
    assert.deepStrictEqual(Displays.toggleArgv("/home/test", "DP-2"), [
        "/home/test/dotfiles/bin/df-hypr-close-display", "toggle", "DP-2",
    ]);
});

test("invalid display output becomes an empty list", () => {
    assert.deepStrictEqual(Displays.parseListing("not json"), []);
    assert.deepStrictEqual(Displays.parseListing(JSON.stringify([{ name: "" }, null])), []);
});
