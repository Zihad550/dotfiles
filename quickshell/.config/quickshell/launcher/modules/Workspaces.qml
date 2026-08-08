import QtQuick
import Quickshell
import Quickshell.Hyprland
import "../lib/matching.js" as Matching
import "../lib/catalog.js" as Catalog
import "../lib/sequence.js" as Seq
import "../lib/workspaces.js" as Ws

// The workspaces Provider: every numbered workspace, switch to one on Return,
// rename one from the Launcher itself -- ticket 16's "Renaming a workspace is
// an Action on a workspace Entry, needing no external text prompt", which was
// bin/df-hypr-rename-workspace (deleted) before this.
//
// The Provider interface it fills -- label, ready, catalog, actions -- is
// documented at the top of Applications.qml. Structurally this is the windows
// Provider: a binding over Hyprland.workspaces, a pure module turning each
// workspace into an Entry, and the same defensive reading style.
//
// **Special workspaces are not rows.** The bar's own Workspaces.qml splits
// them into their own component, and this Provider has a sharper reason than
// tidiness: the rename Action is advertised on every row of the Provider that
// owns it (the footer reads a Provider's Actions, not a row's), and renaming
// a special workspace would produce "id-(name)" out of a negative id, which
// is not a valid special name -- a row with a footer that promises what the
// row cannot do is exactly the failure the footer exists to prevent. See
// Ws.isSpecial, the same predicate the bar uses.
//
// **The rename prompt is the Launcher's own Query field.** There is no
// dialog: the extra Action below asks the Launcher to hand this Provider the
// whole Query line (Launcher.qml's `promptingProvider`), prefilled with the
// workspace's plain name, and Return applies the rename while Escape
// cancels. The prompt text the old script passed to walker survives as the
// placeholder. The dispatch is the script's own Lua form -- this machine's
// Hyprland evaluates a bare dispatcher as Lua, so the legacy fallback the
// script kept for conf-mode hosts is deliberately not carried (ticket 01) --
// and a new name is wrapped as the script wrapped it, `id-(name)`, with an
// empty input meaning "back to the plain id", exactly as the script's empty
// branch did.
NestableProvider {
    id: root

    readonly property string label: "workspaces"

    // Shown by the provider list behind "?".
    readonly property string description: "Switch to a workspace"

    // Never "not ready": an empty list is the model still populating, the
    // same as the windows Provider's own `ready`.
    readonly property bool ready: true

    // Overrides NestableProvider's own handler rather than adding to it, so
    // it has to repeat the leave(): the prompt is session state too, and a
    // Launcher reopened must not still be mid-rename.
    onActiveChanged: {
        if (!root.active) {
            root.cancelPrompt();
            root.leave();
        }
    }

    // Every numbered workspace, from the model the bar also reads. Specials
    // filtered out here -- see the header. `Seq.listOf` is load-bearing, not
    // dressing: `values` is a QML sequence, not a JS Array, so the copy is
    // what makes `.filter` and `.map` below trustworthy. See lib/sequence.js.
    readonly property var workspaceList: Seq.listOf(Hyprland.workspaces?.values)
        .filter(workspace => !Ws.isSpecial(workspace.name))

    // Same shape and the same reasoning as Windows.catalog: read once, so the
    // indices rank() returns always pair with the corpus they came from. A
    // binding over live compositor state, so it re-evaluates when a workspace
    // is added, removed or renamed -- reading `name` here is what makes the
    // rename visible in the list the moment the compositor answers.
    //
    // No Entry Key, and the reason is the windows Provider's own: a workspace
    // id is not guaranteed to survive a restart, and a Key that does not is
    // worse than none. See lib/workspaces.js's note on entryFor.
    readonly property var catalog: {
        const built = Catalog.keylessCatalog(root.workspaceList,
            item => Ws.entryFor(item, root), Ws.textsFor);
        return {
            entries: built.entries,
            corpus: Matching.prepare(built.texts, null, built.owners)
        };
    }

    Component.onCompleted: {
        // Says outright whether the model exists, the same startup check the
        // windows Provider makes -- an unresolved name and an empty session
        // look identical otherwise.
        console.log("launcher: Hyprland.workspaces is",
            Hyprland.workspaces === undefined || Hyprland.workspaces === null
                ? "unavailable -- the workspaces Provider will stay empty"
                : "present");
    }

    // Primary: switch to the workspace. The bar's own click handler activates
    // the same object (`modelData.activate()`), which sends the dispatch over
    // Quickshell's own Hyprland connection rather than through hyprctl -- the
    // Lua-config dispatch problem ticket 01 named does not exist on this path.
    //
    // An `activate` guard rather than a bare call: the property is not
    // verifiable from a devcontainer, and the windows Provider's own
    // activation is guarded the same way. A workspace that cannot be
    // activated gets a warning instead of a thrown binding.
    readonly property var actions: ({
        primary: {
            label: "switch to",
            invoke: entry => root.switchTo(entry)
        },

        // The rename Action -- ticket 16's whole reason for this Provider.
        // An extra rather than the secondary slot, for the same reason the
        // windows Provider's close is an extra: "the other obvious way to act
        // on this Entry" is nothing here, and renaming is not it.
        //
        // `after: "stay"` is load-bearing, not a default: this Action's whole
        // effect is entering a mode (see beginRename), and a close after it
        // would dismiss the Launcher before a single character of the new
        // name could be typed.
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
    //
    // The shape of a prompt, from the Launcher's point of view: `prompting`
    // is a Provider-owned flag, exactly as `nested` is for the sub-view
    // Providers -- Launcher.qml watches it, hands over the Query field while
    // it is true, and restores the Query that found the workspace when it
    // drops. The Launcher calls `applyPrompt(text)` on Return and
    // `cancelPrompt()` on Escape; nothing else in the prompt is Launcher
    // business.

    property bool prompting: false
    property var promptingEntry: null

    // What the Query field is prefilled with: the workspace's plain name --
    // "dev" from "3-(dev)", "" from an unchanged "3" (see Ws.plainNameOf).
    readonly property string promptValue: root.promptingEntry
        ? Ws.plainNameOf(root.promptingEntry.target.name, root.promptingEntry.target.id) : ""

    // What the footer's Return hint calls this prompt. Read by the Launcher;
    // "confirm" is its fallback for a Provider that declares no verb.
    readonly property string promptVerb: "rename"

    // The placeholder, when the prefill is empty: the old script's prompt
    // text -- "Rename workspace 3 (3-(dev))" is what walker used to say.
    readonly property string promptPlaceholder: root.promptingEntry
        ? Ws.promptText(root.promptingEntry.target.id, root.promptingEntry.target.name) : ""

    function beginRename(entry): void {
        // The entry is set before the flag: the Launcher's onPromptingChanged
        // reads promptValue synchronously when `prompting` flips.
        root.promptingEntry = entry;
        root.prompting = true;
    }

    // The dedicated rename keybind's entry point -- SUPER+SHIFT+R, through
    // shell.qml's "rename-workspace" GlobalShortcut and Launcher.renameFocused.
    // Skips the browse-then-Ctrl+R path and prompts for the workspace already
    // focused, which is the only one a keybind pressed from inside a workspace
    // can mean.
    //
    // The entry comes out of `catalog`, not from a fresh entryFor(): the
    // catalog's Entries are what every other rename prompts over, and building
    // a second one here would be a second definition of "the Entry for a
    // workspace" that could drift from Ws.entryFor's.
    //
    // Returns whether the prompt opened, so the Launcher can decide whether to
    // stay open on the workspace list or leave the user where they were --
    // a keybind that opened an ordinary Launcher on failure would be a
    // confusing answer to "rename this workspace".
    // Which workspace the keybind means. `Hyprland.focusedWorkspace` is the
    // precise answer -- on two monitors several workspaces carry `active` at
    // once, one per monitor, and only this one names the focused monitor's.
    // The `active` scan behind it is a fallback rather than the primary,
    // because it cannot tell those apart; it exists because nothing else in
    // this repo reads focusedWorkspace, so a property that turns out not to
    // resolve on this Quickshell would otherwise make the keybind do nothing
    // at all rather than something almost always right. The `active` flag
    // itself is already relied on, by Ws.subtextFor.
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

        // Specials are not rows here (see the header), so there is no Entry to
        // prompt over even though the compositor happily reports one focused.
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

    // Return while prompting. `text` is the Query field's current content --
    // the new name, or "" meaning "back to the plain id", which is exactly
    // what the script's empty branch did (rename_ws id id, silently).
    function applyPrompt(text): void {
        const workspace = root.promptingEntry ? root.promptingEntry.target : null;
        const oldName = workspace ? workspace.name : "";
        const id = workspace ? workspace.id : "";
        const newName = text === "" ? String(id) : id + "-(" + text + ")";

        root.cancelPrompt();

        // Unchanged -- the empty prompt over an already-plain workspace -- is
        // nothing to do, and no notification to send; the script's empty
        // branch also exited silently.
        if (newName === oldName)
            return;

        Quickshell.execDetached(Ws.renameLuaArgv(id, newName));

        // The script notified only its non-empty branch, and the notify
        // named the *plain* name it had received ("Workspace 3: '3-(dev)' →
        // 'dev'"), so the same shape is kept here.
        if (text !== "")
            Quickshell.execDetached(Ws.notifyArgv(id, oldName, text));
    }

    // Escape while prompting -- or dismissal, through `active`. Restores
    // nothing itself: the Launcher's own handler restores the Query the
    // rename started from.
    function cancelPrompt(): void {
        root.prompting = false;
        root.promptingEntry = null;
    }

}
