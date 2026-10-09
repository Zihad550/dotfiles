import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/sequence.js" as Seq

// Qualified `Win`, not `Windows`: the JS import qualifier and this file's own
// QML type share one namespace.
import "../lib/windows.js" as Win

// The windows Provider: what's already running, so typing a name switches to
// it instead of launching a second copy. Provider interface: see
// docs/launcher-spec.md.
//
// Nothing here names a Hyprland or Wayland type directly -- every access goes
// through `var` bindings and optional chaining, so a renamed/missing property
// costs an empty Provider (logged) rather than a compile error that stops the
// whole Launcher opening.
//
// Activation goes through the Wayland toplevel's `activate()`
// (zwlr_foreign_toplevel_handle_v1's `activate` request), not `hyprctl
// dispatch focuswindow` -- this machine's Hyprland Lua config makes a bare
// dispatcher string a syntax error, so the compositor protocol is used
// directly instead of shelling out.
QtObject {
    id: root

    readonly property string label: "windows"
    readonly property string description: "Switch to an open window"

    // Unlike applications, an empty windows Provider is legitimate (nothing
    // open), so this never reports "not ready".
    readonly property bool ready: true

    // Reached from the "?" list by being entered (no prefix); `active` drops
    // the entered state when the Launcher closes.
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

    // Seq.listOf guards a renamed/missing `toplevels`: an exception in this
    // binding would leave `catalog` undefined, and Launcher.qml reading
    // `.corpus` of undefined loses the whole merged list, applications
    // included -- see lib/sequence.js.
    readonly property var toplevels: Seq.listOf(Hyprland.toplevels?.values)

    // Read only so the Wayland toplevel model runs (Quickshell links each
    // HyprlandToplevel to its Wayland counterpart lazily, on first read).
    // Nothing below uses the count itself.
    readonly property int waylandCount: Seq.listOf(ToplevelManager.toplevels?.values).length

    // A window can be found by more than one text (see textsFor in
    // lib/windows.js), so this corpus carries an `owners` array.
    readonly property var catalog: {
        const built = Catalog.keylessCatalog(root.toplevels.map(root.describe),
            item => Win.entryFor(item, root), Win.textsFor);

        // No Entry Key: a window's identity doesn't survive a relaunch, so
        // there's nothing for Frecency to accumulate against.
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null, built.owners)
        };
    }

    // Logged as three numbers together (window count / handle count /
    // ToplevelManager count) rather than just the window count, because the
    // two models populate asynchronously and Wayland handles can arrive after
    // the last window does -- logging only the window count hid that they
    // never caught up. Deduped against re-logging on every retitle.
    property string loggedState: ""

    onCatalogChanged: root.report()
    onWaylandCountChanged: root.report()

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

        // No warning here on 0 handles: the models populate concurrently and
        // links form one at a time, so "0 linked" is indistinguishable from
        // "never will be" until an actual activation needs the fallback --
        // see focusWindow(), which is where the diagnostic belongs instead.
    }

    // Once is enough: the property name doesn't change while the process runs.
    property bool dumpedKeys: false

    Component.onCompleted: {
        // Distinguishes "the model doesn't exist" from "it's just empty" --
        // otherwise an unresolved property name and a quiet session look
        // identical.
        console.log("launcher: Hyprland.toplevels is",
            Hyprland.toplevels === undefined || Hyprland.toplevels === null
                ? "unavailable -- the windows Provider will stay empty"
                : "present");

        root.refresh();
    }

    // The model is empty at config load and fills a moment later, so a
    // Launcher opened before the compositor answers shows no windows on first
    // open; re-asking on every open is the only way to shorten that gap.
    function refresh(): void {
        if (typeof Hyprland.refreshToplevels === "function")
            Hyprland.refreshToplevels();
    }

    function stringOf(value) {
        return typeof value === "string" ? value : "";
    }

    // `target` keeps both handles: activation prefers the Wayland one and
    // falls back to the Hyprland object when a toplevel has none.
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

    // Closing is an `extras` chord, not `secondary`: destroying a window isn't
    // "another way of switching to it," and an extra carries no assumed
    // meaning in other Providers the way the core slots do.
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

    function focusWindow(entry): void {
        const wayland = entry.target.wayland;
        if (wayland && typeof wayland.activate === "function") {
            wayland.activate();
            return;
        }

        // Unverified fallback for a window the Wayland model hasn't linked
        // yet -- a Provider that might focus the window beats one that
        // certainly doesn't.
        const hyprland = entry.target.hyprland;
        if (hyprland && typeof hyprland.activate === "function") {
            console.warn("launcher: no Wayland handle for", entry.name, "-- focusing through Hyprland");

            // Logged once per session: a single window hitting this is an
            // unremarkable timing gap, but if every window does, `wayland` has
            // likely been renamed -- this says what the object actually has.
            if (!root.dumpedKeys) {
                root.dumpedKeys = true;
                console.warn("launcher: HyprlandToplevel keys:", JSON.stringify(Object.keys(hyprland)));
            }

            hyprland.activate();
            return;
        }

        console.warn("launcher: cannot focus", entry.name, "-- no activate() on either handle");
    }

    // **Ask, not force**: this is close_requested (zwlr_foreign_toplevel_handle_v1),
    // the same request a titlebar X sends -- the client decides (e.g. an editor
    // may prompt and stay open). Deliberately no fallback that could kill a
    // process; an Action one keystroke away from a list you're typing into
    // shouldn't be able to lose someone's work.
    //
    // Wayland handle only, no Hyprland fallback (unlike focusWindow) -- a
    // window that can't be asked cleanly is left un-closable rather than risking
    // a dispatch that silently does nothing.
    //
    // `after: "refresh"` keeps the Launcher open rather than dismissing, since
    // closing a window is the one Action here you might do twice in a row; the
    // Entry itself disappears on its own via the live catalog binding once the
    // window actually goes.
    //
    // `close()`'s existence was never verified against a running quickshell
    // (no compositor in the devcontainer) -- hence the typeof guard and key dump
    // instead of assuming it's there.
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

        if (!root.dumpedWaylandKeys) {
            root.dumpedWaylandKeys = true;
            console.warn("launcher: Wayland Toplevel keys:", JSON.stringify(Object.keys(wayland)));
        }
    }

    // Separate from dumpedKeys: a different object's keys.
    property bool dumpedWaylandKeys: false
}
