import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets
import Quickshell.Hyprland
import qs
import "../lib/matching.js" as Matching
import "../lib/highlight.js" as Highlight
import "../lib/actions.js" as Actions
import "../lib/routing.js" as Routing
import "../lib/providerlist.js" as ProvList
import "../lib/power.js" as Power

// The Launcher window: a full-screen overlay with the Launcher card centred
// horizontally in it -- the Query line, the ranked Entries, and the keyboard
// routing over them.
//
// Deliberately not a LazyLoader (unlike Osd/NotificationPopup): the whole
// point of an always-running instance is that the window already exists when
// the keybind fires. `visible` toggles; nothing is created or destroyed on
// open, so state persists across opens unless reset() clears it.
//
// Full-screen, not a small centred window, so a click outside the card still
// lands on a surface. `screen` is left unset (compositor picks), same as
// NotificationPopup/Osd.
PanelWindow {
    id: root

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    // exclusiveZone: 0 would work today, but with all four anchors set the
    // automatic computation is the thing that surprises you -- refuse it
    // outright instead.
    exclusionMode: ExclusionMode.Ignore

    color: "transparent"
    visible: false

    // Above everything, including fullscreen windows (verify with `hyprctl
    // layers`).
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "launcher"

    // On-demand, never Exclusive: Exclusive would take the keyboard from
    // every other surface, leaving nowhere to type the command that kills a
    // stuck Launcher.
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    // The default pool, in the order that breaks ties between Providers.
    // Windows first: a running window and the application that would launch a
    // second copy score identically for a shared name (see textsFor in
    // lib/windows.js), so this order makes typing "firefox" offer the window
    // you have. Frecency still outranks pool order, since usage is a real
    // score difference rather than a tie (pinned by a test in
    // tests/launcher/matching.test.js). Static menus come last since their
    // Entries are hand-written to be typed ("Lock", "Restart") and losing a
    // tie against a real window/app costs nothing.
    //
    // Ex-dmenu Providers (processes, systemd, workspaces, dev servers,
    // zellij), themes and backgrounds are deliberately not here -- see
    // `rankedRoutable`.
    readonly property var pool: [windows, apps, systemMenu, mediaMenu, displayMenu, otherMenu]

    // Ranked Providers reachable only through their own prefix or by nesting,
    // never in the default pool. Directories, files and clipboard are kept
    // out because scoring their full corpus (~17,000 paths for directories)
    // against every keystroke of an unrelated Query would cost real time;
    // screenshots is kept out for a different reason, see `previewMode`.
    //
    // Themes, backgrounds and the ex-dmenu Providers (processes, systemd,
    // workspaces, dev servers, zellij) have no prefix of their own -- reached
    // only through the "?" provider list's enter()/nested mechanism, which is
    // why they must be in this list even without a prefix (`nestedProvider`
    // below reads it). Ranking them against every keystroke would put a row
    // whose Return is `kill -9` or a unit restart one tie away from an
    // ordinary Query; being enter-only makes that impossible rather than
    // merely unlikely. They keep `refresh()` on every open regardless -- this
    // list is what `open()` walks.
    readonly property var rankedRoutable: root.pool.concat([directories, files, screenshots, clipboard, keybindings, themes, backgrounds, workspaces, processes, systemd, devServers, zellij, providerList])

    // `root.activePool`, not `root.pool`: a Query routed to one Provider that
    // hasn't populated yet should report pending for *that* Provider only.
    readonly property var pending: root.activePool.filter(provider => !provider.ready).map(provider => provider.label)

    // Everything prefix routing can name: `rankedRoutable` plus calc and
    // websearch, which generate their own Entries and so aren't in `pool` or
    // scored, but are still prefix-reachable.
    //
    // Evaluated lazily on first read (route() does this every keystroke) with
    // no side effects here on purpose -- Routing.problems() is checked
    // separately from Component.onCompleted, so "caught at load" means that
    // and not "caught by whichever binding happens to read this first".
    readonly property var routable: root.rankedRoutable.concat([calc, websearch])

    // Which Provider, if any, the current Query names, with that Provider's
    // prefix stripped -- recomputed on every keystroke and kept stateless
    // (nothing remembers the previous keystroke), so a backspace that deletes
    // the prefix character naturally falls back to the default pool.
    readonly property var routed: Routing.route(root.routable, root.queryText)

    // The Provider currently showing a sub-view of its own (e.g.
    // Directories.qml's chooser), or null. Checked ahead of prefix routing in
    // `activePool`: while nested, a Provider owns the whole pool regardless
    // of the Query, and this is Launcher state rather than something read off
    // the Query text -- typing "/" while the chooser is open must not un-nest it.
    readonly property var nestedProvider: root.rankedRoutable.filter(provider => provider.nested === true)[0] || null

    // The ranked pool narrowed to what prefix routing or nesting allows.
    // `indexOf` against `rankedRoutable` (not trusting `routed.provider`
    // blindly) is what makes routing to calc/websearch collapse this to `[]`
    // instead of ranking the whole pool against a Query meant for an
    // unscored Provider.
    readonly property var activePool: root.nestedProvider !== null
        ? [root.nestedProvider]
        : (root.routed.provider === null ? root.pool : (root.rankedRoutable.indexOf(root.routed.provider) >= 0 ? [root.routed.provider] : []))

    // Whether the Entries render as the list-plus-preview split instead of
    // the default single-column list -- ticket 13. Gated on `activePool`
    // holding exactly one Provider that asks for it, rather than on the
    // highlighted Entry's own Provider: the alternative would let a preview
    // Provider's Entries render row-for-row alongside a plain list
    // Provider's the moment both were ever ranked together, which is not a
    // layout either was designed to share. Screenshots.qml is kept out of
    // `pool` for exactly this reason -- see the note on `rankedRoutable` --
    // Gated on `activePool` holding exactly one Provider with this layout,
    // not on the highlighted Entry's own Provider -- otherwise a preview
    // Provider's Entries could render row-for-row alongside a plain list the
    // moment both were ever ranked together.
    readonly property bool previewMode: root.activePool.length === 1 && root.activePool[0].layout === "preview"

    // The Query as it stood before entering a nested sub-view, restored on
    // the way back out. Entering clears root.queryText, since a chooser's few
    // Entries are unranked and shouldn't stay filtered by whatever named the
    // directory that opened it.
    property string savedQuery: ""

    // Guarded on `root.visible` to avoid a race: dismissing the Launcher
    // while a chooser is open un-nests it too, firing this handler's
    // "leaving" branch at the same moment reset() (onVisibleChanged, below)
    // clears the Query to "". The guard means restoring is skipped whenever
    // the Launcher is already closing, so reset()'s "" always wins regardless
    // of handler order.
    onNestedProviderChanged: {
        if (root.nestedProvider !== null) {
            root.savedQuery = root.queryText;
            root.reset();
        } else if (root.visible) {
            root.setQuery(root.savedQuery);
            root.highlightFirst();
        }
    }

    // The Provider currently holding the Query line as a text prompt (e.g.
    // Workspaces.qml's rename), or null. While set, the Query line is a
    // prompt rather than a search line: list and empty state are suppressed,
    // the placeholder names what's being prompted for, and Return/Escape
    // route to the Provider instead of to the ranked Entries.
    readonly property var promptingProvider: root.rankedRoutable.filter(provider => provider.prompting === true)[0] || null

    readonly property bool prompting: root.promptingProvider !== null

    // The Query as it stood before a prompt began, restored on the way out --
    // same reason and guard as `savedQuery`. Kept separate from `savedQuery`
    // even though the two can't overlap, so a later Provider change doesn't
    // have to remember they share a slot.
    property string savedPromptQuery: ""

    // Same `root.visible` guard as the nesting handler above, for the same
    // race: dismissing mid-prompt cancels it too, and only reset()'s "" should win.
    onPromptingChanged: {
        if (root.prompting) {
            root.savedPromptQuery = root.queryText;
            root.setQuery(root.promptingProvider.promptValue);
        } else if (root.visible) {
            // A session opened *as* the prompt has nothing to go back to --
            // see renameFocusedWorkspace.
            if (root.promptOnly) {
                root.dismiss();
                return;
            }
            root.setQuery(root.savedPromptQuery);
            root.highlightFirst();
        }
    }

    // Held here rather than read off the TextInput, so ranking depends on no
    // QML Item: reading `query.text` directly would make ranking depend on
    // whether that Item had been realised yet inside a `visible: false`
    // window. The field drives this (onTextChanged below); reset() is the
    // only thing that writes back the other way.
    property string queryText: ""

    // The Entries for the current Query, best first, across every Provider.
    // Each catalog is read exactly once so the indices rank() returns stay
    // paired with the entry list the corpus was prepared from. Three steps:
    // rank the Provider's own corpus, collapse texts back to Entries, merge
    // rankings on score across Providers (sound because there's one scorer,
    // one scale). rank()/merge() are both capped, and the ListView only
    // builds what's on screen, so a full corpus is never realised as Items.
    //
    // The Frecency map reaches only Entries carrying an Entry Key (rank()
    // skips one that has none), which is also what makes the empty Query
    // useful: everything scores 0, so usage alone decides order.
    //
    // `root.activePool`/`root.routed.query`, not `root.pool`/`root.queryText`
    // -- prefix routing's whole effect on ranking; unrouted, they're the same.
    //
    // An `ordered` catalog (Files.qml) skips rank() entirely: its Entries are
    // already in required display order (each folder followed by its own
    // contents), which independent per-Entry scoring would break apart. Every
    // Entry gets score 0, so merge() keeps encounter order -- sound only
    // because an ordered catalog is prefix-only and never merges with a
    // scored Provider. See lib/files.js and Files.qml's `catalog`.
    readonly property var scoredEntries: {
        const usage = Frecency.usage;
        const catalogs = root.activePool.map(provider => provider.catalog);
        const ranked = catalogs.map(catalog => catalog.ordered
            ? { indices: catalog.entries.map((entry, i) => i), scores: catalog.entries.map(() => 0) }
            : Matching.collapse(catalog.corpus, Matching.rank(catalog.corpus, root.routed.query, {
                usage: usage
            })));
        return Matching.merge(ranked).map(pick => catalogs[pick.provider].entries[pick.index]);
    }

    // Calculator and web search aren't in `pool` and aren't scored: both
    // generate their Entry from the Query itself, so a corpus holding a copy
    // of the needle would always rank first. Placed by hand instead, keeping
    // "one scorer, one scale" intact.
    //
    // The calculator goes first, above the ranked pool, so a result always
    // outranks a fuzzy match -- appending it instead would let a Query like
    // "10 cm to inch" fuzzy-match an application and launch it instead of
    // copying the answer. It's narrow enough to sit there: lib/calc.js only
    // produces an Entry for a Query with at least three characters and a
    // digit, once qalc returns something that isn't an error or an echo.
    readonly property var localEntries: calc.entries.concat(root.scoredEntries)

    // Appending the web search means the "No matches" empty state is
    // unreachable for any non-empty Query -- a Query nothing local answers
    // becomes a web search instead of a blank card. The empty state still
    // covers what's left: an empty Query against a pool that hasn't populated.
    readonly property var rankedEntries: root.localEntries.concat(websearch.entries)

    // Not highlightFirst(): Entries can change without the Query changing (a
    // window opening/closing/retitling re-ranks the pool), and resetting the
    // highlight there would yank it away mid-arrow over something unrelated.
    onRankedEntriesChanged: root.keepHighlight()

    // Theme.maxHeight is the taste limit; the rest is fitting the output. The
    // card starts a sixth of the way down, so on a 1366x768 screen a
    // full-height list plus the Query line and padding would run the card off
    // the bottom edge. No binding loop: everything read here is the output's
    // own geometry or an Item whose size doesn't depend on the list.
    readonly property int listMaxHeight: {
        // Padding, the two Column gaps around the rule, the rule, the Query
        // line, and the footer + its gap when visible (an invisible child
        // still has a height, so this checks rather than adding unconditionally).
        const chrome = Theme.padding * 4 + 1 + query.height + (footer.visible ? footer.height + Theme.padding : 0);
        const available = root.height - card.y - Theme.padding - chrome;

        // One Entry minimum, so a pathologically short output still shows something.
        return Math.max(Theme.entryHeight, Math.min(Theme.maxHeight, available));
    }

    // Held here rather than read back off the ListView: `model` gets a new
    // array on every re-rank, and a view given a new model may move
    // currentIndex on its own. This is the intent; the view follows it.
    property int highlightIndex: -1

    // The highlighted Entry itself, so it can be found again by identity
    // after the Entries change under it, not just by position.
    property var highlightedEntry: null

    // The one place the highlight moves, so the view can't show one Entry
    // while Enter acts on another.
    function setHighlight(index: int): void {
        root.highlightIndex = index;
        root.highlightedEntry = index >= 0 ? root.rankedEntries[index] : null;

        // Both views kept in sync regardless of which is showing, so
        // `previewMode` flipping mid-session never shows a stale currentIndex.
        list.currentIndex = index;
        previewList.currentIndex = index;

        // Re-asserted next event loop turn: the view's model binding hasn't
        // caught up yet, so positioning now would scroll the previous
        // content. Qt.callLater collapses repeats to one pass.
        Qt.callLater(root.applyHighlight);
    }

    function applyHighlight(): void {
        list.currentIndex = root.highlightIndex;
        previewList.currentIndex = root.highlightIndex;
        if (root.highlightIndex < 0)
            return;

        if (root.previewMode)
            previewList.positionViewAtIndex(root.highlightIndex, ListView.Contain);
        else
            list.positionViewAtIndex(root.highlightIndex, ListView.Contain);
    }

    // Belt and braces: the surface's real height reaches the list after
    // open() has already returned, so this re-asserts position against the
    // geometry the view ended up with. Qt.callLater collapses repeats.
    function reassertView(): void {
        if (!root.visible)
            return;
        Qt.callLater(root.applyHighlight);
    }

    // Whether the highlight is where the *user* put it, or just defaulted
    // there. This is the whole of a real bug: at startup applications land
    // first and the highlight defaults to the first of them; when windows
    // then arrive above it, following the highlighted Entry by identity
    // dragged the highlight (and the view) down with it, leaving the new
    // windows scrolled off the top. Identity is honoured only for a highlight
    // the user placed -- otherwise a re-rank goes back to the best match.
    property bool highlightPinned: false

    // Puts the highlight back on the best match -- needed both when the list
    // narrows (highlight could land past the end) and when it widens after a
    // backspace (highlight could be scrolled off the top). Also releases the
    // pin: typing is a new intent that outranks wherever the arrows had got to.
    function highlightFirst(): void {
        root.highlightPinned = false;
        root.setHighlight(Highlight.first(root.rankedEntries));
    }

    // Where the highlight goes when Entries change under it without the
    // Query changing (a window opening/closing/retitling). Rule lives in
    // lib/highlight.js, under test -- a wrong answer here reads as a
    // preference, not a crash, so it's easy to ship broken.
    function keepHighlight(): void {
        root.setHighlight(Highlight.next(root.rankedEntries, {
            pinned: root.highlightPinned,
            index: root.highlightIndex,
            entry: root.highlightedEntry
        }));
    }

    // Wraps, so the far end of the list is one keypress away. The one thing
    // that pins the highlight -- an arrow key is the user choosing where it
    // goes, and a re-rank must respect that until the Query changes.
    function moveHighlight(delta: int): void {
        const count = root.rankedEntries.length;
        if (count === 0)
            return;
        root.highlightPinned = true;
        root.setHighlight((root.highlightIndex + delta + count) % count);
    }

    // Which Actions the highlighted Entry's Provider offers, for the footer.
    // Empty with nothing highlighted, which also hides it. While a prompt
    // owns the Query line there's no highlighted Entry, so the footer names
    // the prompt's own keys instead.
    readonly property var promptActions: root.promptingProvider ? [
        { chord: "Return", label: root.promptingProvider.promptVerb || "confirm" },
        { chord: "Escape", label: "cancel" }
    ] : []

    // Named after what Return does to *this* action ("shut down", not
    // "confirm") -- the footer is the only thing on screen saying what's
    // about to happen.
    readonly property var confirmActions: root.pendingAction ? [
        { chord: "Return", label: root.pendingAction.label.toLowerCase() },
        { chord: "Escape", label: "cancel" }
    ] : []

    readonly property var highlightActions: root.confirming
        ? root.confirmActions
        : (root.prompting
            ? root.promptActions
            : (root.highlightedEntry ? Actions.available(root.highlightedEntry.provider) : []))

    // root.highlightedEntry, not rankedEntries[highlightIndex]: the footer
    // reads the same property, so "the keys do what the footer says" is
    // structural rather than two expressions that have to be kept in sync.
    function runHighlighted(chord: string): bool {
        return root.runAction(root.highlightedEntry, chord);
    }

    // The one place an Action is dispatched, so keyboard and pointer can't
    // drift apart on what activating means. The Entry carries its own
    // Provider, so this stays one function regardless of pool size.
    //
    // Returns whether anything ran, which is what the key handler accepts the
    // event on. A chord no Provider filled is left unaccepted on purpose -- see
    // the dispatcher below.
    function runAction(entry, chord): bool {
        if (entry === undefined || entry === null)
            return false;

        const action = Actions.resolve(entry.provider, chord);
        if (action === null)
            return false;

        // Dismissed before the Action runs (only when it asks to close): this
        // surface holds keyboard focus until it unmaps, so the launched/focused
        // window should get that focus rather than race the overlay for it. No
        // delay needed -- the layer surface going away and the activate request
        // travel the same Wayland connection in issue order, so the compositor
        // handles the sequencing.
        if (Actions.wantsClose(action))
            root.dismiss();

        action.invoke(entry);

        // Recorded after the Action (dismiss() already re-ranked the pool via
        // Frecency, and doing that before invoke() would stall the launch --
        // free for ~84 applications, but directories measured at 46-61ms per
        // pass). Recorded from `entry`, not root.highlightedEntry: dismiss()
        // already fired reset(), which moves the highlight to the best match,
        // so root.highlightedEntry would name the wrong Entry by then.
        // Actions.counts excludes `back`, which isn't a choice of an Entry.
        if (Actions.counts(action))
            Frecency.record(entry.key);

        // refresh is optional on the Provider interface -- an Action asking
        // for one from a Provider without it just leaves the Entries as they
        // were, which is the honest outcome.
        if (Actions.wantsRefresh(action) && typeof entry.provider.refresh === "function")
            entry.provider.refresh();

        return true;
    }

    function open(): void {
        if (root.visible)
            return;
        root.visible = true;
        query.forceActiveFocus();

        // Every Provider that can be asked for fresher data is, since an open
        // is exactly when being out of date shows (`rankedRoutable`, not
        // `pool`, since prefix-only Providers like directories want this too).
        root.rankedRoutable.forEach(provider => {
            if (typeof provider.refresh === "function")
                provider.refresh();
        });

        // Frecency decays with wall-clock time and this process may run for
        // weeks without restarting, so an open is what moves its clock forward.
        Frecency.refresh();

        root.reassertView();
    }

    function dismiss(): void {
        root.visible = false;
    }

    function toggle(): void {
        if (root.visible)
            root.dismiss();
        else
            root.open();
    }

    // A dedicated keybind's entry point (e.g. clipboard's own shortcut):
    // opens (or leaves open) and sets the Query to a prefix, so routing
    // itself narrows the pool rather than a special case here.
    //
    // A nested Provider outranks routing in `activePool` and a prefix alone
    // can't undo that, so this dismisses-then-reopens when something is
    // nested -- `dismiss()` sets `visible` false, which Directories.qml's own
    // `active` binding watches to clear its nested state. Skipped when
    // nothing is nested (the common case), so a plain keybind press doesn't
    // flicker the window shut and open again for no reason.
    function openOn(prefix: string): void {
        if (root.nestedProvider !== null)
            root.dismiss();
        root.open();
        root.setQuery(prefix);
        root.highlightFirst();
    }

    // SUPER+SHIFT+R's entry point -- opens the Launcher already as a rename
    // prompt for the focused workspace, rather than to be searched. Bound in
    // hypr/.config/hypr/lua/bindings/utilities.lua. Nothing new to render:
    // `prompting` already suppresses the list/empty state and turns the Query
    // line into the prompt.
    //
    // Opened before the prompt is asked for, not after, so the Provider is
    // `active` the whole time it holds prompt state -- setting `prompting` on
    // an inactive Provider would depend on handler ordering. A workspace that
    // can't be renamed briefly maps the window before this closes it again;
    // that's a special-workspace edge case, and closing is more honest than
    // leaving an ordinary Launcher open when SUPER+SHIFT+R asked for a prompt.
    function renameFocusedWorkspace(): void {
        if (root.nestedProvider !== null)
            root.dismiss();
        root.open();

        if (!workspaces.renameFocused()) {
            root.dismiss();
            return;
        }

        // Return and Escape both end this session rather than dropping back to
        // the workspace list: the list was never asked for. Cleared by reset().
        root.promptOnly = true;
    }

    // Whether this session exists only for the prompt -- set by
    // renameFocusedWorkspace above, read by onPromptingChanged.
    property bool promptOnly: false

    // --- Confirming a session-ending keybind ---
    //
    // The power keybinds (shutdown, restart, logout, lock) dispatch here to
    // ask first rather than running straight from Hyprland. See lib/power.js.
    //
    // A mode of this window, not a Provider: a confirmation has no Entry and
    // nothing to search, so putting it in the pool would mean a Provider with
    // an unreachable catalog ranked on every keystroke just to hold two lines
    // of state. Sits parallel to `prompting`; view and key handler treat the
    // two the same way, suppressing the list/preview/empty state to show just
    // the question and the footer's two keys.
    property var pendingAction: null

    readonly property bool confirming: root.pendingAction !== null

    // shell.qml's four GlobalShortcuts, one per lib/power.js key. A second
    // press while already asking is a no-op -- rebuilding state under an
    // in-progress confirmation risks clearing it.
    function confirmPower(key: string): void {
        const action = Power.actionFor(key);
        if (action === null) {
            console.warn("launcher: no power action named", key, "-- expected one of", Power.keys().join(", "));
            return;
        }

        if (root.confirming)
            return;

        if (root.nestedProvider !== null)
            root.dismiss();
        root.open();

        // Cleared explicitly: open() doesn't reset (only dismissal does), so a
        // keybind pressed over an already-open Launcher would otherwise leave
        // a half-typed Query where the question should show.
        root.setQuery("");
        root.pendingAction = action;
    }

    // Dismisses before running, same reason as runAction(): this surface
    // holds the keyboard until it unmaps, and hyprlock especially must not
    // come up behind a layer surface that still has it.
    function applyConfirm(): void {
        const action = root.pendingAction;
        if (action === null)
            return;

        root.dismiss();
        Quickshell.execDetached(action.argv);
    }

    // Escape while confirming, and the answer to every other way out: the
    // whole session existed to ask, so cancelling ends it rather than leaving
    // an ordinary Launcher open. Nothing runs.
    function cancelConfirm(): void {
        root.dismiss();
    }

    // The one place the Query is set from outside the field itself. Assigns
    // both explicitly: assigning text already in the field fires no
    // onTextChanged, so relying on that signal alone could leave
    // root.queryText stale.
    function setQuery(text: string): void {
        query.text = text;
        root.queryText = text;
    }

    // Everything a session accumulates is cleared here rather than by the
    // window being destroyed. highlightFirst() is called explicitly rather
    // than left to onTextChanged: a Launcher opened, arrowed down and
    // dismissed without typing leaves the Query already empty, so the text
    // never changes and nothing else would move the highlight back.
    function reset(): void {
        root.setQuery("");
        root.highlightFirst();
        root.promptOnly = false;
        root.pendingAction = null;
    }

    onVisibleChanged: {
        if (!root.visible)
            root.reset();
    }

    // Ticket 25: WlrKeyboardFocus.OnDemand alone doesn't survive a compositor
    // focus change (workspace switch, SUPER+h/l) while the Launcher stays
    // open -- confirmed on the host, keystrokes reached the window behind it.
    // Hyprland's own grab protocol holds the keyboard through that; same
    // mechanism QuickSettings.qml/SpecialWorkspaces.qml already use for
    // click-outside. dismiss() on `cleared` keeps `visible` truthful if
    // anything (a click outside, another grab taking over) ever ends the
    // grab -- otherwise the Launcher would sit open and unfocused, the exact
    // bug this ticket exists to fix, just via a different trigger.
    HyprlandFocusGrab {
        windows: [root]
        active: root.visible

        onCleared: root.dismiss()
    }

    // Two Providers claiming the same prefix, or a "?"-list row that's
    // neither prefixed nor enterable, are caught here at load rather than
    // failing silently the first time someone hits them. Component.onCompleted
    // rather than a binding: runs once, after every child in `routable` is
    // constructed.
    Component.onCompleted: {
        Routing.problems(root.routable).forEach(problem => console.warn("launcher:", problem));
        ProvList.problems(root.routable).forEach(problem => console.warn("launcher:", problem));
    }

    // Providers live here, not shell.qml: this window is what ranks and
    // renders the Entries.
    Applications {
        id: apps

        // Drops `entered` the moment the Launcher is dismissed -- a reopen
        // must show the default pool, not the Provider last selected from
        // "?" (see the note on `active` in Applications.qml).
        active: root.visible
    }

    Windows {
        id: windows

        // Same reason as apps' `active` above.
        active: root.visible
    }

    Directories {
        id: directories

        // Closes any open chooser the moment the Launcher is dismissed -- see
        // the note on `active` there.
        active: root.visible
    }

    Files {
        id: files

        // `queryText`: the Query with its prefix stripped, or "" when routed
        // elsewhere -- the catalog binds on this, so every keystroke re-selects.
        active: root.visible
        queryText: root.routed.provider === files ? root.routed.query : ""
    }

    Screenshots {
        id: screenshots

        // Clears any Marks the moment the Launcher is dismissed -- see the
        // note on `active` there, and checkbox 6 on ticket 13.
        active: root.visible
    }

    Clipboard {
        id: clipboard
    }

    Keybindings {
        id: keybindings
    }

    // The four static menus: each is a data file, Menu.qml is the whole
    // behaviour, so adding an entry means editing one of these four.
    SystemMenu {
        id: systemMenu

        // Same reason as apps' `active` above.
        active: root.visible
    }

    MediaMenu {
        id: mediaMenu

        // Same reason as apps' `active` above.
        active: root.visible
    }

    DisplayMenu {
        id: displayMenu

        // Same reason as apps' `active` above.
        active: root.visible
    }

    OtherMenu {
        id: otherMenu

        // Same reason as apps' `active` above.
        active: root.visible
    }

    // Reached by entering from the "?" list, not by prefix or from `pool`.
    Themes {
        id: themes

        active: root.visible
    }

    Backgrounds {
        id: backgrounds

        active: root.visible
    }

    // The ex-dmenu Providers -- reached by entering from the "?" list, see
    // `rankedRoutable`. On Workspaces, `active` also clears a half-typed rename.
    Workspaces {
        id: workspaces

        active: root.visible
    }

    Processes {
        id: processes

        // Same reason as apps' `active` above.
        active: root.visible
    }

    Systemd {
        id: systemd

        active: root.visible
    }

    DevServers {
        id: devServers

        active: root.visible
    }

    Zellij {
        id: zellij

        active: root.visible
    }

    // `routable`, not `pool`: covers every Provider, including the
    // prefix-only ones that are the whole reason someone needs reminding.
    // Filters itself out (`listable: false`).
    ProviderList {
        id: providerList

        providers: root.routable

        onQueryRequested: text => root.setQuery(text)
    }

    // Not in the pool: unranked, see localEntries. Bindings over the Query
    // rather than a catalog, so the Query is handed to them explicitly.
    Calculator {
        id: calc

        // "" when routed to a different Provider or nested elsewhere --
        // Calc.wanted("") is false, so this suppresses the calculator without
        // this file knowing anything about calc's own rules.
        queryText: root.nestedProvider !== null ? "" : (root.routed.provider === null || root.routed.provider === calc ? root.routed.query : "")
    }

    WebSearch {
        id: websearch

        // Same rule as calc's queryText above, and the same reason: routed
        // to a different Provider, this one sees "" and Web.entriesFor
        // produces nothing for it. Nested suppresses it too, same reason as calc.
        queryText: root.nestedProvider !== null ? "" : (root.routed.provider === null || root.routed.provider === websearch ? root.routed.query : "")

        // From localEntries, not rankedEntries: rankedEntries is built from
        // this Provider's own Entries, so binding on it would be a loop.
        // `calculating` covers the moment before a local answer exists, so a
        // still-running qalc doesn't offer a web search out from under it.
        hasLocalAnswer: root.localEntries.length > 0 || calc.calculating
    }

    // Dimmed from the theme background, not a hardcoded black, so a light
    // theme doesn't get a black scrim.
    Rectangle {
        anchors.fill: parent
        color: Theme.scrim
    }

    // Click-outside dismissal: fills the window under the card, so the
    // card's own MouseArea swallows clicks that land on it.
    MouseArea {
        anchors.fill: parent
        onClicked: root.dismiss()
    }

    FocusScope {
        id: content

        anchors.fill: parent
        focus: true

        // On the FocusScope, not the card, because key events propagate up
        // from whatever holds focus, and Escape has to reach here from inside
        // the Query field.
        //
        // Leaving a sub-view is checked before dismissing, and only here: a
        // Provider's own `back` Action is resolved off the highlighted Entry,
        // but a Provider entered while empty (e.g. Themes with no
        // ~/.config/themes) has no Entry to resolve against, so Escape would
        // otherwise fall through and dismiss the whole Launcher instead of
        // just leaving the sub-view. The typeof guard covers a nested
        // Provider with no leave() -- it stays dismissable rather than
        // becoming inescapable.
        Keys.onEscapePressed: {
            if (root.nestedProvider !== null && typeof root.nestedProvider.leave === "function")
                root.nestedProvider.leave();
            else
                root.dismiss();
        }

        Rectangle {
            id: card

            anchors.horizontalCenter: parent.horizontalCenter

            // Not vertically centred: the card grows downward as Entries
            // arrive, and a centred card would slide up the screen every keystroke.
            y: Math.round(parent.height / 6)

            width: Theme.width

            // Grows with the Entries rather than reserving full height, so an
            // empty Query isn't a screen-tall empty box. Bounded by root.listMaxHeight.
            height: body.implicitHeight + Theme.padding * 2

            color: Theme.background
            border.color: Theme.accent
            border.width: 1
            radius: Theme.radius

            // Absorbs clicks so they don't reach the dismissal MouseArea behind it.
            MouseArea {
                anchors.fill: parent
            }

            Column {
                id: body

                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: Theme.padding

                spacing: Theme.padding

                TextInput {
                    id: query

                    width: parent.width

                    color: Theme.foreground
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.queryFontSize
                    selectByMouse: true
                    selectionColor: Theme.highlight
                    selectedTextColor: Theme.foreground

                    // A confirmation has nothing to type into -- the line is
                    // the question -- so it stays focused but read-only rather
                    // than moving focus away, which would leave the key
                    // handler below unreached.
                    readOnly: root.confirming
                    cursorVisible: !root.confirming

                    // Assigned first, so the Entries reflect this keystroke
                    // before the highlight moves.
                    onTextChanged: {
                        root.queryText = query.text;
                        root.highlightFirst();
                    }

                    // Handled here, not on the ListView, since the ListView
                    // must never take focus (every printable key has to keep
                    // reaching this field). Both `list` and the preview split
                    // are single-column, so Up/Down move the highlight by one
                    // Entry in either.
                    Keys.onUpPressed: event => {
                        root.moveHighlight(-1);
                        event.accepted = true;
                    }
                    Keys.onDownPressed: event => {
                        root.moveHighlight(1);
                        event.accepted = true;
                    }

                    // One handler, not Keys.onReturnPressed and friends: a
                    // chord built from the raw event also makes Ctrl+something
                    // reachable, with no dedicated handler to add per chord.
                    //
                    // The event is accepted only when the chord resolved --
                    // that's what keeps printable keys reaching the field
                    // (chordOf returns "" for them) and lets Escape over a
                    // Provider with no `back` propagate up to the FocusScope's
                    // Keys.onEscapePressed instead of being silently swallowed.
                    Keys.onPressed: event => {
                        const chord = Actions.chordOf(event);
                        if (chord === "")
                            return;

                        // While a Provider holds the Query line as a text
                        // A prompt/confirmation answers only to Return/Escape;
                        // every other chord is swallowed here rather than
                        // propagating (a TextInput that lost focus mid-prompt
                        // would leave it untypeable). Checked before prompting
                        // below, and stricter: no chord may reach an Action
                        // while confirming, since there's no list and so no
                        // Entry for it to act on.
                        if (root.confirming) {
                            if (chord === "Return")
                                root.applyConfirm();
                            else if (chord === "Escape")
                                root.cancelConfirm();
                            event.accepted = true;
                            return;
                        }

                        if (root.prompting) {
                            const provider = root.promptingProvider;
                            if (provider !== null && chord === "Return")
                                provider.applyPrompt(query.text);
                            else if (provider !== null && chord === "Escape")
                                provider.cancelPrompt();
                            event.accepted = true;
                            return;
                        }

                        event.accepted = root.runHighlighted(chord);
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter

                        // Provider-agnostic ("Type a name…"), not "Search
                        // applications" -- stays true as the pool grows. A
                        // prompt shows its own placeholder instead.
                        visible: query.text === ""
                        text: root.confirming
                            ? root.pendingAction.question
                            : (root.prompting
                                ? (root.promptingProvider ? root.promptingProvider.promptPlaceholder : "…")
                                : "Type a name…")

                        // A question is the card's own text, not a hint for a
                        // field that can't be typed into -- muted placeholder
                        // grey would read as the latter.
                        color: root.confirming ? Theme.foreground : Theme.muted
                        font.family: Theme.fontFamily
                        font.pixelSize: Theme.queryFontSize
                        textFormat: Text.PlainText
                    }
                }

                Rectangle {
                    width: parent.width
                    height: 1
                    color: Theme.muted
                }

                ListView {
                    id: list

                    width: parent.width

                    // Sized off the count, not contentHeight, which would
                    // feed back into the view's own height.
                    height: Math.min(root.rankedEntries.length * Theme.entryHeight, root.listMaxHeight)
                    visible: !root.previewMode && root.rankedEntries.length > 0 && !root.prompting && !root.confirming

                    // The last step of an open (growing to real height)
                    // happens after open() returns, so this -- not open()
                    // alone -- positions the view against its final geometry.
                    onHeightChanged: root.reassertView()

                    clip: true
                    model: root.rankedEntries
                    reuseItems: true

                    // root.setHighlight is the only thing that moves the
                    // highlight; declared false so this view can't start
                    // eating arrow keys if it ever becomes focusable.
                    keyNavigationEnabled: false

                    delegate: Rectangle {
                        id: entry

                        required property int index
                        required property var modelData

                        // An icon-*theme* name, not a path -- resolving it is
                        // the theme's job. `true` turns a miss into "" instead
                        // of a broken image.
                        readonly property string iconSource: entry.modelData.icon ? Quickshell.iconPath(entry.modelData.icon, true) : ""

                        width: list.width
                        height: Theme.entryHeight
                        radius: Math.round(Theme.radius / 2)
                        // From root.highlightIndex, not list.currentIndex: the
                        // view's own index can be moved by a model
                        // reassignment, and this has to match what Enter acts on.
                        color: entry.index === root.highlightIndex ? Theme.highlight : (pointer.containsMouse ? Theme.hover : "transparent")

                        // Hover paints its own tint rather than moving
                        // currentIndex -- delegates are recreated under the
                        // cursor on every keystroke, so moving it would let a
                        // stationary pointer fight the keyboard.
                        MouseArea {
                            id: pointer

                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor

                            // Acts on what was clicked, not what's highlighted
                            // -- always the primary Action, since a click
                            // carries no modifiers. Same runAction as the
                            // keyboard, so a click can't do anything Return doesn't.
                            onClicked: root.runAction(entry.modelData, Actions.chordFor("primary"))
                        }

                        IconImage {
                            id: icon

                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.leftMargin: Math.round(Theme.padding / 2)

                            // Hidden, not collapsed: an invisible Item still
                            // anchors, so an entry with no icon doesn't pull
                            // the name column out of line with the rest.
                            visible: entry.iconSource !== ""
                            source: entry.iconSource
                            implicitSize: Theme.entryIconSize
                        }

                        // The Column's width comes from its anchors, not its
                        // children, so both Texts can bind to parent.width to elide.
                        Column {
                            anchors.left: icon.right
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.leftMargin: Math.round(Theme.padding / 2)
                            anchors.rightMargin: Math.round(Theme.padding / 2)

                            Text {
                                width: parent.width

                                text: entry.modelData.name
                                color: Theme.foreground
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.entryFontSize
                                elide: Text.ElideRight
                                textFormat: Text.PlainText
                            }

                            // Which application, and which workspace -- the
                            // part that says a window is on a special
                            // workspace rather than the one in front of you.
                            Text {
                                width: parent.width

                                visible: entry.modelData.subtext !== ""
                                text: entry.modelData.subtext
                                color: Theme.muted
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.entrySubFontSize
                                elide: Text.ElideRight
                                textFormat: Text.PlainText
                            }
                        }
                    }
                }

                // The screenshots Provider's own view: a narrow list of names
                // and dates on the left, a single large preview of whichever
                // is highlighted on the right (a grid turned out to pick
                // blind -- filename and timestamp aren't enough to tell two
                // screenshots apart). A sibling to `list`, not an attempt to
                // make `list` two-column-capable: the two are mutually
                // exclusive on `visible`, and every highlight touchpoint
                // (setHighlight, applyHighlight, reassertView) addresses
                // whichever one is showing. Also cheaper: this decodes one
                // image at a time rather than a grid's one-per-visible-cell.
                Item {
                    id: preview

                    width: parent.width

                    // Full available height, not the list's own: unlike
                    // `list`, this split stays the same size regardless of
                    // match count, since a resizing preview pane is
                    // unreadable exactly when narrowing to one Entry matters
                    // most. Only the split's outer height is pinned; the left
                    // column (previewList) still sizes to its own content.
                    height: root.listMaxHeight
                    visible: root.previewMode && root.rankedEntries.length > 0 && !root.prompting && !root.confirming

                    ListView {
                        id: previewList

                        anchors.left: parent.left
                        anchors.top: parent.top
                        width: Theme.previewListWidth

                        // Sized/capped like `list`'s own height, but not the
                        // split's height: the names column should end after
                        // the last name, only the pane beside it needs pinning.
                        height: Math.min(root.rankedEntries.length * Theme.entryHeight, root.listMaxHeight)

                        onHeightChanged: root.reassertView()

                        clip: true

                        // Empty, not `root.rankedEntries`, when not in preview
                        // mode: a delegate can be instantiated for layout even
                        // while invisible, and the preview pane reads
                        // `target.path`, which non-screenshot Entries don't
                        // have -- this previously surfaced as `file://undefined`
                        // on every application/window Entry.
                        model: root.previewMode ? root.rankedEntries : []
                        reuseItems: true

                        // Same reasoning as `list`: the Query field owns the
                        // keyboard, this view must never become focusable.
                        keyNavigationEnabled: false

                        delegate: Rectangle {
                            id: row

                            required property int index
                            required property var modelData

                            readonly property bool marked: row.modelData.target.marked === true

                            width: previewList.width
                            height: Theme.entryHeight
                            radius: Math.round(Theme.radius / 2)

                            color: row.index === root.highlightIndex ? Theme.highlight : (pointer.containsMouse ? Theme.hover : "transparent")

                            // Marked Entries carry their own border regardless
                            // of highlight, so a mark stays visible as the
                            // highlight arrows past it.
                            border.width: row.marked ? 2 : 0
                            border.color: Theme.markedBorder

                            MouseArea {
                                id: pointer

                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor

                                onClicked: root.runAction(row.modelData, Actions.chordFor("primary"))
                            }

                            Column {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.leftMargin: Math.round(Theme.padding / 2)
                                anchors.rightMargin: Math.round(Theme.padding / 2)

                                Text {
                                    width: parent.width

                                    text: row.modelData.name
                                    color: Theme.foreground
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.entryFontSize
                                    elide: Text.ElideRight
                                    textFormat: Text.PlainText
                                }

                                Text {
                                    width: parent.width

                                    text: row.modelData.subtext
                                    color: Theme.muted
                                    font.family: Theme.fontFamily
                                    font.pixelSize: Theme.entrySubFontSize
                                    elide: Text.ElideRight
                                    textFormat: Text.PlainText
                                }
                            }
                        }
                    }

                    Rectangle {
                        id: previewPane

                        anchors.left: previewList.right
                        anchors.leftMargin: Theme.padding
                        anchors.right: parent.right
                        anchors.top: parent.top

                        // The split's height, not the list's, so the image
                        // keeps its size as the Query narrows -- see `preview`.
                        height: preview.height

                        color: Theme.hover
                        radius: Theme.radius

                        // `target.preview` first, then `target.path`:
                        // screenshots/backgrounds *are* the image they
                        // preview, while a theme is a directory whose preview
                        // is a separate image beside it. Falls through to ""
                        // (the "No selection" text) when neither is set.
                        //
                        // Percent-encoded: an unencoded path silently
                        // mishandles a filename with a space or non-ASCII
                        // character. "" for nothing highlighted, which Image
                        // treats as no source rather than an error.
                        readonly property string previewFile: root.highlightedEntry
                            ? (root.highlightedEntry.target.preview || root.highlightedEntry.target.path || "") : ""
                        readonly property string previewSource: root.previewMode && previewPane.previewFile !== ""
                            ? "file://" + encodeURI(previewPane.previewFile) : ""

                        Image {
                            anchors.fill: parent
                            anchors.margins: Theme.padding

                            fillMode: Image.PreserveAspectFit
                            visible: previewPane.previewSource !== ""

                            // `asynchronous` keeps decoding off the keystroke
                            // thread; `sourceSize` keeps a 4K screenshot from
                            // decoding at full resolution just to show at
                            // Theme.previewImageSize.
                            asynchronous: true
                            sourceSize.width: Theme.previewImageSize
                            sourceSize.height: Theme.previewImageSize

                            source: previewPane.previewSource
                        }

                        Text {
                            anchors.centerIn: parent

                            visible: previewPane.previewSource === ""
                            text: "No selection"
                            color: Theme.muted
                            font.family: Theme.fontFamily
                            font.pixelSize: Theme.entryFontSize
                            textFormat: Text.PlainText
                        }
                    }
                }

                // Two different empty states on purpose: a Provider not ready
                // hasn't populated yet (a fault, or at least a wait), while an
                // empty result set over a ready pool is just a Query matching
                // nothing. Named per Provider rather than hardcoded, since
                // only the Provider knows which case it is.
                Text {
                    width: parent.width

                    // Suppressed while a prompt owns the line: an empty
                    // prompt isn't "No matches".
                    visible: root.rankedEntries.length === 0 && !root.prompting && !root.confirming
                    text: root.pending.length === 0 ? "No matches" : `Waiting for ${root.pending.join(" and ")}…`
                    color: Theme.muted
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.entryFontSize
                    textFormat: Text.PlainText
                }

                // What the keys do, in the highlighted Entry's own Provider's
                // words -- bound to the highlighted Entry, not the pool, so
                // arrowing from a window to an application changes "switch
                // to" into "launch" while the key stays Return.
                Row {
                    id: footer

                    spacing: Theme.padding

                    // Nothing highlighted is nothing to act on.
                    visible: root.highlightActions.length > 0

                    Repeater {
                        model: root.highlightActions

                        delegate: Row {
                            id: hint

                            required property var modelData

                            spacing: Math.round(Theme.padding / 3)

                            // The key, louder than what it does -- read to
                            // find a key, not a sentence.
                            Text {
                                text: Actions.hintOf(hint.modelData.chord)
                                color: Theme.accent
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.hintFontSize
                                textFormat: Text.PlainText
                            }

                            Text {
                                text: hint.modelData.label
                                color: Theme.muted
                                font.family: Theme.fontFamily
                                font.pixelSize: Theme.hintFontSize
                                textFormat: Text.PlainText
                            }
                        }
                    }
                }
            }
        }
    }
}
