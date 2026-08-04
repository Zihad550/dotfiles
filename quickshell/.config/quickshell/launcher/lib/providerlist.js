// The provider-list Provider's pure half: which Providers are worth listing,
// how each one renders, and which of the two ways of reaching one it wants.
//
// **Nothing is registered here.** This module is handed the Providers the
// Launcher already has (`root.routable`), and derives every Entry from what a
// Provider says about itself -- its `label`, its own `prefix`, its
// `description`. Adding a Provider to the Launcher lists it here, with no
// second place to remember. The cost is that `description` becomes part of
// the Provider interface, which is why it degrades to "" rather than being
// required.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/providerlist.test.js) -- the same arrangement as matching.js.

// Opting out has to be explicit -- an absent `listable` is every Provider
// that has never thought about this question, and silently hiding those would
// make the list wrong by default rather than complete by default.
function isListable(provider) {
    return !(provider && provider.listable === false);
}

// "Web Search" from "web search" -- the same title-casing lib/themes.js uses,
// so a label already reads as a name without every Provider having to spell
// one out.
function formatName(label) {
    return String(label).replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// The prefix and the description share the sub-line, prefix first -- it is
// the shorter and the more useful of the two to a reader who already knows
// what the Provider does. Either half missing just drops out; a Provider that
// supplies neither still renders an Entry rather than breaking the list.
function subtextOf(provider) {
    var prefix = provider && typeof provider.prefix === "string" ? provider.prefix : "";
    var description = provider && typeof provider.description === "string" ? provider.description : "";

    if (prefix !== "" && description !== "")
        return prefix + "  " + description;
    return prefix !== "" ? prefix : description;
}

// How selecting an Entry reaches the Provider it names. Two shapes, because
// not every Provider has a prefix to switch the Query to.
//
// A prefix wins over an enter() when a Provider has both: switching the Query
// leaves the Launcher in a state the user can type their way out of (delete
// the prefix, the default pool returns), whereas entering is Launcher state
// that only a `back` can undo. The recoverable move is the better default.
//
// There is no third shape, so a listable Provider with neither is a
// programming error -- see problems() below, which names it at load rather
// than letting reach() throw once somebody chooses that Entry.
function reachOf(provider) {
    if (provider && typeof provider.prefix === "string" && provider.prefix !== "")
        return { how: "prefix", prefix: provider.prefix };
    return { how: "enter" };
}

// `self` is the *list*, not the Provider being named -- Launcher.qml resolves
// an Entry's Actions through `entry.provider`, so an Entry that claimed to
// belong to the Provider it names would run that Provider's own Actions
// (apply a theme, open a directory) instead of reaching it. What the Entry
// names lives on `target.provider` instead.
function entryFor(provider, self) {
    return {
        name: formatName(provider ? provider.label : ""),
        subtext: subtextOf(provider),
        icon: "view-list-symbolic",
        key: "provider:" + (provider ? provider.label : ""),
        provider: self,
        target: { provider: provider }
    };
}

// The display name and the raw label, deduplicated -- the same two-text shape
// lib/themes.js's textsFor uses, and for the same reason: "web search" is
// what the Provider calls itself and "Web Search" is what the Entry shows,
// and both are things a person might type. Display name first, so it is the
// text EXACT_WEIGHT is measured against -- see the note on lib/themes.js's
// own textsFor.
function textsFor(provider) {
    var label = String(provider ? provider.label : "");
    var name = formatName(label);
    // Case-insensitive, because matching.js lowercases every corpus text --
    // see the identical note on lib/themes.js's own textsFor.
    return name.toLowerCase() !== label.toLowerCase() ? [name, label] : [label];
}

// Listable Providers that reachOf cannot actually reach -- neither a prefix
// to switch the Query to nor an enter() to hand the pool to.
//
// Caught at load, next to Routing.problems, because the alternative is
// invisible: reach() would throw a TypeError only once somebody chooses that
// Entry, and with `after: "stay"` and no try around the Launcher's
// `action.invoke` that surfaces as an Entry which silently does nothing and
// skips its own Frecency.record, so it never learns to rank better either.
function problems(providers) {
    var found = [];

    for (var i = 0; i < providers.length; i++) {
        var provider = providers[i];
        if (!isListable(provider))
            continue;

        var reach = reachOf(provider);
        if (reach.how === "enter" && typeof (provider && provider.enter) !== "function")
            found.push("provider list: " + ((provider && provider.label) || "provider #" + i)
                + " is listable but has neither a prefix nor an enter()");
    }

    return found;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        isListable: isListable,
        problems: problems,
        formatName: formatName,
        subtextOf: subtextOf,
        reachOf: reachOf,
        entryFor: entryFor,
        textsFor: textsFor
    };
}
