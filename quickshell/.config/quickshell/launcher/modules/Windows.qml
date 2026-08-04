import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/sequence.js" as Seq

// Qualified `Win`, not `Windows`: a JavaScript import qualifier and a QML type
// name share one namespace, and this file's own type is already called Windows.
import "../lib/windows.js" as Win

// The windows Provider: what is already running, so typing a name switches to
// it instead of launching a second copy.
//
// The Provider interface it fills -- label, ready, catalog, actions, and the
// shape of an Entry -- is documented at the top of Applications.qml.
//
// Two things about how this reads the compositor, both deliberate:
//
// **Nothing here names a Hyprland or Wayland type.** Every access goes through
// `var` bindings and optional chaining. A type name that does not resolve is a
// compile error for the whole file, which presents as the Launcher silently not
// opening. Written this way, the worst case is a Provider that contributes no
// Entries and says so in the log, rather than a Launcher that does not open at
// all. The host has since confirmed the shape -- `Hyprland.toplevels` is an
// ObjectModel whose `values` is a QML sequence, populated asynchronously -- but
// the style stays, because it costs nothing and ticket 12 adds more Providers
// to this same window.
//
// **Activation goes through the Wayland toplevel, not through a dispatch.**
// `toplevel.wayland.activate()` is the zwlr_foreign_toplevel_handle_v1
// `activate` request, which Hyprland answers with `CWindow::activate(true)`
// (resources/Hyprland/src/protocols/ForeignToplevelWlr.cpp:31). That path ends
// in CFocusState::rawWindowFocus, which explicitly handles a window whose
// workspace is not visible (src/desktop/state/FocusState.cpp:163) -- including
// a special workspace, which it opens on the current monitor (:167). So "focuses it,
// including on another workspace" and the special-workspace case are the
// compositor's own code rather than something built here. This is also the
// protocol elephant's own windows Provider uses.
//
// The alternative -- `hyprctl dispatch focuswindow address:0x…` -- is
// deliberately not the fallback. Ticket 01 found that this machine runs
// Hyprland's Lua config, where hyprctl evaluates its argument as Lua and a bare
// dispatcher string is a syntax error.
QtObject {
    id: root

    // Named for the "waiting for …" message in the window; also what a log line
    // says when this Provider finds nothing.
    readonly property string label: "windows"
    readonly property string description: "Switch to an open window"

    // Unlike applications, an empty windows Provider is a legitimate state --
    // a session with nothing open. So this never reports "not ready": there is
    // no count that means "still loading" as 0 applications does.
    readonly property bool ready: true

    // **Reached from the "?" list by being entered, like the themes and
    // backgrounds** -- the same reasoning and the same shim as Applications.qml
    // (see the note on `nested` there): no prefix, and selecting "windows"
    // from the list must narrow the pool to windows alone. `active` drops the
    // state when the Launcher closes.
    required property bool active
    onActiveChanged: {
        if (!root.active)
            root.entered = false;
    }

    property bool entered: false
    readonly property bool nested: root.entered

    function enter(): void {
        root.entered = true;
    }

    function leave(): void {
        root.entered = false;
    }

    // Every open window, from the model that also knows which workspace each
    // one is on -- which Wayland has no concept of, and which checkbox 4 is
    // about. Activation still goes to the Wayland handle hanging off each of
    // these; see focusWindow().
    //
    // Read through Seq.listOf, which is load-bearing rather than defensive
    // dressing -- see lib/sequence.js, which is where the two host rounds this
    // cost are written down. The optional chaining is what keeps a renamed
    // `toplevels` costing this Provider and nothing else: an exception in a
    // binding leaves `catalog` undefined, and Launcher.qml would then read
    // `.corpus` of undefined and lose the *whole* merged list, applications
    // included.
    readonly property var toplevels: Seq.listOf(Hyprland.toplevels?.values)

    // Read so that the Wayland toplevel model *runs*, which is the only reason
    // this property exists -- nothing below uses the count.
    //
    // Quickshell links each HyprlandToplevel to its Wayland counterpart, and a
    // singleton only starts when something reads it. Nothing else in this
    // config reads this one, and the host showed exactly what that costs: 8
    // windows, every one of them with a null `wayland`, so every activation
    // would have taken the unverified fallback and warned about it. Deleting
    // this line silently gives that back.
    readonly property int waylandCount: Seq.listOf(ToplevelManager.toplevels?.values).length

    // Same shape and the same reasoning as Applications.catalog: one property,
    // read once, so the indices rank() returns cannot be paired with a
    // different entry list than the corpus was prepared from.
    //
    // A binding over live compositor state, so it re-evaluates when a window
    // opens or closes *and* when one retitles -- reading each toplevel's title
    // here is what makes the title a dependency of this binding.
    //
    // A window can be found by more than one text (see textsFor in
    // lib/windows.js), so this corpus carries an `owners` array and its
    // consumer collapses those back to Entries.
    readonly property var catalog: {
        const built = Catalog.keylessCatalog(root.toplevels.map(root.describe),
            item => Win.entryFor(item, root), Win.textsFor);

        // No Entry Key -- prepare() is given a null `keys`. A window's identity
        // does not survive a relaunch, so there is nothing for Frecency to
        // accumulate against, and rank() already handles a Provider that
        // supplies none.
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null, built.owners)
        };
    }

    // What was last logged, as the three numbers that matter together. An empty
    // list means "nothing is open" and a wrong property name means the same
    // thing, and this is what separates them.
    //
    // All three, not just the window count: both models populate
    // asynchronously, so the Wayland handles can arrive *after* the last window
    // does. Keying the log on the window count alone hid exactly that -- the
    // final line said "0 with a Wayland handle" and nothing was ever logged
    // again, whether or not they turned up a moment later.
    //
    // Still not logged on every evaluation, because a browser retitling itself
    // re-evaluates the catalog several times a second and none of these three
    // numbers moves when it does.
    property string loggedState: ""

    onCatalogChanged: root.report()

    // The Wayland model filling up is its own event, and it can happen after
    // the last window has arrived -- so it has to be able to trigger a line on
    // its own, or the handle count in the log is only ever a snapshot taken too
    // early.
    onWaylandCountChanged: root.report()

    // Says how many windows the model reported and how many of them carry a
    // Wayland handle, because that second number is what decides whether
    // focusWindow() takes the verified path or warns and falls back. A count of 0
    // here against open windows is the model not having populated *yet* -- it
    // is asynchronous, exactly as DesktopEntries is -- and the next line logged
    // is the one that says it did.
    function report(): void {
        const entries = root.catalog.entries;
        const first = entries.length > 0 ? entries[0] : null;
        const handles = entries.filter(entry => entry.target.wayland !== null).length;

        const state = `${entries.length}/${handles}/${root.waylandCount}`;
        if (state === root.loggedState)
            return;
        root.loggedState = state;

        console.log("launcher: windows Provider sees", entries.length, "window(s),",
            handles, `with a Wayland handle (ToplevelManager has ${root.waylandCount})`
            + (first !== null ? ` -- first: ${first.name} [${first.subtext}]` : ""));

        // No warning here, deliberately, and it is worth saying why since there
        // was one.
        //
        // Ticket 05 warned from this function when windows existed, none of
        // them linked to a Wayland toplevel, and the Wayland model was
        // non-empty -- on the theory that a populated Wayland model with no
        // links is the state that means `wayland` has been renamed, while an
        // empty one is merely a startup phase.
        //
        // The host disproved it: the models fill *concurrently* and the links
        // are made one at a time behind both, so the log walks through
        // `0 handles / ToplevelManager has 1` and then all the way to
        // `0 handles / ToplevelManager has 7` before the first link appears.
        // Every one of those satisfies the condition, on every restart. There
        // is no count that separates "not linked yet" from "never will be" --
        // the difference is time, and no snapshot has it.
        //
        // So the key dump moved to where the fault has a consequence:
        // focusWindow's fallback branch. That fires on a real activation, long
        // after any startup phase, and it fires exactly when a window is about
        // to be focused through the unverified path -- which is the moment the
        // key list is worth reading. A diagnostic that cries wolf on every
        // restart is worse than no diagnostic; the three numbers logged above
        // still say plainly whether the handles arrived.
    }

    // Whether the key list has been dumped this session. Once is enough: it
    // answers "what is the property called now", which does not change while
    // the process runs, and the fallback it hangs off would otherwise reprint
    // it on every activation.
    property bool dumpedKeys: false

    Component.onCompleted: {
        // Says outright whether the model exists at all, separately from
        // whether it has anything in it yet. Without this an unresolved name
        // and an empty session look identical -- the trap ticket 01 named for
        // the global shortcut and ticket 04 hit with DesktopEntries.
        console.log("launcher: Hyprland.toplevels is",
            Hyprland.toplevels === undefined || Hyprland.toplevels === null
                ? "unavailable -- the windows Provider will stay empty"
                : "present");

        root.refresh();
    }

    // Optional on the Provider interface: ask the source for what it may not
    // have yet. Called at startup and again on every open.
    //
    // The model is empty when the config loads and fills a moment later --
    // 0 to 6 windows, one at a time, and on the host that lands *after* all 84
    // applications have. That is the whole of the "first open lists no windows"
    // defect: not a view that failed to repaint, just a Launcher opened before
    // the compositor had answered. Asking again on each open costs one IPC
    // round trip on a path that is already dismissing-or-showing, and it is the
    // only thing that can shorten the gap from this side.
    //
    // Guarded because the host confirmed the function exists rather than
    // because it was assumed.
    function refresh(): void {
        if (typeof Hyprland.refreshToplevels === "function")
            Hyprland.refreshToplevels();
    }

    // What makes the catalog's reads defensive: a renamed or absent property
    // costs an empty string rather than a broken binding.
    function stringOf(value) {
        return typeof value === "string" ? value : "";
    }

    // One window, as the fields lib/windows.js needs. Each field has a
    // fallback through `lastIpcObject`, which is the raw IPC snapshot and
    // carries the same three under different names.
    //
    // `target` keeps both handles: activation prefers the Wayland one, which is
    // the path verified against Hyprland's source, and settles for the Hyprland
    // object when a toplevel has no Wayland handle.
    function describe(toplevel) {
        return {
            title: root.stringOf(toplevel.title ?? toplevel.lastIpcObject?.title),
            appId: root.stringOf(toplevel.wayland?.appId ?? toplevel.lastIpcObject?.class),
            workspace: root.stringOf(toplevel.workspace?.name ?? toplevel.lastIpcObject?.workspace?.name),

            target: {
                wayland: toplevel.wayland ?? null,
                hyprland: toplevel
            }
        };
    }

    // Which slots this Provider fills. Primary only, same as applications, and
    // the two labels differing is what says the vocabulary is per Provider
    // rather than one hardcoded string: arrowing from a window to an
    // application changes the footer from "switch to" to "launch" while the key
    // stays Return.
    //
    // Plus one extra: closing the window. An extra rather than the secondary
    // slot, and that is a claim about meaning rather than about spare keys.
    // `secondary` is "the other obvious way to act on this Entry" everywhere it
    // will be filled -- ticket 13 has primary copying a screenshot's image and
    // secondary copying its path -- and destroying a window is not another way
    // of switching to it. An extra is by definition outside the shared
    // vocabulary, so nothing may assume Ctrl+W means anything at all in the
    // next Provider, which is exactly the guarantee a destructive Action wants.
    //
    // `after: "refresh"` because this is the one Action in either Provider that
    // changes what the list should say rather than acting and going away -- see
    // closeWindow for what refresh does and does not do here.
    readonly property var actions: ({
        primary: {
            label: "switch to",
            invoke: entry => root.focusWindow(entry)
        },

        extras: [
            {
                chord: "Ctrl+W",
                label: "close window",
                invoke: entry => root.closeWindow(entry),
                after: "refresh"
            }
        ]
    })

    // The primary Action: focus the window.
    function focusWindow(entry): void {
        // The verified path -- see the header.
        const wayland = entry.target.wayland;
        if (wayland && typeof wayland.activate === "function") {
            wayland.activate();
            return;
        }

        // Unverified, and only reached for a window the Wayland model did not
        // know about. Left in because a Provider that might focus the window
        // beats one that certainly does not; if it behaves differently for a
        // special workspace, this is the line to look at.
        const hyprland = entry.target.hyprland;
        if (hyprland && typeof hyprland.activate === "function") {
            console.warn("launcher: no Wayland handle for", entry.name, "-- focusing through Hyprland");

            // The key list, here rather than at startup -- see report(). One
            // window reaching this is a link that has not been made *yet*, and
            // is unremarkable; every window reaching it means `wayland` is not
            // what the property is called any more, and this says what is.
            // Printed off the toplevel actually being activated, so it is the
            // object whose keys are in question rather than whichever one
            // happened to be first in the model.
            if (!root.dumpedKeys) {
                root.dumpedKeys = true;
                console.warn("launcher: HyprlandToplevel keys:", JSON.stringify(Object.keys(hyprland)));
            }

            hyprland.activate();
            return;
        }

        console.warn("launcher: cannot focus", entry.name, "-- no activate() on either handle");
    }

    // The extra Action: ask the window to close.
    //
    // **Ask**, not force, and the word is the whole semantics. This is the
    // `close_requested` event of zwlr_foreign_toplevel_handle_v1 -- the same
    // request a titlebar's X button sends. The client decides what to do with
    // it: an editor with unsaved work may put up a dialog and stay, and that is
    // correct behaviour rather than this Action failing. Nothing here kills a
    // process, which is deliberate -- an Action reachable by one keystroke from
    // a list you are typing into should not be able to lose someone's work.
    //
    // Only the Wayland handle. There is no Hyprland fallback for the same
    // reason focusWindow's is a last resort rather than a peer: the alternative
    // is `dispatch closewindow address:0x…`, and ticket 01 found this machine
    // runs Hyprland's Lua config where a bare dispatcher string is a syntax
    // error. A window with no Wayland handle is left un-closable and says so,
    // which is a better answer than a dispatch that may silently do nothing --
    // and, unlike focusing, there is no "might work" worth the risk when the
    // Action is destructive.
    //
    // **What `after: "refresh"` buys, precisely.** Not the list updating -- the
    // catalog is a binding over live compositor state, so the Entry vanishes on
    // its own the moment the window actually goes, whether or not anything asks.
    // What the outcome buys is the Launcher *staying open*, which is the point:
    // closing a window is the one Action here you plausibly do twice in a row,
    // and dismissing after it would make the second one a whole new open. The
    // refresh itself is a nudge for the case the compositor's event is missed,
    // and it is deliberately fire-and-forget: the close is a request the client
    // may take a moment to honour, so a re-query landing before the window is
    // gone is expected and costs nothing.
    //
    // `close()` is the one piece of this Provider that could not be checked
    // before it shipped -- no quickshell in the devcontainer, so the property
    // name is read off the protocol rather than off the binding. Hence the
    // typeof guard and the key dump: a wrong name warns, names what the object
    // does have, and closes nothing, rather than throwing inside an Action.
    function closeWindow(entry): void {
        const wayland = entry.target.wayland;

        if (wayland && typeof wayland.close === "function") {
            wayland.close();
            return;
        }

        if (!wayland) {
            console.warn("launcher: cannot close", entry.name, "-- the window has no Wayland handle");
            return;
        }

        console.warn("launcher: cannot close", entry.name, "-- no close() on the Wayland handle");

        // Once per session, and the only thing that answers "then what is it
        // called?". This is the branch that exists because the API could not be
        // verified from the container; if it ever fires, the answer is in the
        // list it prints.
        if (!root.dumpedWaylandKeys) {
            root.dumpedWaylandKeys = true;
            console.warn("launcher: Wayland Toplevel keys:", JSON.stringify(Object.keys(wayland)));
        }
    }

    // Whether closeWindow has already said what the Wayland toplevel actually
    // exposes. Separate from dumpedKeys, which answers a different question
    // about a different object.
    property bool dumpedWaylandKeys: false
}
