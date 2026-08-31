// Catalog shapes shared across Providers, so each doesn't hand-roll the same
// loop. A Provider passes its own entryFor in rather than this module
// knowing about any Provider (lib modules here are leaves QML composes; none
// imports another).
//
// Three shapes, none a flag on another: keyedCatalog for an Entry findable by
// exactly one text (dev servers); ownedCatalog for an Entry
// findable by several texts with a stable Key (themes, backgrounds,
// directories, provider list); keylessCatalog for an Entry findable by
// several texts with no identity worth keying (processes, systemd,
// workspaces, windows -- a pid or window address is gone by the next open,
// so there's nothing for Frecency to accumulate against).
//
// One rule for every multi-text catalog here: an Entry's first text is its
// name. prepare() in lib/matching.js only gives EXACT_WEIGHT to the first
// text of each owner's run, so listing an alias first silently forfeits the
// bonus for the Entry's own display name -- a wrong ranking that reads as a
// preference. Builders can't check this themselves (directories names
// Entries by their leaf, not display name, argued in its own header), so
// tests/launcher/catalog-check.js asserts it per Provider.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/catalog.test.js).

// One text per Entry, so no `owners`: index i of `texts` is index i of
// `entries`, letting the caller skip collapse() entirely.
function keyedCatalog(items, entryFor, provider) {
    var entries = [];
    var texts = [];
    var keys = [];

    for (var i = 0; i < items.length; i++) {
        var entry = entryFor(items[i], provider);
        entries.push(entry);
        texts.push(entry.name);
        keys.push(entry.key);
    }

    return { entries: entries, texts: texts, keys: keys };
}

// For an Entry answering to more than one text, with a stable Key. `owners`
// carries index i of `texts` back to the Entry it belongs to. `textsFor`
// receives the built Entry as well as the item, since a caller may name an
// Entry off either (directories go by display name, themes/backgrounds by the item).
function ownedCatalog(items, entryFor, textsFor) {
    var entries = [];
    var texts = [];
    var keys = [];
    var owners = [];

    for (var i = 0; i < items.length; i++) {
        var entry = entryFor(items[i]);
        var index = entries.length;
        entries.push(entry);

        var found = textsFor(items[i], entry);
        for (var t = 0; t < found.length; t++) {
            texts.push(found[t]);
            keys.push(entry.key);
            owners.push(index);
        }
    }

    return { entries: entries, texts: texts, keys: keys, owners: owners };
}

// ownedCatalog without keys -- see the header's third shape.
function keylessCatalog(items, entryFor, textsFor) {
    var entries = [];
    var texts = [];
    var owners = [];

    for (var i = 0; i < items.length; i++) {
        var entry = entryFor(items[i]);
        var index = entries.length;
        entries.push(entry);

        var found = textsFor(items[i], entry);
        for (var t = 0; t < found.length; t++) {
            texts.push(found[t]);
            owners.push(index);
        }
    }

    return { entries: entries, texts: texts, owners: owners };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        keyedCatalog: keyedCatalog,
        ownedCatalog: ownedCatalog,
        keylessCatalog: keylessCatalog
    };
}
