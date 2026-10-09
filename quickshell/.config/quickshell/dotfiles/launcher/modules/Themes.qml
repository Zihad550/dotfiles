import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching
import "../lib/themes.js" as Thm

// The themes Provider: every theme under ~/.config/themes, the active one
// marked. Structurally this is Clipboard.qml with a scan in place of
// `cliphist list`: a Process feeding a listing string, a pure module turning
// that into Entries, one Action. Provider interface: see docs/launcher-spec.md.
//
// Out of `pool` and out of prefix routing -- reached only by being entered
// from the "?" provider list. This is a Provider you browse rather than
// search, and the "?" list is where that belongs; keeping it out of `pool`
// is also what makes the preview split possible (`previewMode` needs
// `activePool` to hold exactly one Provider). The tradeoff: typing a theme
// name into the unrouted Launcher no longer finds it, which is deliberate.
//
// df-theme-set refreshes every desktop theme module through shared IPC.
NestableProvider {
    id: root

    required property bool catalogSelected
    readonly property ProviderRetention retention: ProviderRetention {
        selected: root.catalogSelected
        onRefreshRequested: root.refresh()
    }

    readonly property string label: "themes"
    readonly property string description: "Switch the colour theme"

    // List-plus-preview split, not the default single-column list.
    readonly property string layout: "preview"

    // Never "not ready": an empty ~/.config/themes before the first stow is
    // legitimate, not a fault.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // A plain string, not the parsed shape, so re-parsing happens only where needed.
    property string listingText: ""
    readonly property var listing: Thm.parseListing(root.listingText)

    property string loggedState: ""
    onListingChanged: {
        const state = root.listing.names.length + ":" + root.listing.current;
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: themes Provider sees", root.listing.names.length,
            "theme(s), active:", root.listing.current || "(none)");
    }

    // `owners`: textsFor gives a theme two corpus texts (its raw slug and
    // formatted display name) -- see lib/themes.js's own textsFor.
    readonly property var catalog: {
        if (!retention.retained)
            return Matching.emptyCatalog();
        const built = Catalog.ownedCatalog(root.listing.names,
            name => Thm.entryFor(name, root.listing.current, root.listing.previews[name], root),
            name => Thm.textsFor(name));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Applying is primary; `back` leaves the sub-view this Provider is only
    // ever seen from. Declared unconditionally (not gated on `entered` like
    // Directories.qml's chooser-only slots): these Entries are unreachable
    // unless entered, so there's no state where the slot could fire without
    // a sub-view to leave.
    readonly property var actions: ({
        primary: {
            label: "apply",
            invoke: entry => root.apply(entry)
        },

        back: {
            label: "back",
            invoke: () => root.leave()
        }
    })

    function apply(entry): void {
        Quickshell.execDetached(Thm.applyArgv(root.home, entry.target.name));
    }

    // Called on selection and after actions, same as Clipboard.qml's own
    // refresh -- a theme applied from a terminal, or the active marker
    // moving, should show correctly next time the Launcher opens.
    function refresh(): void {
        finder.request();
    }

    // QtObject has no default property to nest a child into.
    readonly property ListingProcess finder: ListingProcess {
        id: finder
        retained: retention.retained
        command: Thm.listCommand(root.home)

        // Collected and dropped: an empty list already says plainly that
        // nothing was found.
        stderr: StdioCollector {}

        onSettled: output => root.listingText = output
    }
}
