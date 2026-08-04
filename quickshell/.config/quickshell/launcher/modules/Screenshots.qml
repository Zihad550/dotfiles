import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/screenshots.js" as Shots

// The screenshots Provider: pick a screenshot from a list of names and dates
// with a live preview of whichever one is highlighted, mark several, and act
// on all of them at once -- the other half of ticket 12's abstraction
// stress-test, and the capability docs/launcher-spec.md names as the reason a
// custom layout was impossible under walker (entries there render as one
// uniform row).
//
// **Redesigned after the first host round.** The original shape here was a
// grid of thumbnails; a filename and a timestamp under a small thumbnail
// turned out not to be enough to tell two screenshots apart before
// committing to one, so this is a narrow list on the left and a single large
// preview of the highlighted Entry on the right -- see the header on the
// preview split in Launcher.qml for the rest of that reasoning. Nothing
// about the Provider side changed: the catalog, the Actions and the marking
// mechanism below are exactly what a grid layout would need too, because
// none of it assumes a shape for how an Entry is drawn.
//
// The Provider interface it fills is documented at the top of
// Applications.qml, including the two additions this ticket makes to it:
// `layout: "preview"` and filling the `mark` slot.
//
// **Reached only through its own prefix**, the same arrangement as
// Directories.qml and for a related but different reason: that Provider stays
// out of `pool` because scoring ~17,000 paths on every keystroke is too slow
// to pay by default; this one stays out because its two-column layout mixed
// into a one-line-per-Entry ranked list makes neither legible. Launcher.qml's
// `previewMode` only ever renders it when this Provider owns the whole pool,
// which prefix routing (or Directories-style nesting, unused here) is what
// guarantees.
//
// **Marking, owned here rather than by the shell.** lib/actions.js declares
// the `mark` slot and its Tab chord, but has nowhere itself to keep "which
// Entries are marked" that would not leak between Providers -- so the
// selection and its toggle both live on the Provider whose Entries they mark,
// mirroring Directories.qml's own `openFor`. `active`, bound to
// Launcher.qml's `root.visible` the same way, is what makes a mark vanish the
// moment the Launcher closes and never reach a later session -- the exact bug
// docs/launcher-spec.md's problem statement opens with, which existed only
// because df-screenshot-mark (deleted with ticket 19) kept the selection in
// a runtime file nothing owned.
//
// `marked` is reassigned wholesale on every toggle rather than mutated in
// place -- a QML `property var` only notifies on assignment, and the list
// delegate's border would not repaint against a mutated object.
QtObject {
    id: root

    readonly property string label: "screenshots"
    readonly property string description: "Recent screenshots"
    readonly property string prefix: "#"
    readonly property string layout: "preview"

    readonly property string home: Quickshell.env("HOME")
    readonly property string dir: Shots.screenshotsDir(root.home)

    // Whether the Launcher window is open, handed down the same way
    // Directories.qml's own `active` is -- required, so a Provider bound to
    // nothing fails loudly instead of silently carrying marks into every
    // future session.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.marked = ({});
    }

    // The selection: a plain object keyed by absolute path. Empty is "nothing
    // marked", which both the secondary Action and the delegate treat as
    // meaningfully different from "the empty set" -- see copyPaths.
    property var marked: ({})

    function toggleMark(entry) {
        const path = entry.target.path;
        const next = Object.assign({}, root.marked);
        if (next[path])
            delete next[path];
        else
            next[path] = true;
        root.marked = next;
    }

    // Never "not ready" -- an empty ~/Pictures/Screenshots is a legitimate
    // state (nobody has taken one yet), not a fault to report. Same reasoning
    // as the windows and directories Providers' own `ready`.
    readonly property bool ready: true

    // Fed by the Process below. A plain string rather than the parsed list,
    // so re-parsing only happens in the one binding that needs it -- the same
    // shape Directories.qml's `cacheText` is.
    property string listingText: ""
    readonly property var items: Shots.parseListing(root.listingText)

    property string loggedState: ""
    onItemsChanged: {
        const state = String(root.items.length);
        if (state === root.loggedState)
            return;
        root.loggedState = state;
        console.log("launcher: screenshots Provider sees", root.items.length, "screenshot(s) in", root.dir);
    }

    // Read once, so the corpus rank() scores is always the entry list it was
    // prepared from -- the same reasoning as every other catalog here.
    // Depends on `root.marked` as well as `root.items`: toggling a mark has
    // to reach the Entry Launcher.qml's preview list delegate reads
    // `target.marked` off, and a catalog that did not depend on the
    // selection would go on showing the old tick.
    readonly property var catalog: {
        const built = Shots.catalogOf(root.items, root.marked, root);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null)
        };
    }

    // Which slots this Provider fills: copy the image, copy the path(s),
    // toggle the mark. No `back` -- there is no sub-view to leave.
    //
    // `mark`'s own slot default is already "stay" (lib/actions.js) -- this
    // Provider is the reason that default exists alongside `back`'s -- so
    // nothing here has to override `after`.
    readonly property var actions: ({
        primary: {
            label: "copy image",
            invoke: entry => root.copyImage(entry)
        },

        secondary: {
            label: "copy path",
            invoke: entry => root.copyPaths(entry)
        },

        mark: {
            label: "mark",
            invoke: entry => root.toggleMark(entry)
        }
    })

    // The primary Action.
    function copyImage(entry): void {
        Quickshell.execDetached(Shots.copyImageArgv(entry.target.path));

        // Copying ends the selection, the same way df-screenshot-copy (deleted
        // with ticket 19) always did -- otherwise a mark made before a plain
        // Return would still be marked the next time this Provider is reached
        // in the same session.
        root.marked = ({});
    }

    // The secondary Action: every marked path, or just the highlighted one
    // when nothing is marked -- checkbox 4's whole rule, and the reason
    // `marked` is read here rather than threaded through as an argument
    // nothing else in the Core Action vocabulary needs.
    function copyPaths(entry): void {
        const paths = Object.keys(root.marked);
        Quickshell.execDetached(Shots.copyPathsArgv(paths.length > 0 ? paths : [entry.target.path]));
        root.marked = ({});
    }

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Called at startup and again on every open, the same as the
    // windows and directories Providers -- a screenshot taken since the
    // Launcher last opened should be in the list the next time it does.
    function refresh(): void {
        if (finder.running)
            return;
        finder.command = Shots.listCommand(root.home);
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

        // Collected and dropped, the same as Calculator.qml's qalc: `find`
        // writes a diagnostic per unreadable entry, which would otherwise put
        // a line in the log on every refresh rather than only when it matters
        // -- an empty list already says plainly that nothing was found.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and not a duplicate of the
        // collector's own handler -- the same reasoning as Calculator.qml's
        // qalc.onExited. Which of `onStreamFinished` and `onExited` fires
        // first is not something this file gets to assume, so both settle the
        // same text; a process that exits before its stream drains would
        // otherwise leave `listingText` on whatever it was before this
        // refresh, silently, rather than on what `find` actually found.
        onExited: root.listingText = output.text
    }
}
