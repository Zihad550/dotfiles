// The provider-list Provider's pure half: which Providers are worth listing,
// how each one renders, and which of the two ways of reaching one it wants.
//
// Nothing is registered here: every Entry derives from what a Provider says
// about itself (`label`, `prefix`, `description`), so adding a Provider to
// the Launcher lists it here automatically.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/providerlist.test.js).

// Opting out has to be explicit: an absent `listable` means "never thought
// about this", and silently hiding those would make the list wrong by
// default rather than complete by default.
function isListable(provider) {
    return !(provider && provider.listable === false);
}

// "Web Search" from "web search".
function formatName(label) {
    return String(label).replace(/\S+/g, function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

// Prefix first: shorter and more useful to a reader who already knows what
// the Provider does. Either half missing just drops out.
function subtextOf(provider) {
    var prefix = provider && typeof provider.prefix === "string" ? provider.prefix : "";
    var description = provider && typeof provider.description === "string" ? provider.description : "";

    if (prefix !== "" && description !== "")
        return prefix + "  " + description;
    return prefix !== "" ? prefix : description;
}

// A prefix wins over enter() when a Provider has both: switching the Query
// leaves a state the user can type their way out of (delete the prefix),
// while entering only a `back` can undo -- the recoverable move is the
// better default. No third shape, so a listable Provider with neither is a
// programming error -- see problems() below.
function reachOf(provider) {
    if (provider && typeof provider.prefix === "string" && provider.prefix !== "")
        return { how: "prefix", prefix: provider.prefix };
    return { how: "enter" };
}

// `self` is the *list*, not the Provider being named: Launcher.qml resolves
// an Entry's Actions through `entry.provider`, so an Entry claiming to
// belong to the named Provider would run that Provider's own Actions
// instead of reaching it. What the Entry names lives on `target.provider`.
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

// Display name and raw label, deduplicated -- "web search" is what the
// Provider calls itself, "Web Search" is what the Entry shows, both are
// things a person might type. Display name first, since it's the text
// EXACT_WEIGHT is measured against.
function textsFor(provider) {
    var label = String(provider ? provider.label : "");
    var name = formatName(label);
    return name.toLowerCase() !== label.toLowerCase() ? [name, label] : [label];
}

// Listable Providers reachOf can't actually reach (neither a prefix nor an
// enter()). Caught at load, next to Routing.problems: otherwise reach()
// throws only once somebody chooses that Entry, surfacing as a row that
// silently does nothing.
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
