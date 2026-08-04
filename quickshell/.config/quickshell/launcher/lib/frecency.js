// The Frecency store: how often and how recently an Entry has been chosen.
//
// Split out for the same reason matching.js and actions.js are, and with the
// same sharp edge as matching.js: a wrong answer looks like a preference rather
// than a fault. An Entry that should have risen and did not shows no error and
// logs nothing, so this is a seam with tests rather than arithmetic inlined in
// a QML binding.
//
// Free of QML types, and no `.pragma library` (a syntax error under node), for
// the reasons given at the top of matching.js. That has a second consequence
// here specifically: without the pragma every importing document gets its own
// copy of this scope, so **this module must hold no state**. It is pure
// functions over a store the caller owns -- which is exactly what ticket 01
// concluded when it recorded that the store has to live in QML and be passed
// into rank() as `usage`.
//
// `now` is always an argument, never Date.now(). Recency is the half of
// Frecency that a test cannot reach any other way.

// Unix seconds. Everything below is in these; the QML caller divides
// Date.now() by 1000.
var DAY = 86400;

// How long it takes a choice to be worth half of what it was.
//
// Fourteen days. The two things this is balanced between: something used every
// day should sit near its ceiling rather than climbing forever, and something
// used once and abandoned should fall past the floor below in a couple of
// months rather than outliving the machine. A day would make the Launcher
// forget between working sessions; a year would make it a lifetime install
// counter, which is the thing plain frequency already gets wrong.
var HALF_LIFE = 14 * DAY;

// What one choice adds. The unit the ceiling and the floor are expressed in --
// a weight of 1 is "chosen once, just now".
var CHOICE = 1;

// Below this a record is not worth keeping. A single choice decays past it in
// about eight weeks, which is what makes an uninstalled application eventually
// leave the store on its own.
var FLOOR = 0.05;

// The weakest store that may hand out the full ceiling, in choices.
//
// Normalising against the strongest record alone means a store holding a single
// record gives that record 1.0 -- the whole 24 quality points, for having been
// chosen once. That is the most aggressive calibration Frecency can produce and
// it arrives on a *fresh* store, which is exactly when it is least earned: one
// launch would put an application above the running window of itself and above
// any better textual match.
//
// So the divisor has a floor. Six choices' worth, which is "you have chosen this
// a few times", and it decays like everything else -- so the ceiling is reachable
// by ongoing use rather than by a lifetime total. Above it the normalisation is
// against the store, as it has to be: how often a heavy user opens their editor
// in a fortnight is not a number this can know.
var CEILING_AT = 6 * CHOICE;

// How many records survive a prune. Reached only by churn -- the applications
// and directories a person actually chooses is a much smaller number -- so this
// is the backstop for the case decay alone is slow at, not the normal bound.
var MAX_RECORDS = 512;

// The on-disk shape, so an older Launcher meeting a newer store reads it as
// empty rather than acting on fields it does not understand.
var VERSION = 1;

// Every store this module hands out is built here, so the on-disk shape is
// written once rather than in each of the six functions that return one.
function storeOf(entries) {
    return { version: VERSION, entries: entries };
}

// A shallow copy of a record map. The records themselves are never edited in
// place, so sharing them between a store and its successor is safe -- and it is
// what makes returning a new store on every change cheap enough to do
// unconditionally.
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

// A key worth recording against. The shell hands over whatever the Entry
// carries, and a Provider that opted out of Entry Keys carries nothing -- so
// this is the one place "no key" is decided, rather than every caller checking.
function isKey(key) {
    return typeof key === "string" && key !== "";
}

// What a stored weight is worth now. Guarded against a `now` behind the
// recorded timestamp, which is not hypothetical on a laptop -- an NTP
// correction or a suspend across a timezone change gets there, and an
// unguarded exponent turns decay into growth.
function decayed(weight, at, now) {
    var elapsed = now - at;
    if (!(elapsed > 0))
        return weight;
    return weight * Math.pow(0.5, elapsed / HALF_LIFE);
}

// One record, or null for anything that is not one. The gate every field passes
// through, so parse() below is a shape check rather than a trust exercise.
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

// Read a store from text. **Never throws**, for anything: a missing file, a
// write truncated by a crash, a hand-edit, a file from a later version.
//
// That is not defensiveness for its own sake. This is read into a QML property
// that the merged Entry list is a binding on, and a throw inside a binding
// takes the whole list down -- so an unguarded parse would spend the Launcher
// to save the Frecency, which is the opposite of degrading to no-Frecency.
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

    // Per record rather than all-or-nothing: one bad record is not a reason to
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

// Record a choice. Returns a new store; the argument is untouched.
//
// Except for a key it will not record, where it returns **the store it was
// given**. That is the caller's signal that nothing happened -- the Launcher
// reads it to decide whether a write is owed -- so it is part of the contract
// rather than an accident of the early return.
//
// New rather than mutated, and this is load-bearing rather than hygiene: the
// Launcher holds the store in a QML property and re-ranks off a binding on it,
// and a mutation in place notifies nothing -- the Entries would keep their old
// order until something unrelated happened to change.
//
// The weight is decayed to `now` before the hit is added, which is what makes
// the sequence of choices commutative with the passage of time: a record is
// always "worth this much, as of this moment", so nothing has to be re-decayed
// later or swept on a timer.
function bump(store, key, now) {
    if (!isKey(key))
        return store;

    var entries = copyOf(store.entries);
    var previous = entries[key];
    var weight = previous ? decayed(previous.weight, previous.at, now) : 0;

    entries[key] = { weight: weight + CHOICE, at: now };
    return storeOf(entries);
}

// Combine two stores, keeping the later record for any key both hold. Returns a
// new store; neither argument is touched.
//
// This exists for one race, and it is not a theoretical one. The store loads
// asynchronously, so a choice made in the first moments after startup lands in
// memory before the file does. Replacing the in-memory store with the file's
// would lose that choice; ignoring the file to keep it would throw away
// everything Frecency had accumulated over a single hit. Merging is the only
// answer that loses neither.
//
// Later by timestamp, not by weight: a record written just now already has the
// older one's decayed weight folded into it (see bump), so the newer record is
// strictly better informed. Weight breaks a timestamp tie, which is only
// reachable within the same second.
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

// Every stored key's current weight, as of `now`. The internal currency the two
// public readers below share.
function weightsAt(store, now) {
    var out = {};
    var keys = Object.keys(store.entries);
    for (var i = 0; i < keys.length; i++) {
        var record = store.entries[keys[i]];
        out[keys[i]] = decayed(record.weight, record.at, now);
    }
    return out;
}

// The map rank() blends: Entry Key to a number in [0, 1], where 1 is the most
// used thing in the store.
//
// Normalised against the strongest record rather than against an absolute
// scale, because there is no absolute scale -- how many times a heavy user
// launches their editor in a fortnight is not a number this can know, and a
// fixed divisor would either saturate everything or lift nothing.
//
// Logarithmic, so the gap between the top and second place does not swallow the
// whole range. Linear normalisation against a favourite chosen fifty times
// leaves everything chosen five times at 0.1, which rank() rounds to two
// quality points -- indistinguishable from never chosen. The log keeps the
// order identical while spreading the field it is drawn from.
//
// Floored at CEILING_AT, so a near-empty store cannot hand out the ceiling. See
// that constant for why a fresh store is the case that needs it.
function usageOf(store, now) {
    var weights = weightsAt(store, now);
    var keys = Object.keys(weights);

    var max = 0;
    for (var i = 0; i < keys.length; i++) {
        if (weights[keys[i]] > max)
            max = weights[keys[i]];
    }

    // No records, or nothing left with any weight. Returning {} rather than a
    // map of zeroes is what makes an empty store cost rank() nothing.
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

// Bound the store. Returns a new store; the argument is untouched.
//
// Nothing ever tells this store that an Entry has disappeared -- an uninstalled
// application, a deleted directory and a renamed screenshot all simply stop
// being offered, with no event to react to. So the bound cannot come from
// asking what still exists. It comes from two rules that need no such
// knowledge: a record decayed below the floor is dropped, and what survives is
// capped.
//
// The floor is the one that matters in practice, because it is what makes a key
// that stopped being chosen leave on its own. The cap is the backstop for
// churn the floor is too slow for.
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
        // Descending by current weight, so the cap keeps the strongest. Only
        // reached on churn, and over at most a few thousand keys.
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
