// The shared guard for the one rule every multi-text corpus lives by,
// asserted in every Provider's own test file rather than left to authorship:
//
// **An Entry's first corpus text is its name.** prepare() in lib/matching.js
// marks the first text of each owner's run as the Entry's name, and only that
// text earns EXACT_WEIGHT -- so position 0 within an owner's run means "this
// is what the Entry is called" and every later position means "this is an
// alias people might type". A Provider that lists an alias first quietly
// forfeits the bonus for the name the row displays, which is a wrong ranking
// that looks like a preference rather than a fault. The rule is stated once,
// in lib/catalog.js's header, where a Provider author will meet it; this
// assertion is what makes a breach of it fail.
//
// Run from each Provider's own test file, over its real catalogOf output --
// the same composition the QML runs. `nameOf` defaults to the Entry's own
// `name`; the directories Provider is the one deliberate exception, naming
// its Entries by their leaf rather than their display name (argued in
// lib/directories.js's header), and passes that.
//
// Deliberately not named `*.test.js`, so `node --test "tests/launcher/*.test.js"`
// never dissolves this into another suite by itself.
//
// Compared case-insensitively, because that is how prepare() compares: it
// lowercases every corpus text at load, so "kanagawa" and "Kanagawa" are the
// same text to rank() -- a single-word name may legitimately be pushed as its
// own case and still be the name.
const assert = require("node:assert");

function nameFirst(built, nameOf) {
    var seen = {};
    for (var i = 0; i < built.texts.length; i++) {
        var owner = built.owners ? built.owners[i] : i;
        if (seen[owner])
            continue;
        seen[owner] = true;
        var expected = nameOf ? nameOf(built.entries[owner]) : built.entries[owner].name;
        assert.strictEqual(built.texts[i].toLowerCase(), String(expected).toLowerCase(),
            "owner " + owner + "'s first corpus text (" + built.texts[i]
            + ") is not its Entry's name (" + expected + ") -- an alias listed first forfeits EXACT_WEIGHT");
    }
}

module.exports = { nameFirst: nameFirst };