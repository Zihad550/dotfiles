// Tests for the provider-list Provider's pure half: which Providers are
// listable, how each renders, and which of the two ways of reaching one a
// given Provider wants.
//
//     node --test "tests/launcher/*.test.js"
//
// The Providers here are plain objects rather than real QML ones -- the whole
// point of this seam is that it never touches a QML type. That is also what
// lets a Provider that opts out, or one with neither a prefix nor an enter(),
// be tested at all: neither is easy to stage in a running Launcher.

const test = require("node:test");
const assert = require("node:assert");

const P = require("../../quickshell/.config/quickshell/launcher/lib/providerlist.js");
const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const CatalogCheck = require("./catalog-check.js");

// The catalog build lives in lib/catalog.js, wired to this Provider's own
// entryFor/textsFor by ProviderList.qml, which filters the opt-outs before
// handing the list over. Repeated here so these tests exercise that same
// wiring rather than a shape of their own.
const catalogOf = (providers, self) => C.ownedCatalog(providers.filter(P.isListable),
    provider => P.entryFor(provider, self),
    provider => P.textsFor(provider));

const screenshots = { label: "screenshots", prefix: "#", description: "Recent screenshots" };
const themes = { label: "themes", description: "Switch the colour theme", enter: () => {} };
const apps = { label: "applications", description: "Installed applications", enter: () => {} };
const hidden = { label: "providers", description: "This list", listable: false };

test("a Provider is listable unless it says otherwise", () => {
    assert.strictEqual(P.isListable(screenshots), true);
    assert.strictEqual(P.isListable(themes), true);
    assert.strictEqual(P.isListable(hidden), false, "listable: false opts out");
});

test("opting out is explicit -- a missing `listable` is not opting out", () => {
    assert.strictEqual(P.isListable({ label: "x" }), true);
    assert.strictEqual(P.isListable({ label: "x", listable: undefined }), true);
});

test("formatName title-cases the label a Provider already has", () => {
    assert.strictEqual(P.formatName("screenshots"), "Screenshots");
    assert.strictEqual(P.formatName("web search"), "Web Search");
});

test("the sub-line leads with the prefix when there is one", () => {
    assert.strictEqual(P.subtextOf(screenshots), "#  Recent screenshots");
    assert.strictEqual(P.subtextOf(themes), "Switch the colour theme");
});

test("a Provider with no description still renders a sub-line", () => {
    assert.strictEqual(P.subtextOf({ label: "x", prefix: "!" }), "!");
    assert.strictEqual(P.subtextOf({ label: "x" }), "");
});

// Ticket 18 checkbox 2 -- "selecting a Provider switches the Query to it" --
// has two shapes, because not every Provider has a prefix to switch to.
test("reaching a prefixed Provider is switching the Query to its prefix", () => {
    assert.deepStrictEqual(P.reachOf(screenshots), { how: "prefix", prefix: "#" });
});

test("reaching a Provider with no prefix is entering it", () => {
    assert.deepStrictEqual(P.reachOf(themes), { how: "enter" });
});

test("reaching a default-pool Provider is entering it too, not clearing the Query", () => {
    assert.deepStrictEqual(P.reachOf(apps), { how: "enter" });
});

test("a Provider with neither a prefix nor an enter() still gets the enter shape -- the missing function fails loudly at the call site, never a silent return to the whole pool", () => {
    assert.deepStrictEqual(P.reachOf({ label: "x" }), { how: "enter" });
});

test("a prefix wins over an enter() -- switching the Query is the cheaper move", () => {
    const both = { label: "b", prefix: "%", enter: () => {} };
    assert.deepStrictEqual(P.reachOf(both), { how: "prefix", prefix: "%" });
});

test("entryFor carries the Provider itself as the target, not its label", () => {
    const self = {};
    const entry = P.entryFor(screenshots, self);
    assert.strictEqual(entry.name, "Screenshots");
    assert.strictEqual(entry.subtext, "#  Recent screenshots");
    assert.strictEqual(entry.key, "provider:screenshots");
    assert.strictEqual(entry.provider, self, "the row belongs to the list, not to what it names");
    assert.strictEqual(entry.target.provider, screenshots);
});

test("catalogOf drops the Providers that opted out", () => {
    const built = catalogOf([screenshots, hidden, themes], null);
    assert.deepStrictEqual(built.entries.map(e => e.name), ["Screenshots", "Themes"]);
});

test("catalogOf builds the texts/keys/owners prepare() and collapse() want", () => {
    const built = catalogOf([screenshots, themes], null);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name (the formatted display name), or the raw label would quietly
    // earn what only the row's own name may.
    CatalogCheck.nameFirst(built);

    assert.strictEqual(built.texts.length, built.keys.length);
    assert.strictEqual(built.texts.length, built.owners.length);
    assert.deepStrictEqual(built.keys, built.owners.map(i => built.entries[i].key));
});

test("a Provider is findable by its raw label as well as its display name", () => {
    const websearch = { label: "web search", prefix: "@" };
    const built = catalogOf([websearch], null);
    const corpus = M.prepare(built.texts, built.keys, built.owners);

    for (const query of ["web search", "Web Search"]) {
        const ranked = M.collapse(corpus, M.rank(corpus, query));
        assert.strictEqual(ranked.indices.length, 1, `"${query}" should find it`);
        assert.strictEqual(built.entries[ranked.indices[0]].name, "Web Search");
    }
});

test("a label that formats to itself contributes one text, not two", () => {
    const built = catalogOf([{ label: "clipboard", prefix: "$" }], null);
    assert.strictEqual(built.texts.length, 1);
});

test("an empty pool is not a fault", () => {
    const built = catalogOf([], null);
    assert.deepStrictEqual(built.entries, []);
    assert.deepStrictEqual(built.texts, []);
});

// problems() -- the load-time half of "no third shape". reachOf hands a
// Provider with neither a prefix nor an enter() to enter(), which throws out
// of reach() only once somebody chooses that row; these are what turn that
// into a warning at startup instead.

test("a Provider reachable by prefix or by enter() is not a problem", () => {
    assert.deepStrictEqual(P.problems([screenshots, themes, apps]), []);
});

test("a listable Provider with neither a prefix nor an enter() is named", () => {
    const stranded = { label: "zellij", description: "Attach to a zellij session" };
    const found = P.problems([screenshots, stranded]);

    assert.strictEqual(found.length, 1);
    assert.match(found[0], /zellij/);
    assert.match(found[0], /neither a prefix nor an enter/);
});

test("a Provider that opted out is not required to be reachable", () => {
    assert.deepStrictEqual(P.problems([hidden]), [],
        "listable: false means no row, so there is nothing to reach");
});

test("every stranded Provider is named, not just the first", () => {
    const found = P.problems([
        { label: "processes" },
        { label: "systemd" },
        { label: "dev servers" }
    ]);

    assert.strictEqual(found.length, 3);
});

test("an enter() that is not a function does not count as reachable", () => {
    const found = P.problems([{ label: "broken", enter: true }]);
    assert.strictEqual(found.length, 1);
});

test("an empty prefix is not a prefix", () => {
    const found = P.problems([{ label: "blank", prefix: "" }]);
    assert.strictEqual(found.length, 1, "\"\" routes nothing, so enter() is still required");
});
