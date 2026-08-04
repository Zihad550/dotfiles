import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Widgets
import qs
import "../lib/matching.js" as Matching
import "../lib/highlight.js" as Highlight
import "../lib/actions.js" as Actions
import "../lib/routing.js" as Routing
import "../lib/providerlist.js" as ProvList

// The Launcher window: a full-screen overlay with the Launcher card centred
// horizontally in it -- the Query line, the ranked Entries, and the keyboard
// routing over them.
//
// Deliberately *not* a LazyLoader, which is how Osd and NotificationPopup do
// it. Those want no window at all while idle. This one is the opposite case --
// the whole reason the Launcher is an always-running instance is that the
// window already exists when the keybind fires, so opening costs nothing
// beyond mapping the surface. `visible` toggles; nothing is created or
// destroyed on open. The price is that state persists across opens unless
// something clears it, which is what reset() below is for.
//
// Full-screen rather than a small centred window, because a click outside the
// card can only be seen if there is a surface under it to receive the click.
// That covers one output: `screen` is left unset, as NotificationPopup and Osd
// do, so the compositor picks. Unlike those, this window is not recreated per
// show, so whether the compositor re-picks the active monitor on each map or
// pins the output at startup is an open question -- see the multi-monitor step
// in .scratch/launcher/issues/03.
PanelWindow {
    id: root

    // Every anchor set, so the surface covers the output.
    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    // Reserve nothing. `exclusiveZone: 0` would be enough today, but with all
    // four anchors set the automatic computation is the thing that surprises
    // you, so refuse it outright instead.
    exclusionMode: ExclusionMode.Ignore

    color: "transparent"
    visible: false

    // Above everything, including fullscreen windows -- verifiable with
    // `hyprctl layers`, where `namespace` is what identifies this surface.
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "launcher"

    // On-demand, never Exclusive. Exclusive takes the keyboard from every
    // other surface, so a Launcher stuck open would leave nowhere to type --
    // including nowhere to type the command that kills it. On-demand still
    // takes focus the moment the surface maps, which is what makes typing work
    // without clicking first.
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    // The Providers, in the order that breaks ties between them.
    //
    // Windows first, and that is a decision rather than an accident. A running
    // window and the application that would launch a second copy of it score
    // identically for the name they share -- see textsFor in lib/windows.js --
    // so this order is what makes typing "firefox" offer the window you have.
    //
    // **Frecency outranks it**, and that is worth stating because it reverses the
    // above for one case. Pool order breaks a *tie*; usage is a real score
    // difference, and windows supply no Entry Key, so an application chosen often
    // enough comes out above the running window of itself. The spec's remedy if
    // that proves annoying in use is per-Provider score weighting, which it
    // deliberately leaves out of scope for now. Pinned by a test in
    // tests/launcher/matching.test.js rather than left to be rediscovered.
    //
    // Ticket 16's five sat here briefly and do not any more -- they are behind
    // the "?" list, with themes and backgrounds. They were placed carefully
    // (workspaces after windows, the ex-dmenu four after applications, so a
    // Query naming a running thing broke its tie towards focus and launch
    // before it ever reached `kill -9`) and careful placement turned out to be
    // the wrong answer to the wrong question. The right one is that none of
    // the five is something a person types blind: they are the things that
    // used to be a *menu you chose first* and a list you searched second, and
    // an ex-dmenu Provider ranked against every keystroke puts a row whose
    // Return is `kill -9` or a system-unit restart one tie away from a
    // Query that meant an application. Ordering can only make that unlikely;
    // being entered makes it impossible. See `rankedRoutable`.
    //
    // The four static menus come last, and that too is a decision. They are the
    // only Providers here whose Entries are hand-written, so their names were
    // chosen to be typed -- "Lock", "Restart" -- and a menu Entry tying with an
    // application or a window for a query is a query that named the menu Entry.
    // Losing that tie costs nothing; winning it would put "Restart" above a
    // running window called the same thing.
    //
    // Themes and backgrounds -- ticket 15 -- were here briefly and are not
    // any more: ticket 18 moved them behind the "?" provider list, which is
    // what let them have a preview at all. See the header on Themes.qml.
    readonly property var pool: [windows, apps, systemMenu, mediaMenu, displayMenu, otherMenu]

    // Ranked Providers reachable only through their own prefix, never in the
    // default pool -- directories, added by ticket 12, files, added by
    // ticket 17, screenshots, added by ticket 13, and clipboard, added by
    // ticket 14. Unlike calc and websearch all four have a real `catalog`
    // and are genuinely scored; directories is kept out of `pool` because
    // walker's own config already excluded "menus:dotfilesDirs" from the
    // providers queried by default (walker/.config/walker/config.toml:26,
    // deleted with ticket 19),
    // and doing otherwise would score ~17,000 paths on every keystroke of
    // every other Query. Files is kept out for the same reason walker
    // excluded "menus:dotfilesFiles" from its defaults too -- and its
    // catalog, though query-dependent and self-ordered, is still a real
    // catalog. Screenshots is kept out for a different reason -- see
    // `previewMode` below. Clipboard is kept out for the same reason
    // directories is: scoring the whole history against every keystroke of
    // every other Query would cost time no unrelated Query should pay, and
    // walker's own config reached clipboard only through its "$" prefix too.
    // The mechanism is the same for all four: `activePool` is what keeps any
    // of them out until its own prefix, or nesting into a chooser, routes to
    // it.
    //
    // Themes and backgrounds (ticket 15, placed by ticket 18) are here with no
    // prefix of their own, which the two lines above say cannot happen -- and
    // that is the point: `nestedProvider` reads this list, so a Provider
    // reached only by being entered has to be in it. The provider list itself
    // is here for the ordinary reason, its "?" prefix.
    //
    // Ticket 16's five join them on the same mechanism, and for a reason of
    // their own: what they list is not what a Query is usually about.
    // Processes and systemd are the sharp case -- `kill -9` and a
    // system-unit restart are the Returns, and a row that can be reached by
    // typing something else is a row that can be pressed by meaning something
    // else -- but dev servers, zellij and workspaces are here on the milder
    // half of the same argument: each was a menu you *chose* before you
    // searched it, nobody types a session name to be offered a session, and
    // ranking them against every keystroke only adds rows to Queries that
    // meant an application. Entered from "?", each owns the whole pool, which
    // is the list the scripts used to show. They keep their `refresh()` on
    // every open regardless -- this list is what `open()` walks.
    readonly property var rankedRoutable: root.pool.concat([directories, files, screenshots, clipboard, themes, backgrounds, workspaces, processes, systemd, devServers, zellij, providerList])

    // Which Providers are still coming up. An empty pool with one of these
    // pending is a different fault from an empty pool with none.
    //
    // `root.activePool`, not `root.pool` -- a Query routed to one Provider
    // that merely has not populated yet should say so about *that* Provider,
    // not about every other one the Query was routed away from. `activePool`
    // is declared further down, but the binding below does not care: QML
    // resolves properties by dependency, not by where they sit in the file.
    readonly property var pending: root.activePool.filter(provider => !provider.ready).map(provider => provider.label)

    // Every Provider prefix routing can name -- the ranked, prefix-only
    // Providers plus the two that generate their own Entries, calc and
    // websearch. Not `pool` itself: none of those three can be reached by an
    // unrouted Query (see `localEntries` and `rankedRoutable` above), and a
    // Provider reachable only by prefix would be unreachable at all if this
    // list left it out.
    //
    // A plain concatenation of fixed object identities, evaluated the first
    // time anything reads it -- which route() below does on every keystroke.
    // No side effect lives here on purpose: Routing.problems() is checked
    // separately, from Component.onCompleted, so "caught at load" means
    // exactly that rather than "caught whenever some binding's first
    // evaluation happens to touch this property first" -- calc's own
    // `queryText` binding is one such reader, during calc's own construction.
    readonly property var routable: root.rankedRoutable.concat([calc, websearch])

    // Which Provider, if any, the current Query names, and the Query with that
    // Provider's prefix already stripped off -- CONTEXT.md's own definition of
    // "Query". Recomputed from `root.queryText` on every keystroke, and kept
    // deliberately stateless: nothing here remembers the keystroke before, so a
    // backspace that deletes the prefix character is simply a Query that no
    // longer matches one, and every Provider below sees the default pool
    // return on its own. That is checkbox 4, closed by not having state to
    // clear rather than by a rule that clears it.
    readonly property var routed: Routing.route(root.routable, root.queryText)

    // The Provider currently showing a sub-view of its own, or null -- ticket
    // 12's directories Provider is the first to have one. Checked ahead of
    // routing in `activePool` below: while a Provider is nested it owns the
    // whole pool regardless of what the Query says, the same way a routed
    // prefix does, except that this is Launcher state rather than something
    // read off the Query text -- typing "/" while the chooser is open must
    // not un-nest it.
    //
    // `filter(...)[0]`, not `.find()`, to match the array methods already
    // proven elsewhere in this file; nothing here needed `.find()` before.
    readonly property var nestedProvider: root.rankedRoutable.filter(provider => provider.nested === true)[0] || null

    // The ranked pool narrowed to what prefix routing -- or nesting -- allows:
    // one Provider alone when either names one, everything otherwise.
    // `indexOf` against `rankedRoutable` rather than trusting `routed.provider`
    // blindly is what makes routing to calc or websearch collapse this to
    // `[]` instead of silently ranking the whole pool against a Query meant
    // for a Provider that is not scored at all.
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
    // so this is only ever true while a prefix or a sub-view has routed the
    // whole pool to one Provider. Ticket 13 predicted that "a second Provider
    // wanting this layout would only need to set `layout: "preview"` and stay
    // out of `pool` the same way"; ticket 18 is that, twice over -- themes and
    // backgrounds, entered from the "?" list rather than prefixed, and needing
    // no change here to get the split.
    readonly property bool previewMode: root.activePool.length === 1 && root.activePool[0].layout === "preview"

    // The Query as it stood just before entering a nested sub-view, restored
    // on the way back out.
    //
    // Entering has to clear root.queryText: a chooser's few Entries are
    // unranked and would otherwise still be filtered by whatever was typed to
    // find the directory that opened it, which is almost never any of their
    // names. Leaving without restoring this would land on the *unrouted*
    // default pool instead of the directory list "back" is supposed to
    // return to, because the Query that had named it is already gone.
    property string savedQuery: ""

    // **Restoring is conditional on `root.visible`, and that condition is load
    // bearing.** Dismissing the Launcher while a chooser is open un-nests it
    // too -- Directories.active goes false, which clears its own openFor,
    // which is what this binding is watching -- so the same `root.visible =
    // false` that closes the Launcher also fires this handler's "leaving"
    // branch. Without the guard it would restore the pre-chooser Query right
    // as reset() (from onVisibleChanged, below) is clearing it to "" -- two
    // reactions to one assignment, in an order neither this file nor QML
    // promises. The guard removes the race rather than winning it: by the
    // time either handler runs, root.visible already reads false, so
    // restoring is skipped and reset()'s "" is the only answer left standing,
    // regardless of which handler happens to run first.
    onNestedProviderChanged: {
        if (root.nestedProvider !== null) {
            root.savedQuery = root.queryText;
            root.reset();
        } else if (root.visible) {
            root.setQuery(root.savedQuery);
            root.highlightFirst();
        }
    }

    // The Provider currently holding the Query line as a text prompt --
    // ticket 16's workspace rename -- or null.
    //
    // The same shape as `nestedProvider`, one slot over: the Provider owns
    // the flag (`prompting`, on Workspaces.qml), the Launcher reads it. While
    // set, the Query line is a prompt rather than a search line: the list and
    // the empty state are suppressed (see the views below), the placeholder
    // says what the prompt is for, and the Query field's key handler routes
    // Return and Escape to the Provider instead of to the ranked Entries.
    readonly property var promptingProvider: root.rankedRoutable.filter(provider => provider.prompting === true)[0] || null

    // True exactly when a Provider claims the prompt -- same source as
    // promptingProvider, so the two cannot disagree.
    readonly property bool prompting: root.promptingProvider !== null

    // The Query as it stood just before a prompt began, restored on the way
    // out -- the same reason and the same guard as `savedQuery` for nesting.
    // A prompt that kept whatever it prefilled would leave the Launcher
    // searching for the workspace's own name instead of the Query that found
    // the workspace.
    //
    // Separate from `savedQuery` even though the two cannot be in flight at
    // once (a prompt can only begin from a row, and rows are unreachable
    // while a Provider is nested): sharing one slot between two mechanisms
    // is a coupling a later Provider change would have to remember.
    property string savedPromptQuery: ""

    // Entering hands the Query line to the Provider, prefilled with its
    // promptValue; leaving -- cancel, apply, or dismissal -- hands it back.
    //
    // **Restoring is conditional on `root.visible`, exactly like the nesting
    // handler's own restore.** Dismissing the Launcher mid-prompt cancels it
    // (Workspaces.qml's own `active` binding clears `prompting`), and that
    // fires this handler's "leaving" branch at the same time as reset() --
    // with the guard, only reset()'s "" is left standing, whichever handler
    // happens to run first. The same race the nesting handler documents,
    // removed the same way.
    onPromptingChanged: {
        if (root.prompting) {
            root.savedPromptQuery = root.queryText;
            root.setQuery(root.promptingProvider.promptValue);
        } else if (root.visible) {
            root.setQuery(root.savedPromptQuery);
            root.highlightFirst();
        }
    }

    // The Query, held here rather than read off the TextInput.
    //
    // Ranking is model logic and now depends on no QML Item at all. It used to
    // read `query.text` directly, which made the whole ranking a dependency of
    // a TextInput that lives inside a window starting `visible: false` -- so
    // "was the Item realised yet" became a question the ranking could get wrong,
    // and a first evaluation that threw would leave the binding in error with
    // nothing but a catalog change to rescue it. A plain string with a sound
    // default cannot be in that state: before anything types, the Query is "",
    // which is exactly what an untouched Launcher should rank against.
    //
    // The field drives this (onTextChanged below); nothing reads back the other
    // way except reset(), which clears both.
    property string queryText: ""

    // The Entries for the current Query, best first, across every Provider.
    //
    // Each catalog is read exactly once so the indices rank() returns are
    // guaranteed to index the same entry list the corpus was prepared from.
    // Re-evaluates on every keystroke, when DesktopEntries finishes populating,
    // and when a window opens, closes or retitles -- which is the whole point
    // of the catalogs being bindings.
    //
    // Three steps, and only the middle one is per-Provider policy: rank the
    // Provider's own corpus, collapse its texts back to Entries for a Provider
    // whose Entries have more than one, then merge the rankings on score. This
    // is sound because there is one scorer and one scale.
    //
    // rank() is capped at its own limit, merge() at its own, and the ListView
    // builds only what fits on screen, so neither a full corpus nor a full
    // match set is ever realised as Items.
    //
    // The Frecency map goes to every Provider, and reaches only the ones whose
    // Entries carry an Entry Key -- rank() looks a key up and skips an Entry that
    // has none, so a Provider opting out needs no special case here. This is also
    // what makes the *empty* Query useful: everything scores 0 there, so usage is
    // the whole ordering.
    //
    // `root.activePool`, not `root.pool`, and `root.routed.query`, not
    // `root.queryText` -- prefix routing's whole effect on ranking. Unrouted,
    // `activePool` is `pool` and `routed.query` is `queryText` untouched, so
    // this is exactly what it was before ticket 11.
    //
    // **An `ordered` catalog is not ranked at all** -- ticket 17's files
    // Provider is the first to carry one. Its Entries are produced in the
    // order they must display (each matched folder immediately followed by
    // its own contents), which is a structural claim score() cannot express:
    // ranking every Entry independently would pull a child that matches the
    // Query well out from under its parent. So rank() is skipped and the
    // result hands every Entry an equal score, which is what makes merge()
    // keep them in encounter order -- the catalog's own order. Only sound
    // because such a catalog never merges with another Provider: files is
    // prefix-only, so `activePool` is `[files]` whenever it is ranked at all.
    // Scores of 0 are therefore never compared against a scored Provider's.
    // Only the files *listing* is ordered -- its chooser carries an ordinary
    // corpus and comes through the branch below. See the header on
    // lib/files.js for the argument, and `catalog` in Files.qml.
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

    // Everything the machine itself answered: the calculator, then the ranked
    // pool.
    //
    // The calculator is not in `pool` and is not scored, and neither is the web
    // search below. Both generate their Entry *from* the Query, so there is
    // nothing to match them against -- a corpus holding the Query would hold a
    // copy of the needle, and score() gives a haystack equal to its needle both
    // the highest quality there is and the smallest length penalty there is. It
    // would rank first for everything typed. That is not a scoring bug to tune
    // around; it is what says these Providers do not belong on the scale.
    //
    // Placing them by hand instead is what elephant's scores amount to in a flat
    // pool, and it leaves "one scorer, one scale" intact: nothing here produces
    // a score, so nothing here has to be comparable to a score. Two of them do
    // not justify a general mechanism -- when a third arrives, this is where it
    // goes.
    //
    // **The calculator goes first, above the ranked pool**, which is elephant's
    // placement rather than a preference: it scored a result at `max_items + 1`
    // (providers/calc/setup.go:234 -- that checkout is deleted with ticket
    // 19), one above the cap on everything else, so a
    // result outranks every fuzzy match. The alternative -- appending it, as the
    // web search is appended -- reads fine until an expression happens to
    // fuzzy-match an application, and then Return launches the application
    // instead of copying the answer. `10 cm to inch` is not a contrived Query.
    //
    // It is narrow enough to sit there: lib/calc.js produces an Entry only for a
    // Query of at least three characters carrying a digit, *and* only once qalc
    // has returned something that is neither an error nor the Query handed back.
    readonly property var localEntries: calc.entries.concat(root.scoredEntries)

    // The Entries for the current Query, best first, with the Provider of last
    // resort on the end.
    //
    // Which means the "No matches" empty state below is now unreachable for any
    // non-empty Query: a Query nothing local answers becomes a web search rather
    // than a blank card. That is the ticket's own sentence -- "a Query that has
    // no local answer sent out to the browser" -- and it is what walker did too
    // (always_show_default). The empty state still says what it always said for
    // the case that remains: an empty Query against a pool that has not
    // populated.
    readonly property var rankedEntries: root.localEntries.concat(websearch.entries)

    // Not highlightFirst(). The Entries now change without the Query changing
    // -- a window opening, closing, or merely retitling itself in the
    // background re-ranks the pool -- and resetting the highlight there would
    // take it away from the user mid-arrow because some other window's tab
    // finished loading. Moving back to the best match is the Query's business,
    // and hangs off the Query field below.
    onRankedEntriesChanged: root.keepHighlight()

    // How tall the Entry list is allowed to get. Theme.maxHeight is the taste
    // limit; the rest of this is the output. The card starts a sixth of the way
    // down, so on a 1366x768 screen there are only ~600px left below it and a
    // 560px list plus the Query line and padding would run the card off the
    // bottom edge.
    //
    // No binding loop, and this is the whole proof: everything read below is
    // either the output's own geometry or an Item whose size the list cannot
    // influence -- the card's `y` (from the window height), the Query field's
    // height (from its font), and the footer's height and visibility (from its
    // font and from which Entry is highlighted). The card's *height* is what
    // depends on the list, and nothing here reads it.
    readonly property int listMaxHeight: {
        // The card's own padding top and bottom, the two Column gaps around
        // the rule, the rule, and the Query line.
        //
        // Plus the footer and its own gap when it is showing. An invisible
        // child takes no room in a Column but still has a height, so this asks
        // whether it is visible rather than adding it unconditionally -- and
        // omitting it entirely is what would run the card off the bottom of the
        // 1366x768 output this whole calculation exists for.
        const chrome = Theme.padding * 4 + 1 + query.height + (footer.visible ? footer.height + Theme.padding : 0);
        const available = root.height - card.y - Theme.padding - chrome;

        // One Entry regardless, so a pathologically short output shows
        // something rather than a zero-height list.
        return Math.max(Theme.entryHeight, Math.min(Theme.maxHeight, available));
    }

    // Which Entry is highlighted, held here rather than read back off the
    // ListView. The view is not a reliable place to keep it: `model` is handed
    // a brand-new array on every re-rank -- which now happens on its own, when
    // a window in the background retitles -- and a view given a new model may
    // move currentIndex itself. So this is the intent, and the view follows it.
    property int highlightIndex: -1

    // The highlighted Entry itself, so it can be found again by identity after
    // the Entries change under it rather than only by position.
    property var highlightedEntry: null

    // The one place the highlight moves. Everything below goes through it, so
    // the view cannot end up showing one Entry while Enter acts on another.
    function setHighlight(index: int): void {
        root.highlightIndex = index;
        root.highlightedEntry = index >= 0 ? root.rankedEntries[index] : null;

        // Both views are kept in sync regardless of which is showing --
        // assigning currentIndex on the hidden one is cheap, and it is what
        // keeps `previewMode` flipping mid-session (routing into and out of
        // "#") from ever showing a view whose currentIndex is stale from
        // before it last became visible.
        list.currentIndex = index;
        previewList.currentIndex = index;

        // Re-asserted after the event loop turn, for two reasons that both bite
        // here: the view's model binding has not caught up yet, so
        // positioning now would scroll the *previous* content, and assigning
        // that model can move currentIndex out from under this. Qt.callLater
        // collapses repeats of the same function, so a burst of these costs one
        // pass. It reads highlightIndex rather than a captured argument, so
        // whichever call was last is the one that wins.
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

    // Puts the view back where the highlight says it should be, after the
    // surface has mapped and the list has its real height.
    //
    // Belt and braces around the geometry, not a fix for anything observed:
    // the surface maps, and the height that produces reaches the list after
    // open() has already returned, so the position is asserted against the
    // geometry the view ended up with rather than the one it started from.
    // Qt.callLater collapses repeats, so asserting more than once costs one
    // pass. The defect this was first written for turned out to be
    // highlightPinned below; this stayed because it is cheap and the two-step
    // geometry is real.
    function reassertView(): void {
        if (!root.visible)
            return;
        Qt.callLater(root.applyHighlight);
    }

    // Whether the highlight is where the *user* put it, or merely where it
    // defaulted to.
    //
    // This distinction is the whole of the "first open lists no windows"
    // defect, and it is not a detail. keepHighlight below keeps the highlighted
    // Entry by identity when the list changes underneath -- which is right when
    // someone has arrowed down to something, and wrong before anyone has
    // touched anything. At startup the applications land first, the highlight
    // defaults to the first of them, and then six windows arrive *above* it.
    // Identity did exactly what it was told: it followed that application from
    // index 0 to index 6, and the view followed the highlight, leaving the six
    // window rows above the top edge.
    //
    // The log said so outright once it printed the view's own position:
    // `top: timer -s course 1h | … (contentY 264, currentIndex 6)` -- six rows
    // of 44px scrolled off, highlight on the seventh. The list was never
    // missing the windows and the view was never stale; both were faithfully
    // rendering a highlight that had walked.
    //
    // So: identity is honoured only for a highlight the user placed. Otherwise
    // a re-rank goes back to the best match, which is what an untouched
    // Launcher should always be showing.
    property bool highlightPinned: false

    // Puts the highlight back on the best match. Both directions need this:
    // narrowing from ten Entries to two would otherwise leave the highlight
    // past the end and Enter doing nothing, and *widening* -- backspacing after
    // arrowing down -- would leave it scrolled off the top of the view.
    //
    // Also the place the pin is released: typing is a new intent, and the best
    // match for the new Query outranks wherever the arrows had got to.
    function highlightFirst(): void {
        root.highlightPinned = false;
        root.setHighlight(Highlight.first(root.rankedEntries));
    }

    // Where the highlight goes when the Entries change under it without the
    // Query changing -- a window opening, closing or merely retitling itself.
    //
    // The rule itself lives in lib/highlight.js, under test, because it is a
    // rule about intent rather than about drawing and a wrong answer reads as a
    // preference: it kept the highlight on an Entry nobody had chosen for three
    // host rounds while the windows sat scrolled off the top of the view.
    function keepHighlight(): void {
        root.setHighlight(Highlight.next(root.rankedEntries, {
            pinned: root.highlightPinned,
            index: root.highlightIndex,
            entry: root.highlightedEntry
        }));
    }

    // Wraps, so the far end of a list is one keypress away rather than a held
    // key.
    //
    // The one thing that pins the highlight: an arrow key is the user saying
    // where it goes, and from here until the Query changes a re-rank has to
    // keep it there rather than move it back to the best match.
    function moveHighlight(delta: int): void {
        const count = root.rankedEntries.length;
        if (count === 0)
            return;
        root.highlightPinned = true;
        root.setHighlight((root.highlightIndex + delta + count) % count);
    }

    // Which Actions the highlighted Entry's Provider offers, for the footer.
    // Empty with nothing highlighted, which is also what hides it.
    //
    // While a prompt owns the Query line there is no highlighted Entry to
    // describe -- the list is suppressed -- and the keys that mean something
    // are the prompt's own, so the footer names those instead. The prompt's
    // confirm verb comes from the Provider that owns the prompt; "cancel" is
    // what Escape means in any prompt.
    readonly property var promptActions: root.promptingProvider ? [
        { chord: "Return", label: root.promptingProvider.promptVerb || "confirm" },
        { chord: "Escape", label: "cancel" }
    ] : []

    readonly property var highlightActions: root.prompting
        ? root.promptActions
        : (root.highlightedEntry ? Actions.available(root.highlightedEntry.provider) : [])

    // root.highlightedEntry, not rankedEntries[highlightIndex]: the footer
    // reads that property too, and the delegate paints from the index it came
    // from, so one accessor is what makes "the keys do what the footer says"
    // structural rather than a thing two expressions have to keep agreeing on.
    // Same reasoning as setHighlight being the only thing that moves the
    // highlight.
    function runHighlighted(chord: string): bool {
        return root.runAction(root.highlightedEntry, chord);
    }

    // The one place an Action is dispatched, so the keyboard and the pointer
    // cannot drift apart on what activating means -- they arrive here with the
    // same chord, and the pointer gets it by asking for the primary *slot*
    // rather than by naming a key.
    //
    // The Entry carries its own Provider, so this stays one function no matter
    // how many Providers the pool grows; the Provider decides what the chord
    // means to its own Entries.
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

        // Dismissed before the Action runs, and only for an Action that asked
        // to close: this surface holds keyboard focus until it unmaps, and the
        // window being launched or focused should receive that focus rather
        // than race the overlay for it.
        //
        // The order matters more for the windows Provider than for
        // applications, and it is the reason there is no delay here. Both the
        // layer surface going away and the activate request travel the same
        // Wayland connection, in the order they are issued, so the compositor
        // refocuses whatever was focused before and *then* honours the
        // activate. Elephant, which was a separate process with its own
        // connection and no such ordering, slept first instead -- a
        // configurable delay, 100ms by default
        // (resources/elephant/internal/providers/windows/setup.go:117 -- that
        // checkout is deleted with ticket 19). If
        // focus ever lands on the previously focused window instead of the
        // chosen one, that assumption is what broke and a delay here is the
        // remedy.
        if (Actions.wantsClose(action))
            root.dismiss();

        action.invoke(entry);

        // Recorded *after* the Action, and from `entry` rather than from
        // root.highlightedEntry. Both halves matter.
        //
        // After, because recording reassigns the Frecency store, which
        // re-evaluates `usage`, which re-ranks every Provider's corpus
        // synchronously. Between dismiss() and invoke() that work would sit
        // directly in front of the launch -- free at ~84 applications, but the
        // directories Provider was measured at 46-61ms per pass, which is a
        // visible stall on every Return. Nothing about attribution needs it to
        // happen first.
        //
        // From `entry`, because dismiss() above has already fired reset(), which
        // moves the highlight back to the best match -- so root.highlightedEntry
        // now names a *different* Entry and reading it here would credit the
        // wrong key. `entry` is the one that was chosen.
        //
        // Actions.counts is what excludes `back`: going back is a move within the
        // Launcher rather than a choice of an Entry.
        if (Actions.counts(action))
            Frecency.record(entry.key);

        // An Action that changed what the list should say. Guarded the same way
        // open() guards it, because refresh is optional on the Provider
        // interface -- an Action asking for one from a Provider that has none
        // leaves the Launcher open on the Entries it had, which is the honest
        // outcome rather than an error.
        if (Actions.wantsRefresh(action) && typeof entry.provider.refresh === "function")
            entry.provider.refresh();

        return true;
    }

    function open(): void {
        if (root.visible)
            return;
        root.visible = true;
        // The window takes focus as it maps; this decides which QML Item
        // inside it holds that focus -- the Query field, so typing works with
        // no click first.
        query.forceActiveFocus();

        // Every Provider that can be asked for fresher data gets asked, because
        // an open is exactly when being out of date shows. Optional on the
        // Provider interface: applications has no such call -- DesktopEntries
        // is a one-shot population -- and windows re-queries the compositor.
        //
        // `rankedRoutable`, not `pool`: directories is prefix-only and still
        // wants this. Its own refresh() is cheap to call even when there is
        // nothing to do -- see the note there -- so asking on every open costs
        // a `test` and a `stat`, not a scan.
        root.rankedRoutable.forEach(provider => {
            if (typeof provider.refresh === "function")
                provider.refresh();
        });

        // Frecency decays with wall-clock time, and this process can run for
        // weeks without restarting, so something has to move its clock forward.
        // An open is the moment a stale decay would be visible and the last one
        // before the Entries are ranked.
        Frecency.refresh();

        // The view spent the time since the last open unmapped and a single
        // Entry tall; nothing has told it where to be since. See reassertView.
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

    // The dedicated clipboard keybind's own entry point -- ticket 14's
    // checkbox 3, "the existing dedicated keybind opens the Launcher directly
    // on this Provider". Opens (or leaves open, if already open) and sets the
    // Query to a prefix rather than to any single Provider's own name, so
    // routing itself -- not a special case here -- is what narrows to it;
    // a second dedicated keybind, for a different Provider, would only need
    // its own prefix passed in.
    //
    // **A nested Provider outranks routing in `activePool`** (see
    // `nestedProvider` above), which a prefix alone cannot undo -- setting
    // the Query to "$" while directories' own chooser is open would leave
    // `activePool` still locked to that chooser, silently missing this
    // function's whole promise. Rather than reaching into whichever
    // Provider is nested to clear state this file has no business touching
    // directly, dismiss-then-reopen is what already closes it: `dismiss()`
    // sets `visible` false, which is what Directories.qml's own `active`
    // binding is watching to clear `openFor` (see the note there). Skipped
    // when nothing is nested, which is the overwhelming case, so a plain
    // press of the keybind does not flicker the window shut and open again
    // for no reason.
    function openOn(prefix: string): void {
        if (root.nestedProvider !== null)
            root.dismiss();
        root.open();
        root.setQuery(prefix);
        root.highlightFirst();
    }

    // The one place the Query is set from outside the field itself, so reset()
    // and the nesting boundary below cannot drift apart on what "setting the
    // Query" means -- both the field and root.queryText, always together.
    //
    // Not only through the field: assigning text that is already there fires
    // no onTextChanged, so this is what guarantees the two agree rather than
    // leaving it to a signal that may not come.
    function setQuery(text: string): void {
        query.text = text;
        root.queryText = text;
    }

    // Everything a session accumulates is cleared here rather than by the
    // window being destroyed. The Marks join this in a later ticket, and
    // "Marks disappear when the Launcher closes" will be this function.
    //
    // highlightFirst() is called explicitly rather than left to the Query's
    // onTextChanged: a Launcher opened, arrowed down and dismissed without
    // typing leaves the Query already empty, so the text never changes and
    // nothing else would move the highlight back.
    function reset(): void {
        root.setQuery("");
        root.highlightFirst();
    }

    onVisibleChanged: {
        if (!root.visible)
            root.reset();
    }

    // Checkbox 6: two Providers claiming the same prefix caught at load, not
    // resolved silently by whichever one route() happens to reach first.
    // Component.onCompleted rather than a property binding, and deliberately:
    // it runs once, after every child in `routable` has been constructed, so
    // "at load" is a fact about *when this runs* rather than an accident of
    // which binding first happened to read `root.routable`.
    //
    // ProvList.problems is the same idea one Provider over: a row in the "?"
    // list that can be neither prefixed nor entered is only discoverable by
    // choosing it, and choosing it fails silently. Both run here so that
    // adding a Provider to `pool` is caught by the log rather than by a user.
    Component.onCompleted: {
        Routing.problems(root.routable).forEach(problem => console.warn("launcher:", problem));
        ProvList.problems(root.routable).forEach(problem => console.warn("launcher:", problem));
    }

    // The pool. It lives here rather than in shell.qml because the window is
    // what ranks and renders the Entries; nothing outside this window has
    // needed a Provider yet.
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

        // Same two properties, for the same two reasons: `active` closes any
        // open chooser the moment the Launcher is dismissed (see the note on
        // `active` in Directories.qml), and `queryText` is the Query with
        // the "~" stripped, or "" routed anywhere else -- the same rule
        // calc's own queryText follows. The catalog is a binding over this
        // property, so every keystroke re-selects the folders, which is how
        // "typing a folder name" narrows the list at all.
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

    // The four static menus. Each is a data file and nothing else -- Menu.qml
    // is the whole of the behaviour -- so adding an entry is editing one of
    // these four and letting Quickshell reload it.
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

    // Ticket 15's two Providers, reached by being entered from the "?" list
    // below rather than by prefix or from `pool` -- see the header on
    // Themes.qml. `active` is what drops `entered` when the Launcher closes,
    // so a session never reopens already inside one of them.
    Themes {
        id: themes

        active: root.visible
    }

    Backgrounds {
        id: backgrounds

        active: root.visible
    }

    // Ticket 16's five: the ex-dmenu scripts, reached by being entered from
    // the "?" list rather than from `pool` -- see the note on
    // `rankedRoutable`. `active` drops `entered` when the Launcher closes, so
    // a session never reopens already inside one of them; on Workspaces it
    // also clears a half-typed rename, which is session state for the same
    // reason.
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

    // Ticket 18. `routable` rather than `pool`: the list is meant to cover
    // every Provider, including the prefix-only ones that are the whole reason
    // somebody would need reminding. It filters itself out (`listable: false`)
    // and cannot recurse -- catalogOf reads labels and prefixes off these
    // objects, never their catalogs.
    ProviderList {
        id: providerList

        providers: root.routable

        onQueryRequested: text => root.setQuery(text)
    }

    // The two Providers that are not in the pool, because they are not ranked
    // -- see localEntries above. Both are bindings over the Query rather than
    // over a catalog, which is why the Query is handed to them explicitly.
    Calculator {
        id: calc

        // `routed.query` when nothing routed elsewhere or routing named this
        // Provider by its own prefix, "" otherwise. The "" is what makes
        // routing to a different Provider suppress this one without this file
        // knowing anything about calc: Calc.wanted("") is false, so an Entry
        // routed away from stays an Entry routed away from, all the way down
        // to `calculating` below, which reads this same property.
        //
        // A nested Provider owns the whole pool (see `activePool`), so it
        // suppresses this one too: an applications list entered from "?" is
        // not a place a calculator answer belongs, even once typing resumes
        // after the entry reset it.
        queryText: root.nestedProvider !== null ? "" : (root.routed.provider === null || root.routed.provider === calc ? root.routed.query : "")
    }

    WebSearch {
        id: websearch

        // Same rule as calc's queryText above, and the same reason: routed
        // to a different Provider, this one sees "" and Web.entriesFor
        // produces nothing for it. Nested suppresses it for the same reason
        // it suppresses calc -- a Provider entered from "?" owns the whole
        // pool, "Search the web" included.
        queryText: root.nestedProvider !== null ? "" : (root.routed.provider === null || root.routed.provider === websearch ? root.routed.query : "")

        // Read from localEntries rather than from rankedEntries, which is what
        // keeps this a dependency and not a loop: rankedEntries is built *from*
        // this Provider's Entries, so binding it here would be asking the answer
        // to depend on itself.
        //
        // `calculating` is the second half of "local answer" and covers the
        // moment before there is one: an expression whose qalc is still running
        // has an answer coming, and offering to search the web for it would put
        // the browser under Return in the window before it lands. See the note
        // on that property.
        hasLocalAnswer: root.localEntries.length > 0 || calc.calculating
    }

    // The backdrop. Dimmed from the theme background rather than a hardcoded
    // black, so a light theme does not get a black scrim.
    Rectangle {
        anchors.fill: parent
        color: Theme.scrim
    }

    // Click-outside dismissal. Fills the window and sits under the card, so
    // the card's own MouseArea swallows clicks that land on it and only the
    // ones that miss reach here.
    MouseArea {
        anchors.fill: parent
        onClicked: root.dismiss()
    }

    FocusScope {
        id: content

        anchors.fill: parent
        focus: true

        // On the FocusScope rather than on the card, because key events
        // propagate *up* from whatever holds focus. The Query field below is a
        // descendant of this and consumes printable keys; Escape still has to
        // reach here from inside it.
        //
        // **Leaving a sub-view is checked before dismissing, and only here.**
        // A Provider's own `back` Action normally handles this and never lets
        // Escape reach this far -- but `back` is resolved off the *highlighted
        // Entry* (runAction, above), and a Provider entered while its source is
        // empty has no Entry to resolve against. Themes with no ~/.config/
        // themes is exactly that: Escape would fall through to here and dismiss
        // the whole Launcher, discarding the sub-view instead of leaving it,
        // which is the one case where "no results" and "no way back" would
        // compound. Providers that can be entered supply leave() (see
        // Themes.qml); the typeof guard is for a nested Provider that does not,
        // which stays dismissable rather than becoming inescapable.
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
            // arrive, and a centred card would slide up the screen on every
            // keystroke.
            y: Math.round(parent.height / 6)

            width: Theme.width

            // Grows with the Entries rather than reserving the full height, so
            // an empty Query is not a screen-tall empty box. Bounded by
            // root.listMaxHeight, which is what keeps it on the output.
            height: body.implicitHeight + Theme.padding * 2

            color: Theme.background
            border.color: Theme.accent
            border.width: 1
            radius: Theme.radius

            // Absorbs clicks on the card so they do not reach the dismissal
            // MouseArea behind it. No handlers -- accepting the press is the
            // entire job.
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

                    // The field is the Query's input; root.queryText is what
                    // ranks. Assigned first, so the Entries below are already
                    // the ones for this keystroke when the highlight moves.
                    //
                    // Typing is also what puts the highlight back on the best
                    // match. That used to hang off the Entries changing, which
                    // is no longer the same thing: with a live Provider in the
                    // pool they change on their own.
                    onTextChanged: {
                        root.queryText = query.text;
                        root.highlightFirst();
                    }

                    // Navigation and activation are handled here, not on the
                    // ListView, because the ListView must never take focus --
                    // every printable key has to keep reaching this field.
                    //
                    // Both `list` and the preview split are single-column, so
                    // Up/Down move the highlight by one Entry in either --
                    // ticket 13's first draft was a thumbnail grid needing a
                    // row-sized step and Left/Right of its own, which the
                    // redesign to a list-plus-preview made unnecessary along
                    // with the tradeoff that came with it (Left/Right stealing
                    // the Query's own cursor movement). Nothing here needs to
                    // know which layout is showing.
                    Keys.onUpPressed: event => {
                        root.moveHighlight(-1);
                        event.accepted = true;
                    }
                    Keys.onDownPressed: event => {
                        root.moveHighlight(1);
                        event.accepted = true;
                    }

                    // Every Action arrives here, as a chord.
                    //
                    // One handler rather than Keys.onReturnPressed and friends,
                    // for a reason that cannot be checked from a devcontainer:
                    // whether the specific handlers still fire with a modifier
                    // held is a question, and a chord built from the raw event
                    // makes it not one. It also means an extra Action on
                    // Ctrl+something is reachable at all -- there is no
                    // Keys.onCtrlWPressed to add.
                    //
                    // **The event is accepted only when the chord resolved.**
                    // That single rule is what makes three separate promises
                    // true at once: printable keys keep reaching the field
                    // (chordOf returns "" for them), a slot no Provider filled
                    // does nothing rather than erroring, and Escape over a
                    // Provider with no back Action goes unaccepted and
                    // propagates up to the FocusScope's Keys.onEscapePressed,
                    // which dismisses. Getting this wrong stops the Launcher
                    // being typeable.
                    Keys.onPressed: event => {
                        const chord = Actions.chordOf(event);
                        if (chord === "")
                            return;

                        // While a Provider holds the Query line as a text
                        // prompt, the two keys the prompt answers to go
                        // straight to it: Return hands the field's current
                        // text to the Provider, Escape cancels. Every other
                        // chord is accepted and ignored -- swallowed here so
                        // it cannot propagate anywhere that moves focus (a
                        // TextInput that lost focus mid-prompt would leave
                        // the prompt untypeable), while plain letters still
                        // reach the field through chordOf's "" above.
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

                        // Provider-agnostic, and stops being a lie every time
                        // the pool grows: it said "Search applications" while
                        // applications were the only Provider, and windows are
                        // matchable now.
                        //
                        // While a prompt owns the line, the placeholder is the
                        // prompt's own -- the old script's "Rename workspace
                        // 3 (3-(dev))" text, shown when the prefill is empty.
                        visible: query.text === ""
                        text: root.prompting
                            ? (root.promptingProvider ? root.promptingProvider.promptPlaceholder : "…")
                            : "Type a name…"
                        color: Theme.muted
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

                    // Sized off the count rather than contentHeight, which
                    // would be a binding on a property the view's own height
                    // feeds back into.
                    height: Math.min(root.rankedEntries.length * Theme.entryHeight, root.listMaxHeight)
                    visible: !root.previewMode && root.rankedEntries.length > 0 && !root.prompting

                    // Growing from one Entry tall to its real height is the
                    // last step of an open, and it happens after open() has
                    // returned -- so this, not open() alone, is what guarantees
                    // the view is positioned against the geometry it ended up
                    // with rather than the one it started from.
                    onHeightChanged: root.reassertView()

                    clip: true
                    model: root.rankedEntries
                    reuseItems: true

                    // The Query field owns the keyboard; root.setHighlight is
                    // the only thing that moves the highlight. Declared rather
                    // than left to default, so this view cannot start eating
                    // arrow keys if it ever ends up focusable.
                    keyNavigationEnabled: false

                    delegate: Rectangle {
                        id: entry

                        required property int index
                        required property var modelData

                        // An Entry's icon is an icon-*theme* name, not a path,
                        // so resolving it is the theme's job. The second
                        // argument to iconPath is what turns a miss into an
                        // empty string instead of a broken image -- the same
                        // call the bar's NotificationItem makes. A window's
                        // application id misses more often than an
                        // application's own icon name, which costs a blank
                        // slot and nothing else.
                        readonly property string iconSource: entry.modelData.icon ? Quickshell.iconPath(entry.modelData.icon, true) : ""

                        width: list.width
                        height: Theme.entryHeight
                        radius: Math.round(Theme.radius / 2)
                        // Painted from root.highlightIndex, not from
                        // list.currentIndex: the view's own index can be moved
                        // by a model reassignment, and what is painted has to
                        // be what Enter will act on.
                        color: entry.index === root.highlightIndex ? Theme.highlight : (pointer.containsMouse ? Theme.hover : "transparent")

                        // Hover paints its own weaker tint rather than moving
                        // currentIndex. Moving it would let a stationary
                        // pointer fight the keyboard: delegates are recreated
                        // under the cursor on every keystroke, so `entered`
                        // fires without the pointer going anywhere and the
                        // highlight would jump back under the mouse mid-type.
                        //
                        // Declared before the icon and the name, both of which
                        // are non-interactive, so nothing above it steals the
                        // click.
                        MouseArea {
                            id: pointer

                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor

                            // Clicking acts on what was clicked, not on what
                            // the keyboard had highlighted -- and it means the
                            // primary Action, asked for by slot rather than by
                            // key, since a click carries no modifiers. Both
                            // routes go through runAction, so the pointer
                            // cannot end up doing something Return does not.
                            onClicked: root.runAction(entry.modelData, Actions.chordFor("primary"))
                        }

                        IconImage {
                            id: icon

                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.leftMargin: Math.round(Theme.padding / 2)

                            // Hidden rather than collapsed. An invisible Item
                            // still anchors, so the name column stays put and
                            // an application with no icon does not pull its
                            // Entry out of line with the rest.
                            visible: entry.iconSource !== ""
                            source: entry.iconSource
                            implicitSize: Theme.entryIconSize
                        }

                        // Two lines when the Provider supplies a sub-line, one
                        // when it does not -- an invisible child takes no room
                        // in a Column, so an application's Entry is laid out
                        // exactly as it was before windows existed.
                        //
                        // The Column's width comes from its anchors, not from
                        // its children, which is what lets both Texts bind to
                        // parent.width to elide without a loop.
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

                // The screenshots Provider's own view -- ticket 13, redesigned
                // after the first host round: a thumbnail grid turned out to
                // pick blind -- a filename and a timestamp are not enough to
                // tell two screenshots apart before committing to one. This is
                // a narrow list of names and dates on the left, paired with a
                // single large preview of whichever one is highlighted on the
                // right, so what Return is about to copy is what is on
                // screen. A sibling to `list` rather than an attempt to make
                // `list` itself two-column-capable: the two are mutually
                // exclusive on `visible`, so exactly one is ever painting, and
                // every touchpoint the highlight has to reach -- setHighlight,
                // applyHighlight, reassertView, the height bound below --
                // addresses whichever one that is rather than teaching one
                // view two shapes.
                //
                // Also the cheaper design, incidentally: a grid decodes one
                // thumbnail per visible cell -- dozens at once, and hundreds
                // once scrolling -- where this decodes exactly one image at a
                // time, whichever is highlighted. Checkbox 2's "without
                // blocking typing" is easier to keep true this way, not
                // harder.
                Item {
                    id: preview

                    width: parent.width

                    // **The full available height, not the list's own.** Unlike
                    // `list`, which grows with its Entries and is meant to, this
                    // split stays the same size however many Entries match: the
                    // right-hand pane is a picture, and a picture that resizes as
                    // you type is unreadable at the moment it matters most --
                    // narrowing to the single Entry you were aiming for shrank
                    // the preview to one row tall, which is exactly when you want
                    // to look at it. The left column keeps sizing to its content
                    // (see previewList); only the split's outer height is pinned,
                    // so the empty space lands below the names rather than
                    // stretching them.
                    height: root.listMaxHeight
                    visible: root.previewMode && root.rankedEntries.length > 0 && !root.prompting

                    ListView {
                        id: previewList

                        anchors.left: parent.left
                        anchors.top: parent.top
                        width: Theme.previewListWidth

                        // Sized and capped exactly like `list`'s own height --
                        // see the note there. Deliberately *not* the split's
                        // height: the names column ending after the last name is
                        // what it should do, and only the pane beside it needs
                        // pinning.
                        height: Math.min(root.rankedEntries.length * Theme.entryHeight, root.listMaxHeight)

                        onHeightChanged: root.reassertView()

                        clip: true

                        // `root.previewMode ? root.rankedEntries : []`, not
                        // `root.rankedEntries` unconditionally -- a delegate
                        // can be instantiated for layout purposes even while
                        // `visible` is false (invisible is not the same as
                        // absent), and the preview pane below reads
                        // `target.path`, which no non-screenshot Entry has.
                        // Bound to the live pool regardless of mode, that
                        // surfaced as `file://undefined` on every application
                        // and window Entry the moment the Launcher opened on
                        // the default pool, not only while "#" was typed -- an
                        // empty model when this view is not the one showing is
                        // what keeps it from ever seeing an Entry shape it
                        // does not understand.
                        model: root.previewMode ? root.rankedEntries : []
                        reuseItems: true

                        // Same reasoning as list's own: the Query field owns
                        // the keyboard, root.setHighlight is the only thing
                        // that moves the highlight, and this view must never
                        // itself become focusable.
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
                            // of the highlight, so a mark stays visible as the
                            // highlight arrows past it -- checkbox 5's
                            // "visibly distinct from the highlighted one"
                            // would not hold if marking and highlighting
                            // painted the same way.
                            border.width: row.marked ? 2 : 0
                            border.color: Theme.markedBorder

                            MouseArea {
                                id: pointer

                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor

                                // Same routing as the main list delegate's own
                                // click -- the primary *slot*, not a
                                // hardcoded chord, so clicking a row and
                                // pressing Return over it cannot drift apart
                                // on what they do.
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

                        // The split's height rather than the list's, so the
                        // image keeps its size as the Query narrows -- see the
                        // note on `preview`.
                        height: preview.height

                        color: Theme.hover
                        radius: Theme.radius

                        // Which file the highlighted Entry wants previewed, or
                        // "" for none. `target.preview` first, then
                        // `target.path`: screenshots and backgrounds *are* the
                        // image they preview, so their path is the answer,
                        // while a theme is a directory of colour files whose
                        // preview is a separate image beside it (ticket 18 --
                        // see lib/themes.js). A theme that shipped no preview
                        // has `preview: ""` and falls through to a `path` it
                        // does not have, landing on "" -- which is the "No
                        // selection" text below, and correct.
                        //
                        // file:// with the path percent-encoded -- a plain
                        // absolute path would also load under Qt, but a
                        // screenshot filename with a space or a non-ASCII
                        // character in it is exactly the case an unencoded
                        // path silently mishandles. "" for nothing
                        // highlighted, which Image treats as no source rather
                        // than an error.
                        readonly property string previewFile: root.highlightedEntry
                            ? (root.highlightedEntry.target.preview || root.highlightedEntry.target.path || "") : ""
                        readonly property string previewSource: root.previewMode && previewPane.previewFile !== ""
                            ? "file://" + encodeURI(previewPane.previewFile) : ""

                        Image {
                            anchors.fill: parent
                            anchors.margins: Theme.padding

                            fillMode: Image.PreserveAspectFit
                            visible: previewPane.previewSource !== ""

                            // Both halves matter: `asynchronous` keeps
                            // decoding off the thread that reads keystrokes --
                            // checkbox 2 -- and `sourceSize` is what keeps a
                            // 4K screenshot from being decoded at its full
                            // resolution just to be shown at
                            // Theme.previewImageSize. Only ever one of these
                            // decoding at a time (whichever Entry is
                            // highlighted), unlike a grid's one per visible
                            // cell.
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

                // Two different empty states, on purpose. A Provider that is
                // not ready has not populated -- or its catalog binding never
                // re-evaluated, which is ticket 04's named trap. An empty
                // result set over a ready pool is just a Query that matches
                // nothing. Collapsing both into one blank card makes those
                // indistinguishable exactly when it matters.
                //
                // Named per Provider rather than hardcoded to applications,
                // because "no windows" is an answer and "no applications" is a
                // fault, and only the Provider knows which it is.
                Text {
                    width: parent.width

                    // Suppressed while a prompt owns the line: an empty prompt
                    // ("back to the plain id") is not "No matches".
                    visible: root.rankedEntries.length === 0 && !root.prompting
                    text: root.pending.length === 0 ? "No matches" : `Waiting for ${root.pending.join(" and ")}…`
                    color: Theme.muted
                    font.family: Theme.fontFamily
                    font.pixelSize: Theme.entryFontSize
                    textFormat: Text.PlainText
                }

                // What the keys do here, in this Provider's own words. The
                // checkbox is "visible without guessing", and the reason it is
                // a checkbox is that the alternative is unknowable: an Action
                // nobody can see is indistinguishable from one that does not
                // exist, and a key that does nothing is indistinguishable from
                // a key that is not bound.
                //
                // Bound to the *highlighted* Entry rather than to the pool,
                // because that is whose Provider the keys will reach -- so
                // arrowing from a window to an application changes "switch to"
                // to "launch" while the key stays Return. That change is the
                // visible proof the vocabulary is per Provider.
                Row {
                    id: footer

                    spacing: Theme.padding

                    // Nothing highlighted is nothing to act on. Also covers the
                    // empty-Query-empty-pool case, where a footer would be
                    // describing keys that reach no Entry.
                    visible: root.highlightActions.length > 0

                    Repeater {
                        model: root.highlightActions

                        delegate: Row {
                            id: hint

                            required property var modelData

                            spacing: Math.round(Theme.padding / 3)

                            // The key, louder than what it does: this line is
                            // read to find a key, not to read a sentence.
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
