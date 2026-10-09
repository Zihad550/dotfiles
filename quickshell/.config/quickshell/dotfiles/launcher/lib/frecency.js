// The Frecency store: how often and how recently an Entry has been chosen.
// A wrong answer here looks like a preference, not a fault -- an Entry that
// should have risen and didn't shows no error and logs nothing, so this is a
// seam with tests rather than arithmetic inlined in a QML binding.
//
// Free of QML types, no `.pragma library` -- see the top of matching.js.
// This module must hold no state (each importing document gets its own copy
// of the scope without the pragma); it's pure functions over a store the
// caller owns, which is why the store lives in QML and is passed into
// rank() as `usage`.
//
// `now` is always an argument, never Date.now() -- the only way a test can
// reach the recency half of Frecency.

// Unix seconds. The QML caller divides Date.now() by 1000.
var DAY = 86400;

// How long it takes a choice to be worth half of what it was. Fourteen days:
// long enough that something used daily sits near its ceiling rather than
// climbing forever; short enough that something used once and abandoned
// falls past the floor in a couple of months rather than outliving the machine.
var HALF_LIFE = 14 * DAY;

// What one choice adds. The unit the ceiling and floor are expressed in --
// a weight of 1 is "chosen once, just now".
var CHOICE = 1;

// Below this a record isn't worth keeping. A single choice decays past it in
// about eight weeks, which lets an uninstalled application leave the store on its own.
var FLOOR = 0.05;

// The weakest store that may hand out the full ceiling, in choices.
// Normalising against the strongest record alone would give a store holding
// one record the full ceiling for having been chosen once -- the most
// aggressive calibration possible, arriving exactly when least earned (a
// single launch would put an application above the running window of
// itself). Six choices' worth is "you've chosen this a few times", and it
// decays like everything else, so the ceiling stays reachable by ongoing use
// rather than a lifetime total.
var CEILING_AT = 6 * CHOICE;

// How many records survive a prune -- the backstop for churn the decay floor
// is too slow for, not the normal bound (the applications/directories a
// person actually chooses is a much smaller number).
var MAX_RECORDS = 512;

// The on-disk shape, so an older Launcher meeting a newer store reads it as
// empty rather than acting on fields it doesn't understand.
var VERSION = 1;

function storeOf(entries) {
    return { version: VERSION, entries: entries };
}

// Records are never edited in place, so sharing them between a store and its
// successor is safe -- what makes returning a new store on every change cheap.
function copyOf(entries) {
    var copy = {};
    var keys = Object.keys(entries);
    for (var i = 0; i < keys.length; i++)
        copy[keys[i]] = entries[keys[i]];
    return copy;
}

function emptyStore() {
    return storeOf({});
}

// A Provider that opted out of Entry Keys carries nothing -- this is the one
// place "no key" is decided, rather than every caller checking.
function isKey(key) {
    return typeof key === "string" && key !== "";
}

// Guarded against `now` behind the recorded timestamp -- not hypothetical on
// a laptop (an NTP correction or a suspend across a timezone change gets
// there), and an unguarded exponent would turn decay into growth.
function decayed(weight, at, now) {
    var elapsed = now - at;
    if (!(elapsed > 0))
        return weight;
    return weight * Math.pow(0.5, elapsed / HALF_LIFE);
}

// One record, or null. The gate every field passes through, so parse()
// below is a shape check rather than a trust exercise.
function recordOf(value) {
    if (!value || typeof value !== "object")
        return null;

    var weight = value.weight;
    var at = value.at;
    if (typeof weight !== "number" || !isFinite(weight) || weight <= 0)
        return null;
    if (typeof at !== "number" || !isFinite(at))
        return null;

    return { weight: weight, at: at };
}

// Never throws, for anything: a missing file, a write truncated by a crash,
// a hand-edit, a file from a later version. This is read into a QML property
// the merged Entry list binds on, so a throw here would take the whole list
// down -- the opposite of degrading to no-Frecency.
function parse(text) {
    if (typeof text !== "string" || text === "")
        return emptyStore();

    var raw;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        return emptyStore();
    }

    if (!raw || typeof raw !== "object" || raw.version !== VERSION)
        return emptyStore();

    var source = raw.entries;
    if (!source || typeof source !== "object")
        return emptyStore();

    // Per record, not all-or-nothing: one bad record isn't a reason to
    // forget every good one.
    var entries = {};
    var keys = Object.keys(source);
    for (var i = 0; i < keys.length; i++) {
        var record = recordOf(source[keys[i]]);
        if (record !== null)
            entries[keys[i]] = record;
    }

    return storeOf(entries);
}

function serialize(store) {
    return JSON.stringify(storeOf(store.entries));
}

// Returns a new store, except for a key it won't record, where it returns
// **the store it was given** -- the caller's signal that nothing happened
// (the Launcher reads it to decide whether a write is owed).
//
// New, not mutated: the Launcher holds the store in a QML property and
// re-ranks off a binding on it, and a mutation in place notifies nothing.
//
// The weight is decayed to `now` before the hit is added, so a record is
// always "worth this much, as of this moment" -- nothing needs re-decaying
// later or sweeping on a timer.
function bump(store, key, now) {
    if (!isKey(key))
        return store;

    var entries = copyOf(store.entries);
    var previous = entries[key];
    var weight = previous ? decayed(previous.weight, previous.at, now) : 0;

    entries[key] = { weight: weight + CHOICE, at: now };
    return storeOf(entries);
}

// Keeps the later record for any key both hold. Exists for one real race:
// the store loads asynchronously, so a choice made in the first moments
// after startup lands in memory before the file does. Replacing with the
// file's store would lose that choice; ignoring the file would throw away
// everything already accumulated. Merging is the only answer that loses neither.
//
// Later by timestamp, not weight: a record written just now already has the
// older one's decayed weight folded in (see bump), so it's strictly better
// informed. Weight only breaks a same-second timestamp tie.
function mergeStores(a, b) {
    var entries = copyOf(a.entries);

    var fromB = Object.keys(b.entries);
    for (var k = 0; k < fromB.length; k++) {
        var key = fromB[k];
        var mine = b.entries[key];
        var theirs = entries[key];

        if (!theirs || mine.at > theirs.at || (mine.at === theirs.at && mine.weight > theirs.weight))
            entries[key] = mine;
    }

    return storeOf(entries);
}

function weightsAt(store, now) {
    var out = {};
    var keys = Object.keys(store.entries);
    for (var i = 0; i < keys.length; i++) {
        var record = store.entries[keys[i]];
        out[keys[i]] = decayed(record.weight, record.at, now);
    }
    return out;
}

// Entry Key to a number in [0, 1], 1 being the most used thing in the store.
//
// Normalised against the strongest record, not an absolute scale -- there
// isn't one (how often a heavy user opens their editor in a fortnight isn't
// knowable in advance).
//
// Logarithmic, so the gap between first and second place doesn't swallow the
// whole range: linear normalisation against a favourite chosen fifty times
// would leave everything chosen five times at 0.1, indistinguishable from
// never chosen once rank() rounds it. The log keeps order identical while
// spreading the field.
//
// Floored at CEILING_AT so a near-empty store can't hand out the ceiling.
function usageOf(store, now) {
    var weights = weightsAt(store, now);
    var keys = Object.keys(weights);

    var max = 0;
    for (var i = 0; i < keys.length; i++) {
        if (weights[keys[i]] > max)
            max = weights[keys[i]];
    }

    // {} rather than a map of zeroes is what makes an empty store cost rank() nothing.
    if (max <= 0)
        return {};

    var scale = Math.log1p(max > CEILING_AT ? max : CEILING_AT);
    var usage = {};
    for (var k = 0; k < keys.length; k++) {
        var value = weights[keys[k]];
        if (value > 0)
            usage[keys[k]] = Math.log1p(value) / scale;
    }
    return usage;
}

// Nothing ever tells this store that an Entry disappeared (an uninstalled
// application, a deleted directory) -- it just stops being offered, with no
// event to react to. So the bound can't come from asking what still exists;
// it comes from two rules that need no such knowledge: a record decayed
// below the floor is dropped, and what survives is capped. The floor is what
// matters in practice (a key that stopped being chosen leaves on its own);
// the cap is the backstop for churn the floor is too slow for.
function prune(store, now, limit) {
    var cap = limit > 0 ? limit : MAX_RECORDS;
    var weights = weightsAt(store, now);

    var kept = [];
    var keys = Object.keys(weights);
    for (var i = 0; i < keys.length; i++) {
        if (weights[keys[i]] >= FLOOR)
            kept.push(keys[i]);
    }

    if (kept.length > cap) {
        // Descending by current weight, so the cap keeps the strongest.
        kept.sort(function (a, b) {
            return weights[b] - weights[a];
        });
        kept = kept.slice(0, cap);
    }

    var entries = {};
    for (var k = 0; k < kept.length; k++)
        entries[kept[k]] = store.entries[kept[k]];

    return storeOf(entries);
}

// Inert under QML. See the tail of matching.js.
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        emptyStore: emptyStore,
        parse: parse,
        serialize: serialize,
        bump: bump,
        mergeStores: mergeStores,
        usageOf: usageOf,
        prune: prune
    };
}
