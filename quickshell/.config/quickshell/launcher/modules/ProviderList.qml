import QtQuick
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching
import "../lib/providerlist.js" as ProvList

// The provider list: every Provider the Launcher has, behind "?". Not a way
// to reach anything that was otherwise unreachable -- a way to remember what
// the Launcher can do. Provider interface: see docs/launcher-spec.md.
//
// The pool comes in from outside, not a second registry: `providers` binds
// to Launcher.qml's `routable`, so adding a Provider there lists it here
// with nothing else to remember.
//
// Unranked against anything else, on purpose: mixed into ordinary results,
// an Entry *about* screenshots would sit next to actual screenshots -- a
// different kind of answer to the same Query.
QtObject {
    id: root

    readonly property string label: "providers"
    readonly property string prefix: "?"

    // The opt-out, used on itself: an Entry that only leads back to the list
    // you're already reading is noise; "?" still reaches this.
    readonly property bool listable: false

    readonly property string description: "Everything the Launcher can do"

    // Required, not defaulted: a provider list silently bound to nothing
    // would render as an empty Launcher with nothing to say why.
    required property var providers

    // Never "not ready": its Entries are the other Providers, which exist as
    // soon as the Launcher does.
    readonly property bool ready: true

    // Asked of the Launcher rather than done here: switching the Query is
    // Launcher.qml's own state.
    signal queryRequested(string text)

    readonly property var catalog: {
        const built = Catalog.ownedCatalog(root.providers.filter(ProvList.isListable),
            provider => ProvList.entryFor(provider, root),
            provider => ProvList.textsFor(provider));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // "stay", not the slot's default "close": selecting a Provider isn't
    // selecting anything *from* it yet.
    readonly property var actions: ({
        primary: {
            label: "open",
            invoke: entry => root.reach(entry),
            after: "stay"
        }
    })

    // Covers the default-pool Providers too: selecting "applications" enters
    // it, narrowing the pool to its Entries alone. `back` leaves it and
    // returns to "?" -- the Query is saved/restored across the nested edge
    // by Launcher.qml's `onNestedProviderChanged`. See lib/providerlist.js's
    // reachOf for why a prefix beats enter() when a Provider has both.
    function reach(entry): void {
        const target = entry.target.provider;
        const reached = ProvList.reachOf(target);

        if (reached.how === "prefix")
            root.queryRequested(reached.prefix);
        else
            target.enter();
    }
}
