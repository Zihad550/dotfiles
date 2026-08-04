import QtQuick
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching
import "../lib/providerlist.js" as ProvList

// The provider list: every Provider the Launcher has, behind "?". Not a way to
// reach anything that was otherwise unreachable (nothing here is), but a way
// to remember what the Launcher can do.
//
// The Provider interface it fills -- label, ready, catalog, actions, prefix --
// is documented at the top of Applications.qml. "?" is walker's own character
// for this (walker/.config/walker/config.toml:51-53 -- deleted with ticket
// 19), kept rather than chosen,
// which is spec story 44.
//
// **The pool comes in from outside, and is not a second registry.** `providers`
// is bound to Launcher.qml's `routable` -- the list it already keeps in order
// to route prefixes -- so adding a Provider there lists it here with nothing
// else to remember.
//
// **Unranked against anything else, on purpose.** This Provider has a prefix
// and stays out of `pool`, so "?" is the only way in. A provider list mixed
// into ordinary results would put an Entry *about* screenshots next to actual
// screenshots, which is a different kind of answer to the same Query.
QtObject {
    id: root

    readonly property string label: "providers"
    readonly property string prefix: "?"

    // The opt-out, used on itself: an Entry that only ever leads back to the
    // list you are already reading is noise, and "?" still reaches this.
    readonly property bool listable: false

    readonly property string description: "Everything the Launcher can do"

    // The Providers to list. Required rather than defaulted: a provider list
    // silently bound to nothing would render as an empty Launcher with no
    // indication that the binding, rather than the pool, was the problem --
    // and `ready: true` below means it would never say "waiting" either.
    required property var providers

    // Never "not ready" -- its Entries are the other Providers, which exist as
    // soon as the Launcher does.
    readonly property bool ready: true

    // Asked of the Launcher rather than done here: switching the Query is the
    // Launcher's own state (see `setQuery` there), and a Provider reaching
    // into it directly is exactly the coupling `routable` avoids by being
    // passed in.
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

    // "stay", not the slot's own default of "close": selecting a Provider is
    // not selecting anything *from* it yet, so the Launcher has to still be
    // open for the list it is about to show.
    readonly property var actions: ({
        primary: {
            label: "open",
            invoke: entry => root.reach(entry),
            after: "stay"
        }
    })

    // The enter() branch covers the default-pool Providers too: selecting
    // "applications" from this list enters it, so the pool narrows to its
    // Entries alone rather than showing the whole default pool the Entry was
    // supposed to be about. `back` leaves it and returns to "?" -- the Query
    // is saved and restored across the nested edge by Launcher.qml's
    // `onNestedProviderChanged`. See lib/providerlist.js's reachOf for why a
    // prefix beats an enter() when a Provider has both.
    function reach(entry): void {
        const target = entry.target.provider;
        const reached = ProvList.reachOf(target);

        if (reached.how === "prefix")
            root.queryRequested(reached.prefix);
        else
            target.enter();
    }
}
