// Tests for keyedCatalog -- the catalog build shared by the dev-servers and
// zellij Providers.
//
//     node --test "tests/launcher/*.test.js"
//
// What each Provider's rows actually look like stays pinned in
// devservers.test.js and zellij.test.js, which call this with their own real
// entryFor. What is pinned here is the contract those two rely on: three
// arrays that line up index for index, built out of whatever entryFor
// returns.

const test = require("node:test");
const assert = require("node:assert");

const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");

const entryFor = (item, provider) => ({
    name: item.toUpperCase(),
    key: "thing:" + item,
    provider: provider,
    target: { item: item }
});

test("the three arrays line up index for index", () => {
    const built = C.keyedCatalog(["a", "b"], entryFor, "provider");

    assert.deepStrictEqual(built.entries.map(entry => entry.name), ["A", "B"]);
    assert.deepStrictEqual(built.texts, ["A", "B"], "the text is the Entry's name -- one per Entry, so no owners");
    assert.deepStrictEqual(built.keys, ["thing:a", "thing:b"]);
});

test("the Provider is handed to entryFor, not attached afterwards", () => {
    const built = C.keyedCatalog(["a"], entryFor, "provider");
    assert.strictEqual(built.entries[0].provider, "provider");
    assert.deepStrictEqual(built.entries[0].target, { item: "a" });
});

test("an empty list is an empty catalog, not a fault", () => {
    assert.deepStrictEqual(C.keyedCatalog([], entryFor, null), { entries: [], texts: [], keys: [] });
});

const textEntryFor = item => ({
    name: item.toUpperCase(),
    provider: null,
    target: { item: item }
});

const textTextsFor = (item, entry) => {
    const texts = [entry.name];
    if (item.nickname)
        texts.push(item.nickname);
    return texts;
};

test("keylessCatalog builds owners for a multi-text Entry and no keys", () => {
    const built = C.keylessCatalog(
        [{ title: "Alpha" }, { title: "Beta", nickname: "bee" }],
        item => textEntryFor(item.title),
        textTextsFor);

    assert.deepStrictEqual(built.entries.map(entry => entry.name), ["ALPHA", "BETA"]);
    assert.deepStrictEqual(built.texts, ["ALPHA", "BETA", "bee"],
        "each text sits under its owner's run");
    assert.deepStrictEqual(built.owners, [0, 1, 1],
        "an Entry found by more than one text shares an owner index");
    assert.strictEqual(built.keys, undefined,
        "keylessCatalog builds no keys -- the Entry has no identity to accumulate Frecency against");
});

test("keylessCatalog is empty for an empty list, and one text per Entry for a single text", () => {
    assert.deepStrictEqual(C.keylessCatalog([], textEntryFor, textTextsFor),
        { entries: [], texts: [], owners: [] });
    assert.deepStrictEqual(
        C.keylessCatalog([{ title: "Only" }], item => textEntryFor(item.title), textTextsFor),
        { entries: [{ name: "ONLY", provider: null, target: { item: "Only" } }],
            texts: ["ONLY"], owners: [0] });
});
