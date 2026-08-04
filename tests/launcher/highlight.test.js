// Tests for where the highlight goes when the Entries change under it.
//
//     node --test "tests/launcher/*.test.js"
//
// This rule cost three host rounds. It is correct in the case it was written
// for -- a background window retitling must not yank the selection mid-arrow --
// and it was being applied in a case it was never meant for: a highlight nobody
// had placed, on a list that grows above it while the Launcher sits untouched.
// Both cases are named below, because from the outside the failure looks like
// the Launcher preferring something rather than like a fault.

const test = require("node:test");
const assert = require("node:assert");

const H = require("../../quickshell/.config/quickshell/launcher/lib/highlight.js");

// Entries are compared by identity, which is what the rule turns on, so these
// are objects rather than strings.
function entry(name) {
    return { name: name };
}

test("an untouched highlight goes to the best match, not to the Entry it was on", () => {
    const zed = entry("Zed");
    const firefox = entry("Firefox");

    // What the Launcher looks like a moment after starting: applications have
    // landed, the highlight defaulted to the first of them, nobody has typed.
    const before = [zed, firefox];
    const state = { pinned: false, index: 0, entry: zed };

    // Then the windows arrive, and they rank ahead of the applications.
    const after = [entry("timer -s course 1h"), entry("New chat - Claude"), zed, firefox];

    // The defect: identity would answer 2 here, the view would follow, and the
    // two window rows would sit above the top edge of the list.
    assert.strictEqual(H.next(after, state), 0);
});

test("a highlight the user placed follows its Entry when the list changes", () => {
    const wanted = entry("Obsidian");
    const state = { pinned: true, index: 1, entry: wanted };

    // A window retitles: same Entries, one of them re-ordered.
    const after = [entry("noise-4821"), entry("Zed"), wanted];

    assert.strictEqual(H.next(after, state), 2);
});

test("a placed highlight whose Entry has gone holds its position", () => {
    const gone = entry("a window that closed");
    const state = { pinned: true, index: 2, entry: gone };

    const after = [entry("a"), entry("b"), entry("c"), entry("d")];

    assert.strictEqual(H.next(after, state), 2);
});

test("a placed highlight past the end of a shorter list clamps to the last Entry", () => {
    const state = { pinned: true, index: 7, entry: entry("gone") };

    assert.strictEqual(H.next([entry("a"), entry("b")], state), 1);
});

test("an empty list highlights nothing, placed or not", () => {
    assert.strictEqual(H.next([], { pinned: true, index: 3, entry: entry("gone") }), -1);
    assert.strictEqual(H.next([], { pinned: false, index: 0, entry: null }), -1);
    assert.strictEqual(H.first([]), -1);
});

test("the best match of a non-empty list is its first Entry", () => {
    assert.strictEqual(H.first([entry("a"), entry("b")]), 0);
});
