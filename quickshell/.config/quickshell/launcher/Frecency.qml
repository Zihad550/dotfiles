pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "lib/frecency.js" as Store

// The Launcher's Frecency: which Entry Keys have been chosen, how often and how
// recently, persisted across restarts.
//
// A Singleton, like Theme.qml, and for a stronger reason than convenience: there
// is one file, and two owners of one file is a lost write. Nothing else in the
// config needs to reach it -- only Launcher.qml does -- but "there is exactly
// one of these" is the property that matters, and a Singleton is how QML says
// that.
//
// **The arithmetic is not here.** lib/frecency.js holds every rule about decay,
// normalisation and pruning, under test, for the reason its own header gives: a
// wrong answer looks like a preference rather than a fault. What is here is the
// part that cannot be tested from a devcontainer -- a path, a file, and a QML
// property the ranker can bind to.
//
// Ticket 01 established why the store has to live in QML rather than in the
// module: without `.pragma library` (a syntax error under node) each importing
// document gets its own copy of the module scope, so the module cannot hold
// state and the state has to be owned by something that can.
Singleton {
    id: root

    // ~/.local/state, which is where bin/df-hypr-display-layout already keeps
    // its own last-used state, honouring XDG_STATE_HOME the same way. Not
    // ~/.cache: a cache is something that can be regenerated from a source, and
    // there is no source for this -- deleting it loses the learned order for
    // good.
    readonly property string xdgState: Quickshell.env("XDG_STATE_HOME") || `${Quickshell.env("HOME")}/.local/state`
    readonly property string stateDir: `${root.xdgState}/df-launcher`
    readonly property string path: `${root.stateDir}/frecency.json`

    // The store, as the module's own shape. Reassigned, never mutated -- `usage`
    // below is a binding on it, and a mutation in place notifies nothing, which
    // would leave the Entries in their old order until something unrelated
    // happened to change.
    property var store: Store.emptyStore()

    // The moment `usage` below is computed as of. Frecency decays with wall-clock
    // time, and this Launcher is an always-running process that may not restart
    // for weeks, so something has to move the clock forward -- refresh() below,
    // called on every open.
    //
    // Its own property rather than a Date.now() inside the binding, because a
    // binding cannot depend on the clock: it would compute once and never again,
    // and there would be nothing to say when it was stale.
    //
    // Named `asOf` rather than `at`, because a *record* has an `at` too and it is
    // a different sense of the word -- when that choice was made, not when this
    // reading was taken.
    property double asOf: Date.now() / 1000

    // What rank() blends, as `options.usage`: Entry Key to a number in [0, 1].
    //
    // A binding, so recording a choice reorders the Entries immediately rather
    // than at the next open. Recomputed only when the store or the clock moves --
    // not per keystroke, which is the thing that must stay cheap.
    readonly property var usage: Store.usageOf(root.store, root.asOf)

    // Whether the file has been read and folded in. Set by adopt() only.
    property bool loaded: false

    // Whether writing is allowed yet.
    //
    // **The store must never be written before the read has been resolved.** The
    // file loads asynchronously, so a choice made in the first moments after
    // startup can beat it into memory -- and a write there would truncate the
    // file to that one record. Whether the pending read would still deliver the
    // pre-write contents or the truncated ones is precisely the FileView
    // behaviour this cannot check from a devcontainer, so it is not relied on:
    // nothing is written until the read has either arrived or been given up on.
    //
    // Separate from `loaded`, and the difference is the case that needs it: a
    // read that arrives *after* the deadline below still has to be merged, but
    // writing was already permitted by then.
    property bool settled: false

    // A choice recorded before writing was allowed, still owed to the file.
    property bool unsaved: false

    // Move the clock. Called on every open, which is both when a stale decay
    // would show and the last moment before the Entries are ranked.
    function refresh(): void {
        root.asOf = Date.now() / 1000;
    }

    // Record a choice against an Entry Key.
    //
    // A key of "", null or undefined is a Provider that opted out of Entry Keys
    // -- the windows Provider -- and the module treats it as a no-op, so the
    // caller does not have to ask first.
    function record(key): void {
        const now = Date.now() / 1000;

        // bump() returns the store it was given for a key it will not record, so
        // this is how the no-key case stays a fact the module owns rather than a
        // second condition here that could disagree with it.
        const bumped = Store.bump(root.store, key, now);
        if (bumped === root.store)
            return;

        // Pruned on every write rather than on a timer or at startup. The write
        // is the only moment the store grows, so it is the only moment the bound
        // can be crossed -- and pruning here means a store that is never written
        // to is never rewritten either.
        root.store = Store.prune(bumped, now);
        root.asOf = now;
        root.save();
    }

    // Merge the file into whatever is in memory, rather than replacing it.
    //
    // The file loads asynchronously, so a choice made in the first moments after
    // startup can beat it into memory. Replacing would lose that choice; ignoring
    // the file to keep it would throw away everything Frecency had accumulated.
    // See mergeStores in the module for why the newer record wins.
    //
    // Once only. Whether writing the file re-fires `onLoaded` is not a thing this
    // needs to know: re-adopting our own write would be harmless but pointless,
    // and the guard makes it neither.
    function adopt(text: string): void {
        if (root.loaded)
            return;

        root.loaded = true;
        root.settled = true;
        root.store = Store.mergeStores(Store.parse(text), root.store);
        root.refresh();
        root.flush();
    }

    // Give up on the read and take ownership of the file.
    //
    // Needed because the missing-file case fires no `onLoaded` at all -- which is
    // the whole of the degrade-to-no-Frecency behaviour, and is also every first
    // run on a machine that has never opened this Launcher. Without a deadline,
    // `settled` would stay false forever there and the store would never be
    // written, so the Launcher would learn nothing and never say why.
    //
    // A late read is still honoured: adopt() merges whenever it has not run,
    // settled or not, and mergeStores keeps the newer record per key.
    function settle(): void {
        if (root.settled)
            return;

        root.settled = true;
        root.flush();
    }

    // Write out a choice that was made before writing was allowed.
    function flush(): void {
        if (!root.unsaved)
            return;

        root.unsaved = false;
        root.save();
    }

    // Write the store out.
    //
    // Wrapped, and this is the one place in the Launcher where a try/catch is
    // the right tool rather than a shrug: persisting Frecency is strictly less
    // important than launching the thing that was just chosen, and record() is
    // called from the Action dispatch path. A write that fails -- a full disk, a
    // read-only home, a state directory that does not exist yet -- must cost the
    // accumulated Frecency and nothing else.
    function save(): void {
        // Owed rather than written. See `settled`.
        if (!root.settled) {
            root.unsaved = true;
            return;
        }

        try {
            view.setText(Store.serialize(root.store));
        } catch (error) {
            console.warn("launcher: could not write", root.path, "--", error);
        }
    }

    // The state directory, once, at startup. FileView writes a file; it does not
    // promise to build the path to it, and on a machine that has never run this
    // Launcher nothing else has created ~/.local/state/df-launcher. Detached and
    // fired long before any write, so nothing waits on it.
    //
    // Idempotent, which is why it is unconditional rather than guarded by a
    // check that would cost a second process to answer.
    Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", root.stateDir])

    // How long the read gets before the file is considered ours to overwrite.
    //
    // Two seconds, which is the same order as the delay ticket 01 measured on
    // DesktopEntries populating -- so it is the scale asynchronous startup in
    // this shell actually runs at, rather than a number picked to feel safe. It
    // costs nothing when the read arrives first, which is every run after the
    // first: adopt() settles immediately and this fires into a no-op.
    Timer {
        interval: 2000
        running: true
        repeat: false
        onTriggered: root.settle()
    }

    FileView {
        id: view

        path: root.path

        // No `watchChanges`. This process is the only writer, and watching would
        // mean re-reading -- and re-parsing -- every one of its own writes.
        //
        // `onLoaded` is the only signal used, and its absence is the missing-file
        // case: nothing fires, the store stays empty, and the Launcher ranks on
        // match score alone. That is the degradation the ticket asks for, and it
        // is the default rather than a branch.
        onLoaded: root.adopt(view.text())
    }
}
