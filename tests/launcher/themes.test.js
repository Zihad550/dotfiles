// Tests for the themes Provider's pure half: the scan-plus-active-detection
// script, parsing its output, the display shape, and the argv the primary
// Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// `find` and `readlink` themselves are not exercised here -- these tests
// check the script's *shape* and the parsing of its output, the same limit
// directories.test.js has for its own refresh script.

const test = require("node:test");
const assert = require("node:assert");

const T = require("../../quickshell/.config/quickshell/launcher/lib/themes.js");
const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const CatalogCheck = require("./catalog-check.js");

const HOME = "/home/jehad";

// The catalog build lives in lib/catalog.js, wired to this Provider's own
// entryFor/textsFor by Themes.qml. Repeated here so these tests exercise that
// same wiring rather than a shape of their own -- a lib module cannot import
// another (see the header on catalog.js), so the QML is the only place the
// two halves meet.
const catalogOf = (names, current, previews, provider) => C.ownedCatalog(names,
    name => T.entryFor(name, current, previews[name], provider),
    name => T.textsFor(name));

test("listScript reads the active symlink and scans for colors.toml, in that order", () => {
    const script = T.listScript(HOME);
    assert.ok(script.indexOf("CURRENT") < script.indexOf("find -L"),
        "the CURRENT line must be printed before the scan, so parseListing's first-line assumption holds");
    assert.ok(script.includes(`readlink '${T.themeLinkPath(HOME)}'`));
    assert.ok(script.includes(`find -L '${T.themesDir(HOME)}'`));
    assert.ok(script.includes("-name colors.toml"));
});

test("listCommand is a plain sh -c argv, safe for a Process", () => {
    const command = T.listCommand(HOME);
    assert.strictEqual(command[0], "sh");
    assert.strictEqual(command[1], "-c");
    assert.strictEqual(command.length, 3);
});

test("formatName title-cases each hyphen-separated word", () => {
    assert.strictEqual(T.formatName("rose-pine"), "Rose Pine");
    assert.strictEqual(T.formatName("kanagawa"), "Kanagawa");
    assert.strictEqual(T.formatName("osaka-jade"), "Osaka Jade");
});

test("parseThemeLine pulls the theme's own directory name out of a colors.toml path", () => {
    assert.strictEqual(T.parseThemeLine(`${HOME}/.config/themes/rose-pine/colors.toml`), "rose-pine");
    assert.strictEqual(T.parseThemeLine("not a path"), null);
});

test("parseListing reads the CURRENT marker off the first line and the rest as theme names", () => {
    const text = "CURRENT\tkanagawa\n"
        + `${HOME}/.config/themes/kanagawa/colors.toml\n`
        + `${HOME}/.config/themes/rose-pine/colors.toml\n`;
    assert.deepStrictEqual(T.parseListing(text), {
        current: "kanagawa",
        names: ["kanagawa", "rose-pine"],
        previews: {}
    });
});

test("parseListing reports no active theme as \"\", not a fault", () => {
    const text = "CURRENT\t\n" + `${HOME}/.config/themes/kanagawa/colors.toml\n`;
    assert.deepStrictEqual(T.parseListing(text), { current: "", names: ["kanagawa"], previews: {} });
});

test("parseListing treats empty or malformed output as no themes at all", () => {
    assert.deepStrictEqual(T.parseListing(""), { current: "", names: [], previews: {} });
    assert.deepStrictEqual(T.parseListing(undefined), { current: "", names: [], previews: {} });
});

test("entryFor marks the active theme in its subtext, never in its name", () => {
    const provider = {};
    const active = T.entryFor("kanagawa", "kanagawa", "", provider);
    assert.strictEqual(active.name, "Kanagawa");
    assert.strictEqual(active.subtext, "Active");
    assert.strictEqual(active.icon, "preferences-desktop-theme");
    assert.strictEqual(active.key, "theme:kanagawa");
    assert.strictEqual(active.provider, provider);
    assert.strictEqual(active.target.name, "kanagawa");

    const inactive = T.entryFor("rose-pine", "kanagawa", "", provider);
    assert.strictEqual(inactive.name, "Rose Pine", "the display name never carries the active marker");
    assert.strictEqual(inactive.subtext, "Theme");
});

test("textsFor scores the formatted name and the raw slug separately, deduplicated when they are the same", () => {
    // Display name first: prepare() reads an Entry's first text as its name and
    // only that text earns EXACT_WEIGHT, so this order is what makes typing the
    // string the row actually shows count as naming the theme. Asserted here
    // because nothing in matching.js can enforce it -- see prepare().
    assert.deepStrictEqual(T.textsFor("rose-pine"), ["Rose Pine", "rose-pine"]);
    assert.deepStrictEqual(T.textsFor("kanagawa"), ["kanagawa"], "a one-word name formats to itself");
});

test("catalogOf builds one Entry per name, with the texts/keys/owners prepare() and collapse() want", () => {
    const built = catalogOf(["kanagawa", "rose-pine"], "kanagawa", {}, null);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name (the formatted display name), or the slug would quietly earn
    // what only the row's own name may.
    CatalogCheck.nameFirst(built);

    assert.deepStrictEqual(built.entries.map(e => e.name), ["Kanagawa", "Rose Pine"]);
    assert.deepStrictEqual(built.entries.map(e => e.subtext), ["Active", "Theme"]);

    // "kanagawa" has one text; "rose-pine" has two (slug + formatted).
    assert.strictEqual(built.texts.length, 3);
    assert.deepStrictEqual(built.owners, [0, 1, 1]);
    assert.deepStrictEqual(built.keys, built.owners.map(i => built.entries[i].key));
});

test("a theme is matchable by its raw slug even though the row displays the formatted name", () => {
    const built = catalogOf(["rose-pine"], "", {}, null);
    const corpus = M.prepare(built.texts, built.keys, built.owners);
    const ranked = M.collapse(corpus, M.rank(corpus, "rose-pine"));
    assert.strictEqual(ranked.indices.length, 1);
    assert.strictEqual(built.entries[ranked.indices[0]].name, "Rose Pine");
});

test("listScript scans the preview directory too, after the themes themselves", () => {
    const script = T.listScript(HOME);
    assert.ok(script.includes(`find -L '${T.previewsDir(HOME)}'`));
    assert.ok(script.indexOf(T.themesDir(HOME)) < script.indexOf(T.previewsDir(HOME)),
        "themes before previews, so a preview line can never be mistaken for the CURRENT line");
    for (const ext of T.PREVIEW_EXTENSIONS)
        assert.ok(script.includes(`-iname '*.${ext}'`), `${ext} previews should be found`);
});

test("parsePreviewLine takes the theme name off the preview's own filename", () => {
    assert.deepStrictEqual(T.parsePreviewLine(`${HOME}/.config/theme-previews/rose-pine.png`),
        { name: "rose-pine", path: `${HOME}/.config/theme-previews/rose-pine.png` });
    assert.strictEqual(T.parsePreviewLine(`${HOME}/.config/themes/rose-pine/colors.toml`), null,
        "a theme line is not a preview line");
    assert.strictEqual(T.parsePreviewLine("not a path"), null);
});

test("parseListing sorts theme lines and preview lines apart by shape, not by a marker", () => {
    const text = "CURRENT\tkanagawa\n"
        + `${HOME}/.config/themes/kanagawa/colors.toml\n`
        + `${HOME}/.config/themes/rose-pine/colors.toml\n`
        + `${HOME}/.config/theme-previews/rose-pine.png\n`;
    assert.deepStrictEqual(T.parseListing(text), {
        current: "kanagawa",
        names: ["kanagawa", "rose-pine"],
        previews: { "rose-pine": `${HOME}/.config/theme-previews/rose-pine.png` }
    });
});

test("a theme with a preview carries its path; one without carries \"\", never undefined", () => {
    const previews = { "rose-pine": `${HOME}/.config/theme-previews/rose-pine.png` };
    const built = catalogOf(["kanagawa", "rose-pine"], "", previews, null);

    assert.strictEqual(built.entries[0].target.preview, "",
        "an absent preview is \"\", which is what previewPane treats as nothing to show");
    assert.strictEqual(built.entries[1].target.preview, previews["rose-pine"]);
});

test("a theme with no preview at all still builds an Entry", () => {
    const built = catalogOf(["kanagawa"], "", {}, null);
    assert.strictEqual(built.entries[0].target.preview, "");
});

test("applyArgv runs df-theme-set by absolute path, not the bare name", () => {
    assert.deepStrictEqual(T.applyArgv(HOME, "rose-pine"), [`${HOME}/dotfiles/bin/df-theme-set`, "rose-pine"]);
});
