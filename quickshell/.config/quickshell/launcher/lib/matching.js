// Matching and ranking for the Launcher -- the single seam under test.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/).
//
// No `.pragma library`: that's a syntax error under node, so a file loading
// in both can't carry it. Each importing QML document gets its own copy of
// this scope, which costs nothing since everything below is a pure function
// over its arguments. Only top-level `function` declarations are reliably
// reachable from QML, so anything a consumer needs is a function, not a constant.

// Returned by score() when the needle isn't a subsequence of the haystack.
var NO_MATCH = -1;

// One integer per entry so the top-N buffer compares numbers, never calls a
// comparator. The low bits hold the length tie-break (shorter haystacks win
// at equal quality); the shift is wide enough that a one-point quality
// difference always outranks any length difference.
var LENGTH_SHIFT = 1024;

var SCORE_CHAR = 1;

// Matching at the start of a segment (after a path separator, dash,
// underscore). camelCase doesn't survive the lowercasing done once at load
// and isn't worth a second pass over the original.
var SCORE_BOUNDARY = 6;

// Matching at index 0 -- strictly better than a mid-string boundary.
var SCORE_START = 10;

// Multiplied by the run length so far, so runs are superlinear -- what keeps
// an exact-prefix match above a path whose segments merely each begin with a
// query character (three boundary bonuses would otherwise beat a
// three-character run).
var SCORE_CONSECUTIVE = 8;

// How much a fully-used Entry is worth, in quality points. At 24, roughly a
// three-character contiguous match.
var FRECENCY_WEIGHT = 24;

// How much it's worth that the Query is *exactly* an Entry's own name, in
// quality points. Without this, typing "zed" scored the running Zed window
// and the Zed application identically (the window carries "Zed" as its
// short application id), so pool order alone decided the winner.
//
// Smaller than FRECENCY_WEIGHT, but not unconditionally smaller than a real
// Frecency score: that arrives as round(usage * 24), and usageOf normalises
// against a ceiling of six choices, so even the most-used Entry in a store
// only clears 12 once chosen about twice. Under that, an exact name wins --
// deliberate, since one launch is exactly the calibration frecency.js's
// ceiling exists to distrust.
var EXACT_WEIGHT = 12;

// How many Entries rank() keeps -- only the visible portion is ever
// rendered, so ranking the rest is wasted work.
var DEFAULT_LIMIT = 200;

function isBoundaryCode(code) {
    return code === 47      // /
        || code === 92      // \
        || code === 45      // -
        || code === 95      // _
        || code === 46      // .
        || code === 32;     // space
}

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

// Greedy leftmost subsequence walk. Also the match test: returns NO_MATCH
// when the needle isn't a subsequence at all.
function scoreScattered(haystack, needle) {
    var haystackLength = haystack.length;
    var needleLength = needle.length;
    var total = 0;
    var h = 0;
    var run = 0;

    for (var n = 0; n < needleLength; n++) {
        var code = needle.charCodeAt(n);

        // Where this character would land to be consecutive with the
        // previous one, captured before the scan.
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

// Both arguments must already be lowercased -- see prepare(). An empty
// needle matches everything at 0, leaving the empty Query in encounter
// order for Frecency to reorder.
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
        // Provably the best path at index 0: it already holds the largest
        // position bonus there is, and its run bonus grows quadratically
        // with the needle while every alternative trades run length for a
        // flat 6 per boundary. The walk can be skipped.
        quality = scoreContiguous(haystack, 0, needleLength);
    } else {
        // Elsewhere a contiguous hit is *not* automatically the best path:
        // "alpha beta ab" against "ab" scores 16 contiguous at index 11 but
        // 18 scattered across the two word initials, so trusting the fast
        // path ranked it below plain "alpha beta" -- an Entry containing
        // strictly less. Score both, keep the better. scoreScattered can't
        // fail here: indexOf already proved the needle is a subsequence.
        var contiguous = scoreContiguous(haystack, at, needleLength);
        var scattered = scoreScattered(haystack, needle);
        quality = scattered > contiguous ? scattered : contiguous;
    }

    var lengthPenalty = haystackLength < LENGTH_SHIFT ? haystackLength : LENGTH_SHIFT - 1;
    return quality * LENGTH_SHIFT - lengthPenalty;
}

// Lowercase the corpus once, at load -- doing it inside score() would run
// toLowerCase() over every Entry on every keystroke.
//
// `keys` is the parallel array of Entry Keys (null/empty slot for a
// Provider that supplies none); pass nothing when no Provider in the pool has them.
//
// `owners` is the parallel array of Entry indices, for a Provider giving one
// Entry more than one searchable text (the windows Provider matches on
// title and application). Pass nothing when the corpus is one text per
// Entry. `names` is derived, not passed: an Entry's name is its first text
// (lib/catalog.js's rule), and that first text is what EXACT_WEIGHT is
// measured against, so a Provider listing an alias first silently forfeits
// the bonus for the name people actually read off the row.
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
// Sound only because matching is a subsequence test: a string that doesn't
// contain "fo" as a subsequence can't contain "foo" either, so the previous
// match set is a superset of the new one.
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
// Returns { indices, scores, matched, total }. `indices` is the ranked
// top-N; `matched` is every matching index, unranked, in encounter order --
// what a later narrowing pass needs (narrowing the top-N would throw away
// Entries a longer query still has to see).
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
    // into. Once full, the common case is one numeric comparison against
    // its worst entry -- no allocation, no comparator call.
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

        // The Query is the whole of this Entry's own name -- see EXACT_WEIGHT.
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
// Entry's best text. A Provider may give one Entry several texts (a window
// found by title and application), scored separately rather than
// concatenated -- one long haystack would lose to a short one on score()'s
// length tie-break, ranking a window below the application that spawned it.
//
// Keeps the first occurrence of each owner (that owner's best text, since
// `indices` is already descending). Inert for a corpus prepared without owners.
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

// Interleave several Providers' rankings into one, best first. Scores are
// comparable across Providers because there's one scorer and one scale --
// what makes a single pool possible at all.
//
// `results` is one rank() result per Provider, each already descending, in
// the pool's own order -- that order is the tie-break, and it's
// load-bearing: an empty Query scores everything 0, so pool order is the
// *whole* ordering with no Frecency yet. It also decides the case a running
// window and the application that would launch a second copy of it score
// identically for: whichever Provider comes first in the pool is the one
// Enter acts on.
//
// Returns [{ provider, index }], where `provider` indexes `results` and
// `index` indexes that Provider's Entries.
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
