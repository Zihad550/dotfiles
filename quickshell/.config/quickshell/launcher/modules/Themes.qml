import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/catalog.js" as Catalog
import "../lib/matching.js" as Matching
import "../lib/themes.js" as Thm

// The themes Provider: every theme under ~/.config/themes, the active one
// marked, reachable from the default pool -- ticket 15's "apply a theme from
// the Launcher" (spec story 38).
//
// The Provider interface it fills -- label, ready, catalog, actions, refresh
// -- is documented at the top of Applications.qml. Structurally this is
// Clipboard.qml with a scan in place of `cliphist list`: a Process feeding a
// listing string, a pure module turning that into Entries, one Action.
//
// **Out of `pool`, and out of prefix routing too -- reached only by being
// entered from the provider list behind "?".** Ticket 15 first put this in
// `pool`, on the reasoning that a handful of theme names cost nothing to rank
// and the four static menus were the closest precedent. Ticket 18 replaced
// that with something better, and the deciding fact is the one that reasoning
// had to argue around: walker commented `menus:dotfilesThemes` and
// `menus:dotfilesBackgrounds` out of `providers.default` entirely
// (walker/.config/walker/config.toml:19-22 -- deleted with ticket 19),
// reaching them only through
// `df-theme-picker` (also deleted with ticket 19). That was never a judgement
// that theme names should be
// unfindable -- it was that walker had nowhere to put a Provider you browse
// rather than search. The "?" list is that missing place, so this Provider
// can match walker's default-pool exclusion without the capability becoming
// hard to find, which is what `pool` membership was compensating for.
//
// The concrete gain is the preview: `previewMode` needs `activePool` to hold
// exactly one Provider (Launcher.qml:177), so previewing and sitting in
// `pool` were never both available. The cost is that typing a theme name into
// the unrouted Launcher no longer finds it -- deliberate, and the same thing
// walker did.
//
// **Applying a theme restyles the Launcher live already, with no code added
// here.** df-theme-set retargets the theme symlink and then calls
// `qs -c launcher ipc call theme reload` (df-theme-set's own switch_theme),
// which shell.qml's `IpcHandler { target: "theme" }` answers by calling
// Theme.reload() -- wired since ticket 2, well before this Provider existed.
// This file only has to run df-theme-set; the restyle is a side effect of
// infrastructure that already works.
NestableProvider {
    id: root

    readonly property string label: "themes"

    // Shown by the provider list behind "?". Declared here because the
    // Provider itself is the only place that knows one without a second
    // registry to keep in sync.
    readonly property string description: "Switch the colour theme"

    // The list-plus-preview split, not the default single-column list. The
    // walker menu this replaces already previewed
    // (dotfiles_themes.lua's FindPreview -- deleted with ticket 19), so a flat
    // list here would have been
    // a regression against the tool being retired, not a simplification.
    readonly property string layout: "preview"

    // Never "not ready" -- an empty ~/.config/themes before the first stow
    // is legitimate, not a fault to report. Same reasoning as the windows and
    // clipboard Providers' own `ready`.
    readonly property bool ready: true

    readonly property string home: Quickshell.env("HOME")

    // Fed by the Process below. A plain string rather than the parsed shape,
    // so re-parsing only happens in the one binding that needs it -- the same
    // shape Clipboard.qml's own `listingText` is.
    property string listingText: ""
    readonly property var listing: Thm.parseListing(root.listingText)

    // Same trap Clipboard.qml's own note on `onItemsChanged` names: an empty
    // result and a wrong property name look identical from inside the
    // Launcher, and `ready: true` above means this Provider never says
    // "waiting" to give the difference away on its own.
    property string loggedState: ""
    onListingChanged: {
        const state = root.listing.names.length + ":" + root.listing.current;
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: themes Provider sees", root.listing.names.length,
            "theme(s), active:", root.listing.current || "(none)");
    }

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from -- the same reasoning as every other catalog here.
    // `owners`, because textsFor gives a theme two corpus texts (its raw
    // slug and its formatted display name) -- see the note on
    // lib/themes.js's own textsFor.
    readonly property var catalog: {
        const built = Catalog.ownedCatalog(root.listing.names,
            name => Thm.entryFor(name, root.listing.current, root.listing.previews[name], root),
            name => Thm.textsFor(name));
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, built.keys, built.owners)
        };
    }

    // Applying a theme is the primary; `back` is what leaves the sub-view
    // this Provider is only ever seen from. Nothing here asks for a secondary
    // or a mark.
    //
    // `back` is declared unconditionally rather than only while `entered`,
    // unlike Directories.qml's chooser-only slots: these Entries are
    // *unreachable* unless entered -- no prefix, and out of `pool` -- so there
    // is no state in which the slot could fire without a sub-view to leave.
    // A conditional here would be guarding against a case that cannot arise.
    readonly property var actions: ({
        primary: {
            label: "apply",
            invoke: entry => root.apply(entry)
        },

        // The slot's own default is already "stay" (lib/actions.js:68), so
        // nothing here has to override `after`.
        back: {
            label: "back",
            invoke: () => root.leave()
        }
    })

    function apply(entry): void {
        Quickshell.execDetached(Thm.applyArgv(root.home, entry.target.name));
    }

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Called at startup and again on every open, the same as the
    // clipboard Provider's own refresh -- a theme applied by running
    // `df-theme-set` from a terminal, or the active marker moving, should
    // show correctly the next time the Launcher opens.
    property bool refreshPending: false

    function refresh(): void {
        if (finder.running) {
            root.refreshPending = true;
            return;
        }
        finder.command = Thm.listCommand(root.home);
        finder.running = true;
    }

    Component.onCompleted: root.refresh()

    // Assigned to a property rather than nested bare, the same reason
    // Calculator.qml's own Process is: QtObject has no default property to
    // nest a child into.
    readonly property Process finder: Process {
        id: finder

        stdout: StdioCollector {
            id: output
            onStreamFinished: root.listingText = output.text
        }

        // Collected and dropped, the same as Clipboard.qml's own `finder`:
        // an empty list already says plainly that nothing was found.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and not a duplicate of the
        // collector's own handler -- the same reasoning as Screenshots.qml's
        // own `onExited`. Drains `refreshPending`: a refresh() that arrived
        // while this run was already in flight gets the fresh run it asked
        // for, once this one is out of the way.
        onExited: {
            root.listingText = output.text;
            if (root.refreshPending) {
                root.refreshPending = false;
                root.refresh();
            }
        }
    }
}
