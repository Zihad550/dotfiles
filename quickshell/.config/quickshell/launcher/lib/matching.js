// Matching and ranking for the Launcher -- the single seam under test.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run (tests/launcher/).
//
// Note the absence of `.pragma library`: that line is a syntax error under
// node, so a file that loads in both cannot carry it. The price is that each
// importing QML document gets its own copy of this scope, which costs nothing
// here because everything below is a pure function over its arguments. Only
// top-level `function` declarations are reliably reachable from QML, so
// anything a consumer needs is a function, not a constant.

// Returned by score() when the needle is not a subsequence of the haystack.
var NO_MATCH = -1;

// Ranking is one integer per entry so the top-N buffer compares numbers and
// never calls a comparator. The low bits hold the length tie-break: shorter
// haystacks win at equal quality, and the shift is wide enough that a
// one-point difference in quality always outranks any length difference.
var LENGTH_SHIFT = 1024;

// Per matched character, before bonuses.
var SCORE_CHAR = 1;

// Matching at the start of a segment -- after a path separator, a dash, an
// underscore. The corpus is mostly paths and desktop-entry names, so
// separators carry this signal. camelCase does not survive the lowercasing
// that happens once at load and is not worth a second pass over the original.
var SCORE_BOUNDARY = 6;

// Matching at index 0. Strictly better than a mid-string boundary.
var SCORE_START = 10;

// Multiplied by the run length so far, so runs are superlinear. This is what
// keeps an exact-prefix match above a path whose segments merely each begin
// with a query character -- the specific misranking the benchmark scorer had,
// where three boundary bonuses beat a three-character run.
var SCORE_CONSECUTIVE = 8;

// How much a fully-used Entry is worth, in quality points. Frecency arrives in
// ticket 07; this constant and the `usage` option exist now so that landing it
// fills a parameter rather than reshaping the seam its tests are written
// against. At 24 it is worth roughly a three-character contiguous match.
var FRECENCY_WEIGHT = 24;

// How much it is worth that the Query is *exactly* an Entry's own name, in
// quality points. Ticket 20: typing "zed" scored the running Zed window and the
// Zed application identically -- the window carries "Zed" as its short
// application id -- so pool order decided it and the window won, though only one
// of the two is *named* Zed.
//
// Smaller than FRECENCY_WEIGHT, but **not unconditionally smaller than a real
// Frecency score**: that arrives as round(usage * 24), and usageOf normalises
// against a CEILING_AT of six choices, so even the most-used Entry in a store
// clears 12 only once it has been chosen about twice. Under that an exact name
// wins. Deliberate -- one launch is the calibration frecency.js's CEILING_AT
// exists to distrust -- and pinned by a test at the boundary.
var EXACT_WEIGHT = 12;

// How many Entries rank() keeps. Only the visible portion is ever rendered, so
// ranking the rest is wasted work.
var DEFAULT_LIMIT = 200;

function isBoundaryCode(code) {
    return code === 47      // /
        || code === 92      // \
        || code === 45      // -
        || code === 95      // _
        || code === 46      // .
        || code === 32;     // space
}

// Bonus for landing at `at`, given nothing precedes it in the match.
function positionBonus(haystack, at) {
    if (at === 0)
        return SCORE_START;
    if (isBoundaryCode(haystack.charCodeAt(at - 1)))
        return SCORE_BOUNDARY;
    return 0;
}

// The needle occurs whole at `at`. Every character after the first is
// consecutive, so this is the closed form of the per-character loop.
function scoreContiguous(haystack, at, needleLength) {
    var runs = needleLength - 1;
    return SCORE_CHAR * needleLength
        + positionBonus(haystack, at)
        + SCORE_CONSECUTIVE * (runs * (runs + 1)) / 2;
}

// Greedy leftmost subsequence walk. Also the match test: returns NO_MATCH when
// the needle is not a subsequence at all.
function scoreScattered(haystack, needle) {
    var haystackLength = haystack.length;
    var needleLength = needle.length;
    var total = 0;
    var h = 0;
    var run = 0;

    for (var n = 0; n < needleLength; n++) {
        var code = needle.charCodeAt(n);

        // Where this character would land to be consecutive with the previous
        // one. Captured before the scan, because `found` is assigned from `h`
        // and comparing the two afterwards is always true.
        var consecutiveAt = h;
        var found = NO_MATCH;
        while (h < haystackLength) {
            if (haystack.charCodeAt(h) === code) {
                found = h;
                break;
            }
            h++;
        }
        if (found < 0)
            return NO_MATCH;

        run = (n > 0 && found === consecutiveAt) ? run + 1 : 0;
        total += SCORE_CHAR + SCORE_CONSECUTIVE * run;
        if (run === 0)
            total += positionBonus(haystack, found);
        h++;
    }

    return total;
}

// Both arguments must already be lowercased -- see prepare(). An empty needle
// matches everything at 0, which leaves the empty Query in encounter order for
// Frecency to reorder.
function score(haystack, needle) {
    var needleLength = needle.length;
    if (needleLength === 0)
        return 0;

    var haystackLength = haystack.length;
    if (needleLength > haystackLength)
        return NO_MATCH;

    // indexOf is native, so a contiguous hit is worth looking for before
    // walking the haystack in JavaScript.
    var at = haystack.indexOf(needle);
    var quality;
    if (at < 0) {
        quality = scoreScattered(haystack, needle);
        if (quality < 0)
            return NO_MATCH;
    } else if (at === 0) {
        // At index 0 the contiguous path is provably the best one: it already
        // holds the largest position bonus there is, and its run bonus grows
        // quadratically with the needle while every alternative path trades
        // run length for a flat 6 per boundary. Nothing catches it, so the
        // walk can be skipped -- and typing the start of a name is the common
        // case this fast path exists for.
        quality = scoreContiguous(haystack, 0, needleLength);
    } else {
        // Anywhere else a contiguous hit is *not* automatically the best path,
        // which this used to assume. "alpha beta ab" against "ab" scores 16
        // contiguous at index 11 but 18 scattered across the two word
        // initials, so trusting the fast path ranked it below plain "alpha
        // beta" -- an Entry containing strictly less. Score both, keep the
        // better. scoreScattered cannot fail here: indexOf already proved the
        // needle is a subsequence.
        var contiguous = scoreContiguous(haystack, at, needleLength);
        var scattered = scoreScattered(haystack, needle);
        quality = scattered > contiguous ? scattered : contiguous;
    }

    var lengthPenalty = haystackLength < LENGTH_SHIFT ? haystackLength : LENGTH_SHIFT - 1;
    return quality * LENGTH_SHIFT - lengthPenalty;
}

// Lowercase the corpus once, at load. Doing it inside score() instead would
// run toLowerCase() over every Entry on every keystroke, which would dominate
// the cost of matching.
//
// `keys` is the parallel array of Entry Keys, with a null or empty slot for
// Entries whose Provider supplies none. Pass nothing when no Provider in the
// pool has them.
//
// `owners` is the parallel array of Entry indices, for a Provider that gives an
// Entry more than one text to be found by -- the windows Provider matches a
// window on its title and on its application. Pass nothing when the corpus is
// one text per Entry, which leaves rank()'s indices already in Entry space.
// `names` is derived rather than passed: **an Entry's name is its first text**,
// and every multi-text Provider owes prepare() that order. The rule is stated
// once, in lib/catalog.js's header, where a Provider author meets it, and
// asserted per Provider in that Provider's own tests via
// tests/launcher/catalog-check.js. The first text is what EXACT_WEIGHT is
// measured against, so the bonus means "this Entry is called that" rather than
// "this Entry knows that word", and a Provider that lists an alias first
// silently forfeits the bonus for the name people actually read off the row.
// Without owners every text is its own Entry's name.
//
// Named for the concept it carries rather than "primary", which CONTEXT.md
// already spends on a Core Action's primary slot.
function prepare(texts, keys, owners) {
    var lower = new Array(texts.length);
    var names = new Array(texts.length);
    var seen = {};

    for (var i = 0; i < texts.length; i++) {
        lower[i] = texts[i].toLowerCase();

        var owner = owners ? owners[i] : i;
        names[i] = seen[owner] !== true;
        seen[owner] = true;
    }

    return {
        texts: texts,
        lower: lower,
        names: names,
        keys: keys || null,
        owners: owners || null
    };
}

// Whether the previous result set is a sound starting point for `query`.
//
// Sound only because matching is a subsequence test: a string that does not
// contain "fo" as a subsequence cannot contain "foo" either, so the previous
// match set is a superset of the new one. It would be wrong for a matcher that
// can match on something a shorter query missed.
function canNarrow(previousQuery, query) {
    if (previousQuery === "" || previousQuery === undefined || previousQuery === null)
        return false;
    if (query.length <= previousQuery.length)
        return false;
    return query.toLowerCase().indexOf(previousQuery.toLowerCase()) === 0;
}

// Rank a prepared corpus against a query.
//
// options.limit      how many to return (default 200)
// options.usage      map of Entry Key -> Frecency in [0, 1], or null
// options.narrowFrom `matched` from a previous rank whose query canNarrow()
//                    accepts, so the scan skips known non-matches
//
// Returns { indices, scores, matched, total }. `indices` is the ranked top-N;
// `matched` is every matching index, unranked and in encounter order, which is
// what a later narrowing pass needs -- narrowing the top-N would throw away
// Entries a longer query still has to see.
function rank(corpus, query, options) {
    var opts = options || {};
    var limit = opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
    var usage = opts.usage || null;
    var narrowFrom = opts.narrowFrom || null;

    var needle = query.toLowerCase();
    var lower = corpus.lower;
    var keys = corpus.keys;
    var names = corpus.names || null;

    // A fixed buffer of the best `limit`, held sorted descending, inserted
    // into. Once it is full the common case is one numeric comparison against
    // its worst entry and nothing else -- no allocation, and no comparator
    // call, which is the expensive part of Array.sort in a JS engine.
    //
    // The shift condition is a strict `<`, so equal scores stay in encounter
    // order and the result matches a stable full sort exactly.
    var bufIndex = new Array(limit);
    var bufScore = new Array(limit);
    var kept = 0;

    var matched = [];
    var scan = narrowFrom !== null ? narrowFrom.length : lower.length;

    for (var k = 0; k < scan; k++) {
        var i = narrowFrom !== null ? narrowFrom[k] : k;
        var entryScore = score(lower[i], needle);
        if (entryScore < 0)
            continue;

        matched.push(i);

        // The Query is the whole of this Entry's own name. Both halves matter:
        // an alias that happens to equal the Query is still an alias, and a name
        // the Query is only part of is still not what was asked for. See
        // EXACT_WEIGHT.
        if (needle !== "" && names !== null && names[i] === true && lower[i] === needle)
            entryScore += EXACT_WEIGHT * LENGTH_SHIFT;

        if (usage !== null && keys !== null) {
            var key = keys[i];
            if (key) {
                var used = usage[key];
                if (used > 0)
                    entryScore += Math.round(used * FRECENCY_WEIGHT) * LENGTH_SHIFT;
            }
        }

        if (kept === limit && entryScore <= bufScore[kept - 1])
            continue;

        var p = kept < limit ? kept++ : limit - 1;
        while (p > 0 && bufScore[p - 1] < entryScore) {
            bufScore[p] = bufScore[p - 1];
            bufIndex[p] = bufIndex[p - 1];
            p--;
        }
        bufScore[p] = entryScore;
        bufIndex[p] = i;
    }

    return {
        indices: bufIndex.slice(0, kept),
        scores: bufScore.slice(0, kept),
        matched: matched,
        total: matched.length
    };
}

// Turn a ranking over corpus texts into a ranking over Entries, keeping each
// Entry's best text.
//
// A Provider may give one Entry several texts -- a window is found by its title
// and by its application, and the two are scored separately rather than
// concatenated, because one long haystack would lose to a short one on
// score()'s length tie-break and the window would rank below the application
// that spawned it.
//
// The walk keeps the first occurrence of each owner, which is that owner's best
// text because `indices` is already descending, and the surviving order is
// therefore still descending. Inert -- returns its argument -- for a corpus
// prepared without owners.
//
// `matched` and `total` pass through untouched, still indexing texts: they
// exist for narrowing, which scans texts.
function collapse(corpus, result) {
    var owners = corpus.owners;
    if (owners === null || owners === undefined)
        return result;

    var indices = [];
    var scores = [];
    var seen = {};

    for (var i = 0; i < result.indices.length; i++) {
        var owner = owners[result.indices[i]];
        if (seen[owner] === true)
            continue;
        seen[owner] = true;
        indices.push(owner);
        scores.push(result.scores[i]);
    }

    return {
        indices: indices,
        scores: scores,
        matched: result.matched,
        total: result.total
    };
}

// Interleave several Providers' rankings into one, best first.
//
// Scores are comparable across Providers because there is one scorer and one
// scale -- that is what makes a single pool possible at all, and why Frecency
// is specified as the only ranking signal shared between them.
//
// `results` is one rank() result per Provider, each already descending, in the
// pool's own order. That order is the tie-break, and it is load-bearing rather
// than incidental: an empty Query scores everything 0, so with no Frecency yet
// the pool order is the *whole* ordering. It also decides the case this ticket
// exists for -- a running window and the application that would launch a second
// copy of it score identically, so whichever Provider comes first in the pool
// is the one Enter acts on.
//
// Returns [{ provider, index }], where `provider` indexes `results` and `index`
// indexes that Provider's Entries.
function merge(results, limit) {
    var cap = limit > 0 ? limit : DEFAULT_LIMIT;
    var cursors = new Array(results.length);
    for (var p = 0; p < results.length; p++)
        cursors[p] = 0;

    var out = [];
    while (out.length < cap) {
        var best = -1;
        var bestScore = 0;

        // Strictly greater, so an earlier Provider keeps a tie.
        for (var q = 0; q < results.length; q++) {
            var cursor = cursors[q];
            if (cursor >= results[q].indices.length)
                continue;
            var candidate = results[q].scores[cursor];
            if (best < 0 || candidate > bestScore) {
                best = q;
                bestScore = candidate;
            }
        }

        if (best < 0)
            break;

        out.push({
            provider: best,
            index: results[best].indices[cursors[best]]
        });
        cursors[best]++;
    }

    return out;
}

// Inert under QML, where `module` is undefined and the top-level function
// declarations above are reachable directly on the imported namespace.
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        NO_MATCH: NO_MATCH,
        LENGTH_SHIFT: LENGTH_SHIFT,
        FRECENCY_WEIGHT: FRECENCY_WEIGHT,
        EXACT_WEIGHT: EXACT_WEIGHT,
        DEFAULT_LIMIT: DEFAULT_LIMIT,
        score: score,
        prepare: prepare,
        canNarrow: canNarrow,
        rank: rank,
        collapse: collapse,
        merge: merge
    };
}
