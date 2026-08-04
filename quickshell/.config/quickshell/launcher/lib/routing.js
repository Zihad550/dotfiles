// Prefix routing -- a leading character on the Query narrows the Launcher to
// exactly one Provider. Ported from walker's own rule, `query()` in the
// vendored checkout (resources/walker/src/data.rs:519-533 -- deleted with
// ticket 19):
// the first configured prefix the text starts with wins, that Provider takes
// over, and the prefix itself is stripped before the rest of the Launcher
// ever sees the Query -- CONTEXT.md's own definition, "the text typed into
// the launcher, after any prefix is stripped".
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/routing.test.js) -- the same arrangement as matching.js, and
// for the same reason.
//
// **Providers declare their own prefix; nothing here registers one.** A
// Provider that wants one sets `prefix` on itself -- "=" on Calculator.qml,
// "@" on WebSearch.qml -- and route() and problems() only ever read that
// property back off whatever list Launcher.qml hands them. Nothing here names
// a Provider, so nothing here changes when one is added, and a Provider that
// declares no `prefix` (applications, windows, the four menus) is simply never
// matched.
//
// **No state survives between calls.** Both functions are asked fresh --
// route() on every keystroke, problems() once when the pool is built -- and
// that is what makes "deleting back past the prefix returns to the default
// pool" true for free: once the Query no longer starts with a claimed prefix,
// route() stops matching it. There is no flag left over from the keystroke
// before to clear.

// A Provider's own prefix, or "" for one that has none -- unset, or set to
// something that is not a non-empty string. Shared by route() and problems()
// so "what counts as declaring a prefix" is answered in one place.
function prefixOf(provider) {
    var prefix = provider && provider.prefix;
    return typeof prefix === "string" ? prefix : "";
}

// Which Provider a Query names, and what is left of it once that prefix is
// removed.
//
// `providers` is walked in the caller's own pool order, and the first
// Provider whose `prefix` the Query starts with wins -- so two Providers
// racing for the same character is a question of list order, the same lever
// merge() already uses for a tied score. problems() below is what turns that
// silent precedence into a load-time fact instead, but route() still has to
// resolve to *something* rather than throw when it happens.
//
// Returns `{ provider: null, query: queryText }` for a Query with no prefix, a
// leading character no Provider claims, or a Provider that declares an empty
// `prefix` (skipped outright -- an empty prefix would match every Query,
// which is not what leaving the field unset is asking for). That is checkbox
// 5's whole rule: an unclaimed prefix is ordinary Query text, not something
// swallowed and turned into nothing.
function route(providers, queryText) {
    if (typeof queryText !== "string")
        return { provider: null, query: queryText };

    for (var i = 0; i < providers.length; i++) {
        var provider = providers[i];
        var prefix = prefixOf(provider);
        if (prefix === "")
            continue;

        if (queryText.indexOf(prefix) === 0)
            return { provider: provider, query: queryText.slice(prefix.length) };
    }

    return { provider: null, query: queryText };
}

// Every prefix claimed by more than one Provider, one message per collision.
//
// Checkbox 6: caught at load, not resolved silently by whichever Provider
// route() happens to reach first. Collected rather than thrown -- the same
// decision catalogOf makes in lib/menus.js -- because a throw here would take
// the caller's whole load down, and losing every Provider over one duplicated
// character is a worse failure than the duplicate itself. The caller logs
// each message the way Menu.qml already logs catalogOf's.
function problems(providers) {
    var claimedBy = {};
    var found = [];

    for (var i = 0; i < providers.length; i++) {
        var provider = providers[i];
        var prefix = prefixOf(provider);
        if (prefix === "")
            continue;

        var label = (provider && provider.label) || "provider #" + i;

        if (claimedBy[prefix] !== undefined)
            found.push("prefix routing: \"" + prefix + "\" is claimed by both " + claimedBy[prefix] + " and " + label);
        else
            claimedBy[prefix] = label;
    }

    return found;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        route: route,
        problems: problems
    };
}
