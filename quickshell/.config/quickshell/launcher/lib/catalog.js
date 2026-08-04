// The catalog shape shared by the Providers whose Entries are keyed and
// findable by exactly one text: dev servers and zellij sessions, both of them
// a static list where the Entry's own name is the only thing anyone would type
// and the name is a stable identity Frecency can accumulate against.
//
// Extracted in ticket 16's review round, where devservers.js and zellij.js
// held the same thirteen lines differing only in a variable name.
//
// **The Provider passes its own entryFor in**, rather than this module
// knowing about either of them or either of them wrapping this one. A wrapper
// would be a function whose whole body forwards -- a name to follow through
// to learn nothing -- and this module importing theirs is not available
// anyway: every lib module here is a leaf that QML composes, none imports
// another. So the QML reads `Catalog.keyedCatalog(root.urls, Dev.entryFor,
// root)`, and each Provider's tests still call this with their own real
// entryFor, which is what keeps "what this Provider's Entries look like" pinned
// in that Provider's own test file.
//
// Three shapes live here, and none grew a flag to become another:
// keyedCatalog for an Entry findable by exactly one text, ownedCatalog for an
// Entry findable by several with a stable Key, and keylessCatalog for an
// Entry findable by several with no identity worth keying -- since a pid, a
// workspace id and a window are all gone by the next launcher open. Processes,
// systemd, workspaces and windows compose that third shape here the way the
// other two are composed; before ticket 23 they hand-rolled the same loop in
// their own modules, which is how order stopped being something an author had
// to remember.
//
// **The one rule of every multi-text catalog here, stated once: an Entry's
// first text is its name.** prepare() in lib/matching.js marks the first text
// of each owner's run as the Entry's name, and only that text earns
// EXACT_WEIGHT -- so position 0 within an owner's run means "this is what the
// Entry is called" and every later position means "this is an alias people
// might type". A Provider whose textsFor lists an alias first quietly forfeits
// the bonus for the name the row displays, which is a wrong ranking that looks
// like a preference (ticket 23). The builders cannot check the order
// themselves -- directories, the one deliberate exception, names its Entries
// by their leaf rather than their display name, argued in its own header -- so
// tests/launcher/catalog-check.js asserts it per Provider, from each
// Provider's own test file over its real catalog.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/catalog.test.js) -- the same arrangement as matching.js.

// items + how to make an Entry out of one -> { entries, texts, keys }, the
// three parallel arrays prepare() wants. One text per Entry, so no `owners`:
// index i of `texts` is index i of `entries`, which is what lets the caller
// skip the collapse step entirely.
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

// items + how to make an Entry + how to name one -> { entries, texts, keys,
// owners }, the four parallel arrays prepare() and collapse() want when one
// Entry answers to more than one text. `owners` is what carries index i of
// `texts` back to the Entry it belongs to.
//
// `textsFor` receives the built Entry as well as the item, because a caller
// may name an Entry off either -- directories go by the Entry's display name,
// themes and Providers by the item itself.
//
// Held here rather than in each Provider's own module for the reason
// keyedCatalog is: themes, backgrounds, directories and the provider list all
// held this identical loop, and a lib module cannot import another (see
// above), so the shared shape has to be reached from the QML.
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

// items + how to make an Entry + how to name one -> { entries, texts, owners },
// the three parallel arrays prepare() wants when one Entry answers to more
// than one text and none of them is a Key -- the shape processes, systemd,
// workspaces and windows used to hand-roll in their own modules.
//
// This is ownedCatalog without the keys, and the header above says why the
// third shape exists: a pid, a workspace id and a window address are all gone
// by the next launcher open, so there is nothing for Frecency to accumulate
// against. The absence of `keys` is the whole opt-out -- the same absence the
// providers used to express by building this loop themselves.
//
// `textsFor` receives the built Entry as well as the item, the same contract
// ownedCatalog's has, and its first text must be the Entry's name -- the rule
// stated once in the header above.
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
