// Tests for the dev-servers Provider's pure half -- the Entry shape for a
// configured URL and the exact argv the primary Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// The argv is the risky half: the old script passed the URL through
// df-launch-dev's first argument, and a typo there is a launch that silently
// opens the wrong thing (or nothing).

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const D = require("../../quickshell/.config/quickshell/launcher/lib/devservers.js");

// The catalog build is lib/catalog.js's, handed this Provider's own
// entryFor -- exactly as DevServers.qml calls it, so what is asserted below
// is still this Provider's rows and not a stub's.
const catalogOf = (urls, provider) => C.keyedCatalog(urls, D.entryFor, provider);

const URLS = ["https://localhost:5175", "http://localhost:3000", "http://localhost:8000"];

test("an entry is the URL with a dev-server sub-line and a stable key", () => {
    const entry = D.entryFor("https://localhost:5175", null);
    assert.strictEqual(entry.name, "https://localhost:5175");
    assert.strictEqual(entry.subtext, "dev server");
    assert.strictEqual(entry.key, "devserver:https://localhost:5175");
    assert.deepStrictEqual(entry.target, { url: "https://localhost:5175" });
});

test("the catalog carries the script's URLs, keyed for Frecency", () => {
    const built = catalogOf(URLS, null);
    assert.strictEqual(built.entries.length, 3);
    assert.strictEqual(built.entries[0].name, "https://localhost:5175");
    assert.strictEqual(built.keys[0], "devserver:https://localhost:5175");
    assert.strictEqual(built.entries[2].target.url, "http://localhost:8000");
});

test("a URL is found by the port and by the host", () => {
    const built = catalogOf(URLS, null);
    const corpus = M.prepare(built.texts, built.keys);

    const names = query => M.collapse(corpus, M.rank(corpus, query)).indices.map(index => built.entries[index].name);
    assert.deepStrictEqual(names("3000"), ["http://localhost:3000"]);
    assert.deepStrictEqual(names("5175"), ["https://localhost:5175"]);
});

test("the primary runs df-launch-dev by absolute path", () => {
    assert.deepStrictEqual(D.launchArgv("/home/jehad", "http://localhost:3000"), [
        "/home/jehad/dotfiles/bin/df-launch-dev", "http://localhost:3000"
    ]);
});
