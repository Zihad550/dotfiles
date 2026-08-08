import QtQuick
import Quickshell
import Quickshell.Hyprland
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/sequence.js" as Seq
import "../lib/workspaces.js" as Ws

// The workspaces Provider: every numbered workspace, switch to one on Return,
// rename one from the Launcher itself (an Action on the workspace Entry,
// needing no external text prompt). Structurally this is the windows
// Provider: a binding over Hyprland.workspaces, a pure module turning each
// workspace into an Entry, the same defensive reading style.
//
// Special workspaces are not rows: the rename Action is advertised on every
// row of the Provider that owns it (the footer reads a Provider's Actions,
// not a row's), and renaming a special would produce an invalid "id-(name)"
// from a negative id -- a row whose footer promises what it can't do. See
// Ws.isSpecial, the same predicate the bar uses.
//
// The rename prompt is the Launcher's own Query field, no dialog: the extra
// Action below hands this Provider the whole Query line
// (Launcher.qml's `promptingProvider`), prefilled with the workspace's plain
// name; Return applies, Escape cancels. Dispatched in Lua form -- this
// machine's Hyprland evaluates a bare dispatcher as Lua. A new name wraps as
// `id-(name)`, with an empty input meaning "back to the plain id".
NestableProvider {
    id: root

    readonly property string label: "workspaces"
    readonly property string description: "Switch to a workspace"

    // Never "not ready": an empty list is the model still populating.
    readonly property bool ready: true

    // Overrides NestableProvider's own handler rather than adding to it, so
    // it repeats leave(): the prompt is session state too, and a reopened
    // Launcher must not still be mid-rename.
    onActiveChanged: {
        if (!root.active) {
            root.cancelPrompt();
            root.leave();
        }
    }

    // `Seq.listOf` is load-bearing: `values` is a QML sequence, not a JS
    // Array, so the copy is what makes `.filter`/`.map` trustworthy.
    readonly property var workspaceList: Seq.listOf(Hyprland.workspaces?.values)
        .filter(workspace => !Ws.isSpecial(workspace.name))

    // No Entry Key: a workspace id isn't guaranteed to survive a restart
    // (same reasoning as the windows Provider) -- see lib/workspaces.js's
    // note on entryFor.
    readonly property var catalog: {
        const built = Catalog.keylessCatalog(root.workspaceList,
            item => Ws.entryFor(item, root), Ws.textsFor);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null, built.owners)
        };
    }

    Component.onCompleted: {
        console.log("launcher: Hyprland.workspaces is",
            Hyprland.workspaces === undefined || Hyprland.workspaces === null
                ? "unavailable -- the workspaces Provider will stay empty"
                : "present");
    }

    // Primary switches via the same `modelData.activate()` the bar's click
    // handler uses -- Quickshell's own Hyprland connection, not hyprctl, so
    // the Lua-dispatcher problem doesn't apply on this path. Guarded since
    // `activate` isn't verifiable from a devcontainer.
    readonly property var actions: ({
        primary: {
            label: "switch to",
            invoke: entry => root.switchTo(entry)
        },

        // An extra, not secondary: there's no "other obvious way" to act on
        // a workspace Entry. `after: "stay"` is load-bearing -- this Action's
        // whole effect is entering a prompt, and closing would dismiss the
        // Launcher before a character could be typed.
        extras: [
            {
                chord: "Ctrl+R",
                label: "rename",
                invoke: entry => root.beginRename(entry),
                after: "stay"
            }
        ]
    })

    function switchTo(entry): void {
        const workspace = entry.target;
        if (workspace && typeof workspace.activate === "function") {
            workspace.activate();
            return;
        }
        console.warn("launcher: cannot switch to workspace", entry.name, "-- no activate() on the workspace");
    }

    // --- The rename prompt ---
    // `prompting` is a Provider-owned flag, exactly like `nested` for sub-view
    // Providers: Launcher.qml watches it, hands over the Query field while
    // true, and restores the prior Query when it drops. The Launcher calls
    // `applyPrompt(text)` on Return and `cancelPrompt()` on Escape.

    property bool prompting: false
    property var promptingEntry: null

    // The workspace's plain name -- "dev" from "3-(dev)", "" from "3".
    readonly property string promptValue: root.promptingEntry
        ? Ws.plainNameOf(root.promptingEntry.target.name, root.promptingEntry.target.id) : ""

    readonly property string promptVerb: "rename"

    readonly property string promptPlaceholder: root.promptingEntry
        ? Ws.promptText(root.promptingEntry.target.id, root.promptingEntry.target.name) : ""

    function beginRename(entry): void {
        // Entry set before the flag: Launcher.qml's onPromptingChanged reads
        // promptValue synchronously when `prompting` flips.
        root.promptingEntry = entry;
        root.prompting = true;
    }

    // SUPER+SHIFT+R's entry point (via shell.qml's "rename-workspace"
    // GlobalShortcut and Launcher.renameFocused): skips browse-then-Ctrl+R
    // and prompts for the workspace already focused.
    //
    // Pulled from `catalog`, not a fresh entryFor(), so it's the same Entry
    // every other rename prompts over.
    //
    // Returns whether the prompt opened, so the caller can decide whether to
    // leave an ordinary Launcher open on failure.
    //
    // `Hyprland.focusedWorkspace` is the precise answer on multi-monitor
    // setups (several workspaces can carry `active` at once, one per
    // monitor); the `active` scan is a fallback for a property this repo
    // otherwise never reads.
    function focusedWorkspace() {
        const focused = Hyprland.focusedWorkspace;
        if (focused)
            return focused;

        console.warn("launcher: Hyprland.focusedWorkspace is unavailable -- falling back to the active flag");
        return root.workspaceList.filter(workspace => workspace.active)[0] || null;
    }

    function renameFocused(): bool {
        const focused = root.focusedWorkspace();
        if (!focused) {
            console.warn("launcher: cannot rename -- no focused workspace");
            return false;
        }

        if (Ws.isSpecial(focused.name)) {
            console.warn("launcher: cannot rename special workspace", focused.name);
            return false;
        }

        const entry = root.catalog.entries.filter(candidate =>
            candidate.target && candidate.target.id === focused.id)[0] || null;
        if (!entry) {
            console.warn("launcher: cannot rename -- workspace", focused.id, "is not in the catalog");
            return false;
        }

        root.beginRename(entry);
        return true;
    }

    // `text` is the Query field's content: the new name, or "" meaning "back
    // to the plain id".
    function applyPrompt(text): void {
        const workspace = root.promptingEntry ? root.promptingEntry.target : null;
        const oldName = workspace ? workspace.name : "";
        const id = workspace ? workspace.id : "";
        const newName = text === "" ? String(id) : id + "-(" + text + ")";

        root.cancelPrompt();

        // Unchanged: nothing to do, no notification.
        if (newName === oldName)
            return;

        Quickshell.execDetached(Ws.renameLuaArgv(id, newName));

        if (text !== "")
            Quickshell.execDetached(Ws.notifyArgv(id, oldName, text));
    }

    // Escape while prompting, or dismissal via `active`. Restores nothing
    // itself: the Launcher's own handler restores the prior Query.
    function cancelPrompt(): void {
        root.prompting = false;
        root.promptingEntry = null;
    }

}
