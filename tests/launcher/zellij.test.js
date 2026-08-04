// Tests for the zellij Provider's pure half -- the Entry shape for a session
// and the exact argv the primary Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// The argv is the risky half: the session command travels as one argument
// through df-launch-special-app into Hyprland's exec dispatcher, which is
// what re-parses it -- so a quoting mistake here is a session that opens on
// the wrong workspace or not at all.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const Z = require("../../quickshell/.config/quickshell/launcher/lib/zellij.js");

// The catalog build is lib/catalog.js's, handed this Provider's own
// entryFor -- exactly as Zellij.qml calls it, so what is asserted below is
// still this Provider's rows and not a stub's.
const catalogOf = (sessions, provider) => C.keyedCatalog(sessions, Z.entryFor, provider);

const SESSIONS = ["work", "project", "dev"];

test("an entry is the session name with a zellij sub-line and a stable key", () => {
    const entry = Z.entryFor("work", null);
    assert.strictEqual(entry.name, "work");
    assert.strictEqual(entry.subtext, "zellij session");
    assert.strictEqual(entry.key, "zellij:work");
    assert.deepStrictEqual(entry.target, { session: "work" });
});

test("the catalog carries the script's sessions, keyed for Frecency", () => {
    const built = catalogOf(SESSIONS, null);
    assert.strictEqual(built.entries.length, 3);
    assert.deepStrictEqual(built.entries.map(e => e.name), SESSIONS);
    assert.strictEqual(built.keys[2], "zellij:dev");
});

test("a session is found by its name", () => {
    const built = catalogOf(SESSIONS, null);
    const corpus = M.prepare(built.texts, built.keys);

    const names = query => M.collapse(corpus, M.rank(corpus, query)).indices.map(index => built.entries[index].name);
    assert.deepStrictEqual(names("work"), ["work"]);
});

test("the primary runs df-launch-special-app with the attach-or-create command intact", () => {
    assert.deepStrictEqual(Z.launchArgv("/home/jehad", "work"), [
        "/home/jehad/dotfiles/bin/df-launch-special-app",
        "work",
        "ghostty -e zellij -l work attach --create work options --on-force-close quit",
        "work"
    ]);
});
