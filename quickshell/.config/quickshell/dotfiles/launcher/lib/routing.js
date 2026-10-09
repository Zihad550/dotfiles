// Prefix routing: a leading character on the Query narrows the Launcher to
// exactly one Provider. The first configured prefix the text starts with
// wins, that Provider takes over, and the prefix itself is stripped before
// the rest of the Launcher sees the Query.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/routing.test.js).
//
// Providers declare their own prefix (`prefix` on the Provider itself);
// nothing here registers or names one, so a Provider declaring none is
// simply never matched.
//
// No state survives between calls -- route() runs fresh every keystroke, so
// "deleting back past the prefix returns to the default pool" is true for
// free, with no leftover flag to clear.

// A Provider's own prefix, or "" for one that has none.
function prefixOf(provider) {
    var prefix = provider && provider.prefix;
    return typeof prefix === "string" ? prefix : "";
}

// Which Provider a Query names, and what's left once that prefix is removed.
//
// Walked in the caller's own pool order; the first Provider whose `prefix`
// the Query starts with wins, so two Providers claiming the same character
// is a question of list order (problems() below turns that into a load-time
// warning instead of silent precedence).
//
// Returns `{ provider: null, query: queryText }` for no prefix, an unclaimed
// leading character, or a Provider declaring an empty `prefix` (skipped --
// an empty prefix would match every Query).
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
// Collected rather than thrown, same as catalogOf in lib/menus.js: losing
// every Provider over one duplicated character is worse than the duplicate
// itself. The caller logs each message.
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
