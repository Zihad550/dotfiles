import QtQuick
import Quickshell
import "../lib/matching.js" as Matching

// The applications Provider: installed desktop entries, matched on their name.
//
// Small because Quickshell.DesktopEntries already carries everything needed --
// names, icon-theme names, Terminal=true handling and an execute() -- so there
// is no .desktop parsing, no icon-theme lookup and no terminal handling of our
// own here. See unknown 2 in .scratch/launcher/issues/01.
//
// The Provider shape, settled by ticket 05 now that there are two of these and
// something to generalise from. A Provider is a QtObject with:
//
//   label     what to call it when the window has to name it
//   ready     false while emptiness is a fault rather than an answer
//   catalog   { entries, corpus } -- Entries in a display shape the window can
//             render without knowing which Provider they came from, and the
//             corpus rank() scores
//   actions   which of the shell's Core Action slots this Provider fills, and
//             with what -- see below
//   refresh   optional: re-ask the source for what it may not have yet, called
//             on every open. Absent here, because DesktopEntries populates once
//             and there is nothing to re-ask; the windows Provider has one,
//             because the compositor can be asked again and being seconds out
//             of date is exactly what an open exposes.
//   prefix    optional, added by ticket 11: the leading character that routes
//             a Query to this Provider alone -- "=" on Calculator.qml, "@" on
//             WebSearch.qml. Read by lib/routing.js through Launcher.qml's
//             `routed`; a Provider that never sets it is simply never matched.
//             Declared by the Provider itself rather than registered anywhere
//             central, so adding one here is the whole of adding a prefix.
//   nested    optional, added by ticket 12: true while a Provider is showing a
//             sub-view of its own -- Directories.qml's chooser is the first.
//             Read by Launcher.qml's `nestedProvider`, which gives a nested
//             Provider the whole pool to itself, the same as a routed prefix,
//             and clears the Query crossing either edge of it. A Provider
//             that never sets it is simply never nested.
//   enter/leave optional, added by ticket 18: what the "?" provider list
//             calls for a Provider with no `prefix` -- see reachOf in
//             lib/providerlist.js. enter() sets `nested`; leave() clears it,
//             and is what Launcher.qml's back and dismissal call. Themes,
//             backgrounds and the default-pool Providers (applications,
//             windows, the four menus) all declare the same tiny shim. A
//             listable Provider with neither a prefix nor an enter() is a
//             programming error, surfaced loudly by the "?" list calling the
//             missing function rather than by silently showing the whole
//             pool. `active` is required alongside it, and is the same
//             visible-watch Directories.qml has had since ticket 12: false
//             drops the entered state when the Launcher closes.
//   layout    optional, added by ticket 13: a value naming a layout other than
//             the default one-row-per-Entry list. "preview" is the one value
//             defined so far -- a narrow name/date list beside a single large
//             image of whichever Entry is highlighted -- and Screenshots.qml
//             set it first; themes and backgrounds joined under ticket 18,
//             when moving out of `pool` made owning the whole activePool legal
//             for them. Read by Launcher.qml's
//             `previewMode`, which only ever renders it when this Provider
//             owns the *whole* activePool (routed by its own prefix, or
//             nested) -- an alternate layout mixed row-for-row into the
//             ranked list would not read as either one. Left unset, a
//             Provider renders in the list exactly as it always has; there is
//             no generic per-Provider delegate yet, so a second Provider
//             wanting its own layout is the point to add one rather than to
//             hand-roll a second layout inside Launcher.qml.
//   description optional, added by ticket 18: a sentence on what this Provider
//             does, shown as the second half of its row in the "?" provider
//             list (lib/providerlist.js). Degrades to "" when absent -- the
//             list renders the row with just its prefix rather than breaking.
//   listable  optional, added by ticket 18: false opts a Provider out of the
//             "?" provider list, without making it unreachable -- the provider
//             list itself is the first to set it. Absent is every Provider
//             that has never thought about this, and means listed.
//   prompting optional, added by ticket 16: true while a Provider is asking for
//             a line of text of its own -- Workspaces.qml's rename is the
//             first and so far only one. Read like `nested`, by Launcher.qml's
//             `promptingProvider`, which hands the Query field over while it
//             is true, hides the list, and restores the Query the prompt
//             started from when it drops. A prompt is not a Surface: it is the
//             same window and the same Query line, which is exactly the point
//             of the ticket ("needing no external text prompt"). Five slots
//             come with it, all meaningless unless a Provider sets `prompting`
//             at some point:
//             promptValue       what the Query field is prefilled with when
//                               `prompting` goes true, read synchronously at
//                               that moment -- so a Provider must have decided
//                               what it is prompting *about* before it raises
//                               the flag.
//             promptVerb        what the footer's Return hint calls it
//                               ("rename"). Absent falls back to "confirm".
//             promptPlaceholder what the field shows while the prefill is
//                               empty -- the sentence naming what is being
//                               prompted for.
//             applyPrompt(text) Return: the Provider does its thing with the
//                               field's content and lowers `prompting`.
//             cancelPrompt()    Escape, and dismissal through `active`: lower
//                               the flag, change nothing. A Provider that
//                               prompts must clear it on `active` going false
//                               for the same reason `entered` is cleared --
//                               a reopened Launcher must not still be
//                               mid-prompt.
//   ordered   optional, added by ticket 17: a catalog may be
//             { entries, ordered: true } instead of { entries, corpus }, and
//             the shell then skips rank() for it entirely -- the Entries are
//             already in the order they must display. Files.qml is the first
//             to carry one: its folder-then-contents grouping is a structural
//             claim about order that score() cannot express. An Ordered
//             Provider (CONTEXT.md) must own the whole activePool whenever it
//             is shown, which a prefix is what guarantees, because a
//             zero-scored ordered list would interleave with a scored
//             Provider's ranking as if it were tied with everything. A
//             Provider may set it on some of its catalog's shapes and not
//             others -- Files.qml orders its listing and scores its chooser.
//             Nothing bounds an ordered catalog's length for it, so a Provider
//             that can produce many Entries has to cap them itself: merge()
//             keeps only its first DEFAULT_LIMIT, and with no scores to sort
//             by, whatever falls past that is simply lost.
//
// **The one variant, added by ticket 09: a Provider that is not ranked.** The
// calculator and the web search have `entries` -- a plain list -- in place of
// `catalog`, and take the Query as a `queryText` property rather than being
// matched against it. That is not a shortcut. Both *generate* their Entry from
// the Query, so a corpus would hold a copy of the needle, and score() gives a
// haystack equal to its needle both the highest quality and the smallest length
// penalty there is: such a Provider would rank first for everything typed.
// Launcher.qml places their Entries around the merged pool by hand instead --
// see `localEntries` there, which is also where the placements are argued. A
// Provider with a `catalog` is scored and a Provider with `entries` is placed;
// nothing has both -- except the `ordered` catalog above, which is the one
// shape that is a real catalog yet declines scoring, because its order is its
// own structure.
//
// `actions` is what ticket 06 replaced this Provider's own activate() with. The
// shell declares the slots -- primary on Return, secondary on Shift+Return,
// back on Escape (lib/actions.js) -- and a Provider fills the ones it has
// something to put in:
//
//   actions: ({ primary: { label: "launch", invoke: entry => …, after: "close" } })
//
// A Provider does not name the key, which is the entire point: Return launches
// an application, switches to a window and will copy a screenshot, so muscle
// memory transfers as Providers are added. `label` is what the footer says,
// `after` is what the Launcher does next (close / refresh / stay, defaulting per
// slot), and a slot left out simply does nothing on its key.
//
// A fourth slot, `mark`, exists for a Provider whose Entries can be selected
// several at once -- Screenshots.qml, ticket 13. Unlike the other three, a
// Provider filling it supplies its own toggle rather than a shell-provided
// one, because the shell has nowhere to keep "which Entries are marked" that
// would not leak between Providers: the selection and the toggle both live on
// the Provider that owns the Entries, the same place Directories.qml already
// keeps its own sub-view state. A Provider that never fills `mark` is simply
// never marked, and Tab does nothing over it -- an unfilled slot, like any
// other.
//
// A Provider that needs an Action the shared vocabulary has no slot for adds it
// to `extras`, which is the one place a Provider does name a key:
//
//   extras: [{ chord: "Ctrl+W", label: "close window", invoke: …, after: "refresh" }]
//
// An extra is outside the vocabulary by definition, so nothing may assume it
// means the same thing in the next Provider -- and one claiming a core chord,
// or a chord no key press can produce, is dropped with a warning rather than
// allowed to advertise a key that does nothing.
//
// An Entry is { name, subtext, icon, key, provider, target }: the two lines to
// show, an icon-*theme* name for the window to resolve, the Entry Key Frecency
// accumulates against, the Provider that can act on it, and `target`, which is
// the Provider's own object and which nothing outside this file touches.
//
// `key` is the one optional field, and leaving it out is a decision rather than
// an omission: a Provider supplies one only when its Entries genuinely have an
// identity that survives a restart. The windows Provider has none -- a window
// address is not the same window tomorrow -- so its Entries carry no key, record
// nothing, and rank on match score alone.
//
// The Entry carrying its own Provider is what lets the pool be merged into one
// ranked list and still dispatched correctly -- an Entry knows what can be done
// to it, which is what CONTEXT.md says a Provider is responsible for.
NestableProvider {
    id: root

    readonly property string label: "applications"
    readonly property string description: "Installed applications"

    // Whether there is anything to match against yet. Exposed so the window
    // can say "still waiting" rather than "no matches", which are the same
    // blank card but very different faults. Unlike the windows Provider, 0 here
    // is never a legitimate answer -- a machine with no applications installed
    // is not a case worth designing for.
    readonly property bool ready: root.catalog.entries.length > 0

    // One property rather than separate `entries` and `corpus`, so a consumer
    // reads a consistent pair in a single access. The indices rank() returns
    // are only meaningful against the entry list the corpus was prepared from,
    // and two bindings off the same model can be observed half-updated.
    //
    // A binding, emphatically not a Component.onCompleted snapshot:
    // DesktopEntries populates *asynchronously* -- 0 entries when the config
    // loads, 84 a second or two later. Snapshotting gives a permanently empty
    // Launcher and no error to explain it.
    //
    // This rests on `values` notifying when the model changes. The probe in
    // ticket 01 only established the 0-to-84 transition by polling, but the
    // bar's Workspaces.qml has shipped on exactly this -- a `readonly property
    // var` filtering `Hyprland.workspaces.values` -- and workspaces do appear
    // and disappear live. Same ObjectModel, same notification. If it turns out
    // not to hold, `ready` above stays false forever and the Launcher says so
    // rather than looking merely empty.
    readonly property var catalog: {
        const applications = DesktopEntries.applications.values.filter(application => !application.noDisplay);

        // No sub-line: the comment and generic name are the obvious candidates
        // and both are noise next to a name that already says what the thing
        // is. The windows Provider is what the sub-line exists for.
        const entries = applications.map(application => ({
            name: application.name,
            subtext: "",
            icon: application.icon,

            // The Entry Key: the desktop entry id, which is stable across
            // restarts -- the condition the spec puts on supplying one at all.
            // Frecency accumulates against it, and it is the same string the
            // corpus is prepared with below, read from here rather than from the
            // model a second time so the two cannot drift.
            key: application.id,

            provider: root,
            target: application
        }));

        // Match on the name alone. Folding in the comment or generic name would
        // inflate the haystack, and score()'s length tie-break would quietly
        // start ranking verbose entries below terse ones.
        //
        // One corpus text per Entry, so no `owners`: rank() already returns
        // indices in Entry space and collapse() passes the result through
        // untouched.
        //
        // The Entry Keys are the Entries' own -- see `key` above.
        return {
            entries: entries,
            corpus: Matching.prepare(entries.map(entry => entry.name), entries.map(entry => entry.key))
        };
    }

    readonly property string home: Quickshell.env("HOME")

    // Every launch goes through uwsm-app, which is what elephant autodetected
    // and prefixed with too -- so this is parity, not a new idea.
    //
    // It puts the application in its own systemd unit under app.slice instead
    // of making it a child of this process. Three things follow:
    //
    // - The application outlives the Launcher. Without this, `df-qs-restart
    //   launcher` takes every application started from it down too, which
    //   during this rewrite is a thing that happens several times an hour.
    // - app.slice is scheduled against session.slice, where the compositor and
    //   the bar live, so a heavy application cannot starve the thing drawing
    //   the screen. This is resource isolation rather than speed: nothing
    //   launches faster, but a busy application stops making everything else
    //   stutter.
    // - The OOM killer and `uwsm stop` act on one application rather than on
    //   the session.
    //
    // The cost is a fork, an exec and a D-Bus round trip per launch. Paid once
    // when the Launcher is already dismissing, which is not a path anything
    // waits on -- unlike the per-*open* cost the spec rejects for the keybind.
    //
    // Assumes uwsm, as the whole session already does (autostart.lua:11 and
    // :15 start both Quickshell configs through it). Dropping it is deleting
    // this one property and the concat below.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    // Which terminal wraps a Terminal=true entry. TERMINAL is the variable
    // elephant read first too, and ghostty is what the bar already hardcodes
    // in NetworkItem and BluetoothItem -- so this honours the setting when the
    // session exports it and lands on the repo's answer when it does not.
    readonly property string terminal: Quickshell.env("TERMINAL") || "ghostty"

    // The Exec line as an argv array, field codes already stripped.
    //
    // This is on the path of *every* launch, not just the awkward ones: a
    // launch prefix cannot be handed to execute(), so getting the prefix means
    // building the command here.
    //
    // Both branches are kept because the host run proved launching works, not
    // which shape it works from -- a one-word Exec survives either path
    // identically, so "everything launches" does not distinguish them. The
    // string branch is the weaker one: it splits on spaces and would mangle a
    // quoted argument. If an application whose Exec has a quoted argument ever
    // launches wrong, that is this, and `console.log(JSON.stringify(
    // entry.command))` here says so in one run.
    function commandOf(application) {
        const command = application.command;
        if (command === undefined || command === null)
            return [];
        if (typeof command === "string")
            return command.split(" ").filter(part => part !== "");
        if (command.length !== undefined)
            return Array.prototype.slice.call(command);
        return [];
    }

    // Desktop entries are not shell input: nothing expands a leading `~`, and
    // the webapp entries df-webapp-install writes start with one
    // (`Exec=~/dotfiles/bin/df-launch-webapp …`). Elephant got away with it by
    // running every Exec through `sh -c`; this expands the one construct that
    // actually occurs rather than reintroducing a shell and its quoting.
    // Anything relying on a *different* shell-ism -- $HOME, a glob, an && --
    // still will not run. If one turns up, that is the point to decide whether
    // the entry is wrong or this needs a shell after all.
    function expandHome(part) {
        if (part === "~")
            return root.home;
        if (part.startsWith("~/"))
            return root.home + part.slice(1);
        return part;
    }

    // Which slots this Provider fills. Primary only, deliberately: the obvious
    // candidates for secondary are launching a second copy -- which is what
    // primary already does, since focusing an existing window is the windows
    // Provider's job -- and the entry's own desktop actions ("New Private
    // Window"), which are a list rather than a single Action and would need
    // somewhere to show it. So Shift+Return over an application does nothing,
    // and does it without an error.
    //
    // Parenthesised because a QML property binding starting with `{` is read as
    // a code block rather than as an object literal.
    readonly property var actions: ({
        primary: {
            label: "launch",
            invoke: entry => root.launch(entry)
        }
    })

    // The primary Action.
    function launch(entry): void {
        const application = entry.target;
        const argv = root.commandOf(application);

        // The fallback, not the normal path. execute() cannot be given a
        // launch prefix, so taking it means the application is a child of this
        // process with none of what launchPrefix buys -- but an Entry that
        // launches unscoped still beats an Entry that does nothing.
        if (argv.length === 0) {
            console.warn("launcher: no command for", entry.name, "-- launching unscoped");
            application.execute();
            return;
        }

        // A Terminal=true entry names a command, not a window: with no
        // terminal around it the process exits immediately and looks like
        // nothing happened, which is what yazi did. Quickshell exposes
        // runInTerminal precisely because execute() does not act on it -- the
        // same wrap elephant applied. `-e` is the flag ghostty, kitty, foot
        // and alacritty all take.
        //
        // Wrapped before the prefix is applied, so the shape is
        // `uwsm-app -- ghostty -e yazi`: the unit systemd tracks is the
        // terminal, which is the window that actually exists. Elephant ordered
        // it the same way.
        const command = argv.map(root.expandHome);
        const wrapped = application.runInTerminal ? [root.terminal, "-e"].concat(command) : command;

        Quickshell.execDetached(root.launchPrefix.concat(wrapped));
    }
}
