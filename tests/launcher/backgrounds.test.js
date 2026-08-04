// Tests for the backgrounds Provider's pure half: the scan script, parsing
// its output, the display shape, and the argv the primary Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// `find` itself is not exercised here -- these tests check the script's
// *shape* and the parsing of its output, the same limit
// screenshots.test.js has for its own `find` invocation.

const test = require("node:test");
const assert = require("node:assert");

const B = require("../../quickshell/.config/quickshell/launcher/lib/backgrounds.js");
const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const CatalogCheck = require("./catalog-check.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");

const HOME = "/home/jehad";

// The catalog build lives in lib/catalog.js, wired to this Provider's own
// entryFor/textsFor by Backgrounds.qml -- see the same note in themes.test.js.
const catalogOf = (paths, provider) => C.ownedCatalog(paths,
    path => B.entryFor(path, provider),
    path => B.textsFor(path));

test("listScript scans one level deep for every configured extension", () => {
    const script = B.listScript(HOME);
    assert.ok(script.includes(`find -L '${B.backgroundsDir(HOME)}' -maxdepth 1 -type f`));
    for (const ext of B.EXTENSIONS)
        assert.ok(script.includes(`-iname '*.${ext}'`), `${ext} should be scanned`);
});

test("listCommand is a plain sh -c argv, safe for a Process", () => {
    const command = B.listCommand(HOME);
    assert.strictEqual(command[0], "sh");
    assert.strictEqual(command[1], "-c");
    assert.strictEqual(command.length, 3);
});

test("filenameOf takes the last path segment", () => {
    assert.strictEqual(B.filenameOf(`${HOME}/.config/backgrounds/rose-pine.jpg`), "rose-pine.jpg");
    assert.strictEqual(B.filenameOf("sunset.png"), "sunset.png");
});

test("stemOf drops the extension", () => {
    assert.strictEqual(B.stemOf("rose-pine.jpg"), "rose-pine");
    assert.strictEqual(B.stemOf("no-extension"), "no-extension");
});

test("formatName title-cases each hyphen-separated word", () => {
    assert.strictEqual(B.formatName("rose-pine-sunset"), "Rose Pine Sunset");
    assert.strictEqual(B.formatName("kanagawa"), "Kanagawa");
});

test("parseListing splits on newlines and drops blank lines", () => {
    const a = `${HOME}/.config/backgrounds/a.jpg`;
    const b = `${HOME}/.config/backgrounds/b.png`;
    assert.deepStrictEqual(B.parseListing(`${a}\n${b}\n`), [a, b]);
    assert.deepStrictEqual(B.parseListing(""), [], "no backgrounds is not a fault");
    assert.deepStrictEqual(B.parseListing(undefined), []);
});

test("entryFor carries the absolute path as the Entry Key and the filename as subtext", () => {
    const provider = {};
    const path = `${HOME}/.config/backgrounds/rose-pine-sunset.jpg`;
    const entry = B.entryFor(path, provider);
    assert.strictEqual(entry.name, "Rose Pine Sunset");
    assert.strictEqual(entry.subtext, "rose-pine-sunset.jpg");
    assert.strictEqual(entry.icon, "preferences-desktop-wallpaper");
    assert.strictEqual(entry.key, `background:${path}`);
    assert.strictEqual(entry.provider, provider);
    assert.strictEqual(entry.target.path, path);
});

test("textsFor scores the formatted name and the stem separately, deduplicated when they are the same", () => {
    // Display name first, so it is the text EXACT_WEIGHT is measured against --
    // see the same assertion in themes.test.js.
    assert.deepStrictEqual(B.textsFor("rose-pine-sunset"), ["Rose Pine Sunset", "rose-pine-sunset"]);
    assert.deepStrictEqual(B.textsFor("kanagawa"), ["kanagawa"]);
});

test("catalogOf builds one Entry per path, with the texts/keys/owners prepare() and collapse() want", () => {
    const paths = [`${HOME}/.config/backgrounds/kanagawa.png`, `${HOME}/.config/backgrounds/rose-pine-sunset.jpg`];
    const built = catalogOf(paths, null);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name (the formatted display name), or the stem would quietly earn
    // what only the row's own name may.
    CatalogCheck.nameFirst(built);

    assert.deepStrictEqual(built.entries.map(e => e.name), ["Kanagawa", "Rose Pine Sunset"]);

    // "kanagawa" has one text; "rose-pine-sunset" has two (formatted + stem).
    assert.strictEqual(built.texts.length, 3);
    assert.deepStrictEqual(built.owners, [0, 1, 1]);
    assert.deepStrictEqual(built.keys, built.owners.map(i => built.entries[i].key));
});

test("a background is matchable by its raw stem even though the row displays the formatted name", () => {
    const path = `${HOME}/.config/backgrounds/rose-pine-sunset.jpg`;
    const built = catalogOf([path], null);
    const corpus = M.prepare(built.texts, built.keys, built.owners);
    const ranked = M.collapse(corpus, M.rank(corpus, "rose-pine-sunset"));
    assert.strictEqual(ranked.indices.length, 1);
    assert.strictEqual(built.entries[ranked.indices[0]].name, "Rose Pine Sunset");
});

test("applyArgv runs df-theme-bg-set by absolute path, not the bare name", () => {
    const path = `${HOME}/.config/backgrounds/rose-pine-sunset.jpg`;
    assert.deepStrictEqual(B.applyArgv(HOME, path), [`${HOME}/dotfiles/bin/df-theme-bg-set`, path]);
});
