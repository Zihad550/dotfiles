// Tests for the Launcher's matching and ranking module.
//
//     node --test "tests/launcher/*.test.js"
//
// This is the only seam in the Launcher that a running compositor is not
// needed to check, and the only one where a bug is invisible in use: a wrong
// ranking looks like a preference, not a fault.
//
// Everything here asserts external behaviour -- given a corpus and a Query,
// what comes back and in what order. Nothing asserts how scoring is computed,
// which buffers are used, or how narrowing is implemented, because those are
// exactly the things expected to change as this is tuned.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
// Where EXACT_WEIGHT meets a real Frecency score is a claim about the two
// modules together, so the store is built rather than a usage number invented.
const F = require("../../quickshell/.config/quickshell/launcher/lib/frecency.js");

// Rank a corpus and return the matching texts in order, which is what every
// assertion below is actually about.
function ranked(texts, query, options) {
    const corpus = M.prepare(texts, options && options.keys);
    const result = M.rank(corpus, query, options);
    return result.indices.map(i => texts[i]);
}

// The unbounded reference the bounded top-N buffer has to agree with: score
// everything, sort it stably, take the first N.
function fullSort(texts, query, limit) {
    const needle = query.toLowerCase();
    const scored = [];
    for (let i = 0; i < texts.length; i++) {
        const s = M.score(texts[i].toLowerCase(), needle);
        if (s >= 0)
            scored.push({ i: i, s: s });
    }
    // Array.prototype.sort is stable in every runtime this targets, so equal
    // scores keep encounter order -- which is the property being compared.
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map(e => texts[e.i]);
}

// Deep paths drawn from a small vocabulary, so prefixes repeat the way real
// project trees do and ties actually occur. A corpus of random strings would
// produce almost no ties and would not exercise the ordering guarantee.
function synthesize(n) {
    const words = ["src", "lib", "test", "node_modules", "dist", "internal", "pkg", "cmd", "components", "hooks", "utils", "config"];
    const roots = ["projects", "work", "dotfiles", "code/archive"];
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        let p = `/home/u/${roots[i % roots.length]}/repo${i % 40}`;
        const depth = 2 + (i % 4);
        for (let d = 0; d < depth; d++)
            p += `/${words[(i + d * 7) % words.length]}`;
        out[i] = p;
    }
    return out;
}

test("matches a subsequence and rejects a non-subsequence", () => {
    assert.ok(M.score("firefox", "ffx") >= 0, "scattered subsequence should match");
    assert.ok(M.score("firefox", "fox") >= 0, "out-of-order-looking but valid subsequence should match");
    assert.strictEqual(M.score("firefox", "fxf"), M.NO_MATCH, "wrong order should not match");
    assert.strictEqual(M.score("firefox", "z"), M.NO_MATCH, "absent character should not match");
    assert.strictEqual(M.score("fox", "firefox"), M.NO_MATCH, "needle longer than haystack should not match");
});

test("an empty query matches everything at equal score", () => {
    const texts = ["alpha", "beta", "gamma"];
    assert.deepStrictEqual(ranked(texts, ""), texts, "empty query keeps encounter order");
    assert.strictEqual(M.score("alpha", ""), 0);
    assert.strictEqual(M.score("", ""), 0);
});

test("matching ignores case on both sides", () => {
    assert.deepStrictEqual(ranked(["Firefox", "Thunderbird"], "FIRE"), ["Firefox"]);
    assert.deepStrictEqual(ranked(["Firefox", "Thunderbird"], "fire"), ["Firefox"]);
});

test("consecutive matches rank above scattered ones", () => {
    assert.deepStrictEqual(
        ranked(["s_o_m_e_t_h_i_n_g", "sometimes"], "some"),
        ["sometimes", "s_o_m_e_t_h_i_n_g"]);
});

test("word-boundary matches rank above mid-word ones", () => {
    assert.deepStrictEqual(
        ranked(["xfxxbxxx", "foo-bar"], "fb"),
        ["foo-bar", "xfxxbxxx"]);
});

test("an exact prefix ranks above a path whose segments each start with a query character", () => {
    // The specific misranking the benchmark scorer had: three boundary bonuses
    // beat a three-character run, so /s/r/c outranked src.
    assert.deepStrictEqual(
        ranked(["/s/r/c", "src"], "src"),
        ["src", "/s/r/c"]);
    assert.deepStrictEqual(
        ranked(["/home/u/scripts/run/config", "/home/u/src"], "src"),
        ["/home/u/src", "/home/u/scripts/run/config"]);
});

test("containing the query outright never scores worse than only scattering it", () => {
    // The scorer used to treat a contiguous hit as automatically the best path
    // through a haystack and skip the scattered walk. It is not: "alpha beta"
    // scores 18 for "ab" across its two word initials, while the literal "ab"
    // at the end of "alpha beta ab" is worth only 16. Taking the fast path
    // there made an Entry score *lower* for containing the query outright.
    //
    // Both haystacks are the same length, so the length tie-break is out of
    // the comparison and this is about match quality alone.
    const withHit = M.score("alpha beta ab", "ab");
    const withoutHit = M.score("alpha beta zz", "ab");
    assert.ok(withHit >= withoutHit,
        `containing "ab" scored ${withHit}, below ${withoutHit} without it`);

    // The other direction: where the contiguous run genuinely is the better
    // path, it still has to be the one taken. Here the greedy scattered walk
    // starts on the leading "a" and never recovers, so only scoring both finds
    // the run.
    const contiguous = M.score("a-zzz-abc", "abc");
    const scatteredOnly = M.score("a-zzz-axbc", "abc");
    assert.ok(contiguous > scatteredOnly,
        `the run scored ${contiguous}, not above ${scatteredOnly}`);
});

test("a shorter haystack wins at equal match quality", () => {
    assert.deepStrictEqual(
        ranked(["gitk", "git"], "git"),
        ["git", "gitk"]);
});

test("bounded top-N agrees with a full sort, ties included", () => {
    const texts = synthesize(4000);
    for (const query of ["s", "sr", "src", "cmp", "lib", "no", "node", "u/d", "zzzz", ""]) {
        for (const limit of [1, 10, 200]) {
            assert.deepStrictEqual(
                ranked(texts, query, { limit: limit }),
                fullSort(texts, query, limit),
                `top-${limit} for ${JSON.stringify(query)} should equal the full sort`);
        }
    }
});

test("ties keep encounter order", () => {
    // Identical structure and length, so nothing but encounter order separates
    // them; reversing the input must reverse the output.
    const texts = ["zq", "zw", "ze", "zr"];
    assert.deepStrictEqual(ranked(texts, "z"), texts);
    assert.deepStrictEqual(ranked(texts.slice().reverse(), "z"), texts.slice().reverse());
});

test("the top-N buffer does not let a later equal score displace an earlier one", () => {
    // Fills the buffer exactly, then offers more entries of the same score.
    const texts = ["za", "zb", "zc", "zd"];
    assert.deepStrictEqual(ranked(texts, "z", { limit: 2 }), ["za", "zb"]);
});

test("narrowing a previous result set gives the same answer as scanning the corpus", () => {
    const texts = synthesize(4000);
    const corpus = M.prepare(texts);

    let previousQuery = "";
    let previous = null;

    for (const query of ["s", "sr", "src", "srci"]) {
        const full = M.rank(corpus, query);

        assert.strictEqual(M.canNarrow(previousQuery, query), previous !== null,
            `canNarrow should accept ${JSON.stringify(query)} after ${JSON.stringify(previousQuery)}`);

        if (previous !== null) {
            const narrowed = M.rank(corpus, query, { narrowFrom: previous.matched });
            assert.deepStrictEqual(narrowed.indices, full.indices, "narrowed ranking should match");
            assert.deepStrictEqual(narrowed.matched, full.matched, "narrowed match set should match");
        }

        previousQuery = query;
        previous = full;
    }
});

test("narrowing is refused when the new query is not an extension of the old one", () => {
    assert.strictEqual(M.canNarrow("src", "lib"), false);
    assert.strictEqual(M.canNarrow("src", "sr"), false, "deleting back must rescan");
    assert.strictEqual(M.canNarrow("src", "src"), false);
    assert.strictEqual(M.canNarrow("", "s"), false, "no previous set to narrow");
    assert.strictEqual(M.canNarrow("src", "srcs"), true);
    assert.strictEqual(M.canNarrow("SRC", "srcs"), true, "case must not defeat narrowing");
});

test("rank reports every match, not just the ones it returns", () => {
    const texts = ["za", "zb", "zc", "zd"];
    const result = M.rank(M.prepare(texts), "z", { limit: 2 });
    assert.strictEqual(result.indices.length, 2, "only the limit is ranked");
    assert.strictEqual(result.total, 4, "but the whole match set is counted");
    assert.deepStrictEqual(result.matched, [0, 1, 2, 3], "and kept in encounter order for narrowing");
});

test("usage reorders Entries that have an Entry Key", () => {
    const texts = ["gitk", "git"];
    const keys = ["gitk", "git"];
    assert.deepStrictEqual(ranked(texts, "git", { keys: keys }), ["git", "gitk"],
        "without usage, the shorter match wins");
    assert.deepStrictEqual(
        ranked(texts, "git", { keys: keys, usage: { gitk: 1 } }),
        ["gitk", "git"],
        "a heavily used Entry rises above a better textual match");
});

test("Providers supplying no Entry Key are unaffected by usage", () => {
    const texts = ["gitk", "git"];

    // No keys array at all -- the whole pool opts out.
    assert.deepStrictEqual(
        ranked(texts, "git", { usage: { gitk: 1 } }),
        ["git", "gitk"]);

    // A pool where only the second Entry has a key: usage for the keyless one
    // cannot apply, because there is nothing to accumulate it against.
    assert.deepStrictEqual(
        ranked(texts, "git", { keys: [null, "git"], usage: { gitk: 1, git: 1 } }),
        ["git", "gitk"]);
});

test("usage never promotes an Entry the query does not match", () => {
    assert.deepStrictEqual(
        ranked(["firefox", "git"], "git", { keys: ["firefox", "git"], usage: { firefox: 1 } }),
        ["git"]);
});

// --- Several corpus texts per Entry ------------------------------------------
//
// A window is matchable by its title and by its application. Those are scored
// as separate texts and collapsed back to one Entry, rather than concatenated
// into one haystack -- see collapse().

// Rank a corpus whose texts belong to entries, and return the entries in order.
function rankedEntries(entries, texts, owners, query, options) {
    const corpus = M.prepare(texts, options && options.keys, owners);
    const result = M.collapse(corpus, M.rank(corpus, query, options));
    return result.indices.map(i => entries[i]);
}

test("an Entry with several texts is returned once, at its best text's rank", () => {
    // Two windows, each matchable by title and by application id.
    const entries = ["firefox window", "editor window"];
    const texts = ["Some Page — Mozilla Firefox", "firefox", "notes.md — Zed", "dev.zed.Zed"];
    const owners = [0, 0, 1, 1];

    assert.deepStrictEqual(
        rankedEntries(entries, texts, owners, "firefox"),
        ["firefox window"],
        "matching two of an Entry's texts still yields one Entry");

    assert.deepStrictEqual(
        rankedEntries(entries, texts, owners, "zed"),
        ["editor window"],
        "an Entry is found by a text other than the one it displays");
});

test("an Entry is ranked by its best text, not by the first one that matches", () => {
    // The title matches poorly (scattered, long haystack); the application id
    // matches exactly. The short text is what has to decide the rank -- this is
    // what stops a window losing to the application that spawned it.
    const entries = ["window", "decoy"];
    const texts = ["f-i-r-e-f-o-x session log", "firefox", "firefox-ish"];
    const owners = [0, 0, 1];

    assert.deepStrictEqual(
        rankedEntries(entries, texts, owners, "firefox"),
        ["window", "decoy"]);
});

test("collapse leaves a corpus of one text per Entry alone", () => {
    const corpus = M.prepare(["gitk", "git"]);
    const result = M.rank(corpus, "git");
    assert.strictEqual(M.collapse(corpus, result), result,
        "a corpus prepared without owners is returned untouched");
});

// --- Merging Providers into one pool ----------------------------------------

// Rank each Provider's own corpus, then merge. The shape every consumer of the
// pool works in: [{ provider, index }].
function pooled(catalogs, query, options) {
    const results = catalogs.map(c => M.rank(M.prepare(c), query, options));
    return M.merge(results, options && options.limit)
        .map(pick => catalogs[pick.provider][pick.index]);
}

test("the pool is ordered by score, not by Provider", () => {
    // "git" is an exact whole-haystack match in the second Provider and a
    // mid-string one in the first, so the second Provider's Entry has to come
    // out on top despite being second in the pool.
    assert.deepStrictEqual(
        pooled([["not-git-really", "gitk"], ["git"]], "git"),
        ["git", "gitk", "not-git-really"]);
});

test("Providers earlier in the pool win ties", () => {
    // Identical text, so nothing but pool order separates them. A fixture for
    // merge() alone -- both texts are first texts, so both carry EXACT_WEIGHT
    // and it cancels. The windows-vs-application case this used to claim to
    // model is no longer a tie under ticket 20; it lives in its own test below,
    // against the corpus lib/windows.js actually builds.
    const picks = M.merge([
        M.rank(M.prepare(["firefox"]), "firefox"),
        M.rank(M.prepare(["decoy", "firefox"]), "firefox")
    ]);
    assert.deepStrictEqual(picks, [{ provider: 0, index: 0 }, { provider: 1, index: 1 }]);
});

// The exact-match rule, added after ticket 09's host round. Typing the whole
// name of a thing put the running *window* of it first, and the application was
// what was wanted -- see GitHub issue #32.
//
// The corpora below are the real ones: an application is one text, its own name;
// a window is three -- title, application id, short id -- and only the third of
// those is the bare name. So both score identically and pool order decided it.

// The window a running Zed produces, as lib/windows.js builds it.
function zedWindow() {
    return M.prepare(["dotfiles — Zed", "dev.zed.Zed", "Zed"], null, [0, 0, 0]);
}

test("an exact match on an Entry's own name outranks a window matching on its application", () => {
    // The window's third text, "Zed", is the whole Query yet earns nothing --
    // an id an Entry merely carries is a way in, not its name (checkbox 3). The
    // application's single text is its name, so it carries the bonus and wins.
    const windows = zedWindow();
    const apps = M.prepare(["Zed"], ["dev.zed.Zed.desktop"]);

    const picks = M.merge([
        M.collapse(windows, M.rank(windows, "zed")),
        M.rank(apps, "zed")
    ]);

    assert.deepStrictEqual(picks, [{ provider: 1, index: 0 }, { provider: 0, index: 0 }],
        "the application, whose name is exactly the Query, then the window");
});

test("a Query short of the whole name leaves the running window first", () => {
    // The other half of the rule, and the reason it is exactness rather than a
    // weighting: ticket 05's decision stands everywhere it was argued for.
    // Typing part of a name still offers what is already open.
    const windows = zedWindow();
    const apps = M.prepare(["Zed"], ["dev.zed.Zed.desktop"]);

    const picks = M.merge([
        M.collapse(windows, M.rank(windows, "ze")),
        M.rank(apps, "ze")
    ]);

    assert.deepStrictEqual(picks[0], { provider: 0, index: 0 },
        "the window, because nothing was matched exactly");
});

test("a window whose own title is the Query is exact too", () => {
    // The bonus is a property of the *text that matched*, not of the Provider.
    // A window titled exactly what was typed has been named exactly, so it wins
    // its tie with the application the same way it always did -- by pool order,
    // with both sides holding the bonus.
    const windows = M.prepare(["zed", "dev.zed.Zed"], null, [0, 0]);
    const apps = M.prepare(["zed"], ["dev.zed.Zed.desktop"]);

    const picks = M.merge([
        M.collapse(windows, M.rank(windows, "zed")),
        M.rank(apps, "zed")
    ]);

    assert.deepStrictEqual(picks[0], { provider: 0, index: 0 });
});

test("only the name is exact, not a keyword or an id the Entry also carries", () => {
    // A menu entry found by a keyword, against one whose name is the Query. The
    // keyword is a way *in*, not what the Entry is called, so it does not carry
    // the bonus -- otherwise every alias in the corpus would rank as though it
    // were a name.
    const menu = M.prepare(["Lock", "screensaver", "Suspend"], null, [0, 0, 1]);
    const result = M.collapse(menu, M.rank(menu, "screensaver"));

    const named = M.prepare(["screensaver"]);
    const picks = M.merge([result, M.rank(named, "screensaver")]);

    assert.deepStrictEqual(picks[0], { provider: 1, index: 0 },
        "the Entry actually called that, ahead of the one carrying it as a keyword");
});

// The exact bonus against Frecency. Three tests rather than one, because
// "EXACT_WEIGHT is 12 and FRECENCY_WEIGHT is 24" does not on its own mean a
// habit always wins: what rank() adds is round(usage * 24), and usage is a
// normalised [0, 1] rather than a count.
const exactZed = () => M.rank(M.prepare(["zed"], ["zed.desktop"]), "zed");
const usedZedPreview = used => M.rank(M.prepare(["zed preview"], ["zed-preview.desktop"]), "zed", {
    usage: { "zed-preview.desktop": used }
});

test("a heavily used Entry still outranks an exact match on another", () => {
    // Ticket 07's promise -- the things picked most often rise to the top -- is
    // not reversed by a rule added after it. At the ceiling this is the whole
    // 24 points against 12.
    assert.deepStrictEqual(M.merge([exactZed(), usedZedPreview(1)])[0], { provider: 1, index: 0 });
});

test("Frecency takes the tie from an exact match only above EXACT_WEIGHT/FRECENCY_WEIGHT", () => {
    // The boundary itself, which the two constants imply but nothing asserted:
    // below half the ceiling, an exact name outranks a *used* Entry. That is
    // the honest shape of "12 is smaller than 24" -- it buys the ceiling case
    // above, not every case.
    const boundary = M.EXACT_WEIGHT / M.FRECENCY_WEIGHT;

    assert.deepStrictEqual(M.merge([exactZed(), usedZedPreview(boundary + 0.05)])[0],
        { provider: 1, index: 0 }, "above the boundary, the habit");
    assert.deepStrictEqual(M.merge([exactZed(), usedZedPreview(boundary - 0.05)])[0],
        { provider: 0, index: 0 }, "below it, the exact name");
});

test("a store's most-used Entry clears EXACT_WEIGHT on its second choice, not its first", () => {
    // Where that boundary lands in real usage, through frecency.js rather than
    // a hand-picked number -- usageOf normalises against a CEILING_AT of six
    // choices, so being the most-used Entry in a fresh store is worth about
    // 0.36, or 9 quality points, which EXACT_WEIGHT beats.
    //
    // Deliberate, not a leak: CEILING_AT exists precisely to distrust a single
    // launch, and its own note names "one launch would put an application above
    // the running window of itself" as what it is there to prevent.
    const now = 1700000000;
    const usageAfter = choices => {
        let store = F.emptyStore();
        for (let i = 0; i < choices; i++)
            store = F.bump(store, "zed-preview.desktop", now);
        return F.usageOf(store, now)["zed-preview.desktop"];
    };

    assert.deepStrictEqual(M.merge([exactZed(), usedZedPreview(usageAfter(1))])[0],
        { provider: 0, index: 0 }, "chosen once, the exact name still wins");
    assert.deepStrictEqual(M.merge([exactZed(), usedZedPreview(usageAfter(2))])[0],
        { provider: 1, index: 0 }, "chosen twice, the habit takes over");
});

test("an empty query leaves the pool in Provider order, then encounter order", () => {
    // Everything scores 0, so with nothing in the Frecency store this is
    // entirely the pool's own ordering -- which is why it is a decision rather
    // than an accident. Usage is what reorders it, in the test below.
    assert.deepStrictEqual(
        pooled([["w1", "w2"], ["a1", "a2"]], ""),
        ["w1", "w2", "a1", "a2"]);
});

test("an empty query is ordered by usage first, and by the pool where usage ties", () => {
    // The empty-Query promise: most-used first, without typing anything. Every
    // quality score is 0 here, so this is usage on its own.
    const windows = M.rank(M.prepare(["w1", "w2"]), "");
    const apps = M.rank(M.prepare(["a1", "a2", "a3"], ["a1", "a2", "a3"]), "", {
        usage: { a2: 1, a3: 0.5 }
    });

    assert.deepStrictEqual(
        M.merge([windows, apps]).map(pick => [pick.provider, pick.index]),
        [[1, 1], [1, 2], [0, 0], [0, 1], [1, 0]],
        "the two used applications, then the keyless windows, then the unused application");
});

test("usage outranks the pool order that keeps a running window above its application", () => {
    // **A consequence worth naming rather than discovering.** The pool is
    // [windows, apps] precisely because a running window and the application
    // that would launch a second copy score identically, and merge() gives the
    // tie to the earlier Provider -- which is how a partial Query like "firef"
    // still offers the window you already have. Ticket 20's exact-name bonus
    // does not disturb this corpus: both texts are the bare name, so both hold
    // it and the tie stands.
    //
    // Frecency breaks that tie the other way, because it is a real score
    // difference rather than a tie: windows supply no Entry Key, so a
    // frequently-launched application is +24 quality points over the window of
    // itself. The spec's escape hatch if this bites in use is per-Provider score
    // weighting, which it lists as out of scope for now.
    const picks = M.merge([
        M.rank(M.prepare(["firefox"]), "firefox"),
        M.rank(M.prepare(["Firefox"], ["firefox.desktop"]), "firefox", {
            usage: { "firefox.desktop": 1 }
        })
    ]);

    assert.deepStrictEqual(picks, [{ provider: 1, index: 0 }, { provider: 0, index: 0 }],
        "the used application comes first once it has usage behind it");
});

test("merging agrees with ranking the same Entries as one corpus", () => {
    const left = ["src", "/s/r/c", "sources", "scratch"];
    const right = ["srcs", "s-r-c", "src/lib"];

    for (const query of ["s", "sr", "src", "srcl", ""]) {
        const together = M.rank(M.prepare(left.concat(right)), query);
        assert.deepStrictEqual(
            pooled([left, right], query),
            together.indices.map(i => left.concat(right)[i]),
            `pooling should agree with one corpus for ${JSON.stringify(query)}`);
    }
});

test("merge respects its limit and survives empty Providers", () => {
    assert.deepStrictEqual(pooled([["za", "zb"], ["zc"]], "z", { limit: 2 }), ["za", "zb"]);
    assert.deepStrictEqual(pooled([[], ["zc", "zd"]], "z"), ["zc", "zd"]);
    assert.deepStrictEqual(pooled([["za"], []], "z"), ["za"]);
    assert.deepStrictEqual(pooled([[], []], "z"), []);
    assert.deepStrictEqual(M.merge([]), []);
});

test("merging one Provider is the ranking itself", () => {
    const texts = ["gitk", "git", "digit"];
    assert.deepStrictEqual(pooled([texts], "git"), ranked(texts, "git"));
});
