// Tests for the Launcher's Frecency store.
//
//     node --test "tests/launcher/*.test.js"
//
// The second seam, and it is one for the same reason the first is: a wrong
// answer here looks like a preference rather than a fault. An Entry that should
// have risen and did not is indistinguishable from an Entry the Launcher simply
// ranks differently, and nothing logs.
//
// Everything below asserts external behaviour -- given a sequence of choices at
// given times, which Entries the store says are used and in what order. Nothing
// asserts the decay curve, the normalisation, or the on-disk field names,
// because those are exactly what tuning changes.
//
// `now` is always passed in. The module never reads the clock itself, which is
// the whole reason recency is testable at all.

const test = require("node:test");
const assert = require("node:assert");

const F = require("../../quickshell/.config/quickshell/launcher/lib/frecency.js");

const DAY = 24 * 60 * 60;

// A fixed instant to measure from, so a test that says "eight days ago" says it
// once. Any value works; the module only ever sees differences.
const NOW = 1_700_000_000;

// Choose `key` `times` over, all at `at`. The common setup: what the store
// looks like after someone has used something a few times.
function chosen(store, key, times, at) {
    let next = store;
    for (let i = 0; i < times; i++)
        next = F.bump(next, key, at);
    return next;
}

// The stored keys, most used first -- which is the ordering an empty Query
// renders and the thing every assertion here is actually about.
function order(store, now) {
    const usage = F.usageOf(store, now);
    return Object.keys(usage).sort((a, b) => usage[b] - usage[a]);
}

// --- Reading the store -------------------------------------------------------
//
// parse() must never throw. A throw inside a QML binding takes down the whole
// merged Entry list, so a corrupt store would cost the Launcher rather than
// cost Frecency -- which is the opposite of "degrades to no-Frecency".

test("a missing store parses as empty rather than throwing", () => {
    for (const text of [undefined, null, ""]) {
        assert.deepStrictEqual(F.usageOf(F.parse(text), NOW), {},
            `${JSON.stringify(text)} should read as no Frecency`);
    }
});

test("a corrupt store parses as empty rather than throwing", () => {
    const corrupt = [
        "{",                                    // truncated mid-write
        "not json at all",
        "[]",                                   // valid JSON, wrong shape
        "42",
        "null",
        '{"entries": "firefox"}',               // entries is not a map
        '{"entries": {"firefox": 3}}',          // a record is not a number
        '{"entries": {"firefox": {"weight": "lots"}}}',
        '{"entries": {"firefox": {"weight": null, "at": null}}}'
    ];

    for (const text of corrupt) {
        assert.deepStrictEqual(F.usageOf(F.parse(text), NOW), {},
            `${text} should read as no Frecency`);
    }
});

test("a store from a future version reads as empty", () => {
    // Forward compatibility in the only direction that matters: an older
    // Launcher must not act on a shape it does not understand. Reading it as
    // empty costs the learned order and nothing else.
    const text = JSON.stringify({ version: 99, entries: { firefox: { weight: 5, at: NOW } } });
    assert.deepStrictEqual(F.usageOf(F.parse(text), NOW), {});
});

test("a store round-trips through serialize and parse", () => {
    const store = chosen(chosen(F.emptyStore(), "firefox", 3, NOW - DAY), "ghostty", 1, NOW);

    const reread = F.parse(F.serialize(store));

    assert.deepStrictEqual(F.usageOf(reread, NOW), F.usageOf(store, NOW),
        "usage should survive a write and a read, which is what surviving a restart is");
});

test("serialize produces text a JSON reader accepts", () => {
    const text = F.serialize(chosen(F.emptyStore(), "firefox", 1, NOW));
    assert.doesNotThrow(() => JSON.parse(text));
});

// --- Recording a choice ------------------------------------------------------

test("choosing an Entry records usage against its key", () => {
    const store = F.bump(F.emptyStore(), "firefox.desktop", NOW);
    const usage = F.usageOf(store, NOW);

    assert.deepStrictEqual(Object.keys(usage), ["firefox.desktop"]);
    assert.ok(usage["firefox.desktop"] > 0, "a chosen Entry has usage");
});

test("an Entry with no key records nothing", () => {
    // The windows Provider supplies no Entry Key, and the shell hands whatever
    // the Entry carries straight through. A no-op here is what keeps a Provider
    // that opted out from accumulating anything.
    for (const key of [undefined, null, "", 0]) {
        const store = F.bump(F.emptyStore(), key, NOW);
        assert.deepStrictEqual(F.usageOf(store, NOW), {},
            `${JSON.stringify(key)} should not be recorded`);
    }
});

test("bump does not mutate the store it is given", () => {
    // The Launcher holds the store in a QML property and re-ranks off a
    // binding. A mutation in place notifies nothing, so the Entries would keep
    // their old order until something unrelated changed.
    const before = F.emptyStore();
    const after = F.bump(before, "firefox", NOW);

    assert.deepStrictEqual(F.usageOf(before, NOW), {}, "the original is untouched");
    assert.notStrictEqual(after, before, "and the result is a different object");
});

test("usage stays within the range the ranker blends over", () => {
    let store = F.emptyStore();
    store = chosen(store, "firefox", 40, NOW);
    store = chosen(store, "ghostty", 1, NOW - 30 * DAY);

    const usage = F.usageOf(store, NOW);
    for (const key of Object.keys(usage)) {
        assert.ok(usage[key] >= 0 && usage[key] <= 1,
            `${key} at ${usage[key]} should be in [0, 1]`);
    }
});

// --- Frequency and recency ---------------------------------------------------

test("an Entry chosen more often outranks one chosen less", () => {
    let store = F.emptyStore();
    store = chosen(store, "seldom", 1, NOW);
    store = chosen(store, "often", 10, NOW);

    assert.deepStrictEqual(order(store, NOW), ["often", "seldom"]);
});

test("at equal counts, the more recently chosen outranks the older", () => {
    let store = F.emptyStore();
    store = chosen(store, "stale", 3, NOW - 60 * DAY);
    store = chosen(store, "fresh", 3, NOW - DAY);

    assert.deepStrictEqual(order(store, NOW), ["fresh", "stale"]);
});

test("recency can beat frequency, which is the whole point of the blend", () => {
    // Something used heavily months ago and abandoned should not outrank what
    // is being used now. A store that only counted would say otherwise, and it
    // would keep saying it forever.
    let store = F.emptyStore();
    store = chosen(store, "abandoned", 20, NOW - 180 * DAY);
    store = chosen(store, "current", 3, NOW - DAY);

    assert.deepStrictEqual(order(store, NOW), ["current", "abandoned"]);
});

test("choosing an Entry again raises it", () => {
    let store = F.emptyStore();
    store = chosen(store, "a", 2, NOW);
    store = chosen(store, "b", 2, NOW);

    assert.strictEqual(F.usageOf(store, NOW)["a"], F.usageOf(store, NOW)["b"],
        "level to begin with");

    const raised = F.bump(store, "b", NOW);
    const usage = F.usageOf(raised, NOW);
    assert.ok(usage["b"] > usage["a"], "the one just chosen again is now ahead");
});

test("a clock that went backwards does not produce a nonsense score", () => {
    // Not hypothetical on a laptop: an NTP correction or a suspend across a
    // timezone change can put `now` behind a recorded timestamp. The decay
    // exponent goes positive there, which without a guard grows the weight
    // without bound.
    const store = chosen(F.emptyStore(), "firefox", 3, NOW);
    const usage = F.usageOf(store, NOW - 10 * DAY);

    assert.ok(Number.isFinite(usage["firefox"]), "still a number");
    assert.ok(usage["firefox"] >= 0 && usage["firefox"] <= 1, "still in range");
});

test("an empty store yields no usage rather than dividing by zero", () => {
    const usage = F.usageOf(F.emptyStore(), NOW);
    assert.deepStrictEqual(usage, {});
});

// --- Bounded growth ----------------------------------------------------------
//
// Nothing tells the store an Entry has disappeared from the system: an
// uninstalled application, a deleted directory and a renamed screenshot all
// simply stop being offered. So the store cannot be bounded by asking what
// still exists -- it is bounded by decay plus a cap.

test("prune drops a key chosen once and then never again", () => {
    const store = chosen(F.emptyStore(), "one-off", 1, NOW - 365 * DAY);

    assert.deepStrictEqual(F.usageOf(F.prune(store, NOW), NOW), {},
        "a year-old single choice is gone");
});

test("prune keeps something still in use, however old the first choice was", () => {
    let store = chosen(F.emptyStore(), "daily", 1, NOW - 365 * DAY);
    store = F.bump(store, "daily", NOW);

    assert.deepStrictEqual(Object.keys(F.usageOf(F.prune(store, NOW), NOW)), ["daily"]);
});

test("prune caps the store, keeping the most used", () => {
    let store = F.emptyStore();
    for (let i = 0; i < 50; i++)
        store = chosen(store, `key-${i}`, 1 + i, NOW);

    const pruned = F.prune(store, NOW, 10);
    const kept = Object.keys(F.usageOf(pruned, NOW));

    assert.strictEqual(kept.length, 10, "capped at the limit");
    assert.deepStrictEqual(order(pruned, NOW), [
        "key-49", "key-48", "key-47", "key-46", "key-45",
        "key-44", "key-43", "key-42", "key-41", "key-40"
    ], "and the ones it kept are the strongest");
});

test("a store pruned on every write cannot grow without bound", () => {
    // What the Launcher actually does: bump, prune, write. Three thousand
    // distinct one-off keys -- an uninstall-and-reinstall churn no real system
    // reaches -- must not leave three thousand records behind.
    let store = F.emptyStore();
    for (let i = 0; i < 3000; i++)
        store = F.prune(F.bump(store, `key-${i}`, NOW + i * 60), NOW + i * 60, 100);

    assert.ok(Object.keys(F.usageOf(store, NOW + 3000 * 60)).length <= 100,
        "the cap holds across every write");
});

test("prune does not mutate the store it is given", () => {
    const store = chosen(F.emptyStore(), "one-off", 1, NOW - 365 * DAY);
    F.prune(store, NOW);

    assert.deepStrictEqual(Object.keys(F.usageOf(store, NOW)), ["one-off"],
        "the original still has its key");
});

// --- Meeting the file after a choice has already been made -------------------
//
// The store loads asynchronously, so a choice made in the first moments after
// startup can beat the file to memory. Merging rather than replacing is what
// stops that choice either being lost or costing the whole learned history.

test("merging keeps the newer record for a key both stores hold", () => {
    const disk = chosen(F.emptyStore(), "firefox", 5, NOW - 10 * DAY);
    const memory = F.bump(F.emptyStore(), "firefox", NOW);

    const merged = F.mergeStores(disk, memory);

    assert.deepStrictEqual(F.usageOf(merged, NOW), F.usageOf(memory, NOW),
        "the choice just made supersedes the older record");
});

test("merging adopts keys only one store has", () => {
    const disk = chosen(F.emptyStore(), "ghostty", 4, NOW - DAY);
    const memory = F.bump(F.emptyStore(), "firefox", NOW);

    assert.deepStrictEqual(
        Object.keys(F.usageOf(F.mergeStores(disk, memory), NOW)).sort(),
        ["firefox", "ghostty"],
        "nothing is dropped just because the other store had not heard of it");
});

test("merging an empty store either way changes nothing", () => {
    const store = chosen(F.emptyStore(), "firefox", 3, NOW);
    const empty = F.emptyStore();

    assert.deepStrictEqual(F.usageOf(F.mergeStores(store, empty), NOW), F.usageOf(store, NOW));
    assert.deepStrictEqual(F.usageOf(F.mergeStores(empty, store), NOW), F.usageOf(store, NOW));
});

test("merging does not mutate either store", () => {
    const disk = chosen(F.emptyStore(), "firefox", 5, NOW - 10 * DAY);
    const memory = F.bump(F.emptyStore(), "ghostty", NOW);
    F.mergeStores(disk, memory);

    assert.deepStrictEqual(Object.keys(F.usageOf(disk, NOW)), ["firefox"]);
    assert.deepStrictEqual(Object.keys(F.usageOf(memory, NOW)), ["ghostty"]);
});

// --- What the ceiling costs to reach -----------------------------------------

test("one choice does not earn the full weight the ranker blends at", () => {
    // Normalising against the strongest record alone means a store holding one
    // record hands that record 1.0 -- the whole 24 quality points, on the
    // strength of having been chosen once. That is the most aggressive
    // calibration Frecency can produce, and it arrives on a fresh store, which
    // is precisely when it is least earned.
    const once = F.usageOf(F.bump(F.emptyStore(), "firefox", NOW), NOW);
    assert.ok(once["firefox"] > 0, "one choice is still worth something");
    assert.ok(once["firefox"] < 0.5, `one choice at ${once["firefox"]} should be well short of the ceiling`);
});

test("the ceiling is reached by being used, and stays reachable", () => {
    let store = chosen(F.emptyStore(), "daily", 12, NOW);
    store = chosen(store, "seldom", 1, NOW);

    const usage = F.usageOf(store, NOW);
    assert.strictEqual(usage["daily"], 1, "the most-used record still tops out at 1");
    assert.ok(usage["seldom"] < usage["daily"]);
});

test("the ceiling tracks the store rather than an absolute count", () => {
    // Nothing here knows how often a heavy user opens their editor, so a record
    // that is the strongest thing in a well-used store gets the ceiling whatever
    // its absolute weight is.
    const modest = chosen(F.emptyStore(), "a", 6, NOW);
    const heavy = chosen(F.emptyStore(), "a", 60, NOW);

    assert.strictEqual(F.usageOf(modest, NOW)["a"], F.usageOf(heavy, NOW)["a"]);
});
