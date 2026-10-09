pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "lib/frecency.js" as Store

// The Launcher's Frecency: which Entry Keys have been chosen, how often and how
// recently, persisted across restarts.
//
// A Singleton because two owners of one file is a lost write. The arithmetic
// (decay, normalisation, pruning) lives in lib/frecency.js, under test; this
// file is the part that can't be tested from a devcontainer -- path, file, and
// a QML property the ranker binds to.
Singleton {
    id: root

    // ~/.local/state, not ~/.cache: there's no source to regenerate this
    // from, so deleting it loses the learned order for good.
    readonly property string xdgState: Quickshell.env("XDG_STATE_HOME") || `${Quickshell.env("HOME")}/.local/state`
    readonly property string stateDir: `${root.xdgState}/df-launcher`
    readonly property string path: `${root.stateDir}/frecency.json`

    // Reassigned, never mutated in place -- `usage` below binds on it, and an
    // in-place mutation wouldn't notify anything.
    property var store: Store.emptyStore()

    // The moment `usage` is computed as of. A binding can't depend on the
    // clock (it would compute once and never again), so refresh() below moves
    // this forward explicitly on every open to keep decay current across a
    // process that may run for weeks.
    property double asOf: Date.now() / 1000

    // What rank() blends, as `options.usage`. A binding, so recording a choice
    // reorders the Entries immediately rather than at the next open.
    readonly property var usage: Store.usageOf(root.store, root.asOf)

    // Set by adopt() only.
    property bool loaded: false

    // Whether writing is allowed yet. The file loads asynchronously, so a
    // choice made in the first moments after startup could beat the read into
    // memory -- writing before the read resolves risks truncating the file to
    // that one record. Separate from `loaded`: a read arriving after the
    // deadline below still needs merging, but writing was already permitted.
    property bool settled: false

    // A choice recorded before writing was allowed, still owed to the file.
    property bool unsaved: false

    // Called on every open -- the last moment before Entries are ranked.
    function refresh(): void {
        root.asOf = Date.now() / 1000;
    }

    // "", null or undefined means a Provider that opted out of Entry Keys
    // (windows); the module treats it as a no-op so callers don't need to check first.
    function record(key): void {
        const now = Date.now() / 1000;

        const bumped = Store.bump(root.store, key, now);
        if (bumped === root.store)
            return;

        // Pruned on every write rather than on a timer: the write is the only
        // moment the store can grow past the bound.
        root.store = Store.prune(bumped, now);
        root.asOf = now;
        root.save();
    }

    // Merges rather than replaces: a choice made before the file loaded would
    // otherwise be lost to a replace, or the file's history lost by ignoring
    // it. mergeStores keeps the newer record per key. Guarded to run once --
    // re-adopting our own write would be harmless but pointless.
    function adopt(text: string): void {
        if (root.loaded)
            return;

        root.loaded = true;
        root.settled = true;
        root.store = Store.mergeStores(Store.parse(text), root.store);
        root.refresh();
        root.flush();
    }

    // Give up on the read and take ownership of the file. Needed because a
    // missing file fires no `onLoaded` at all (every first run on a new
    // machine) -- without a deadline, `settled` would stay false forever and
    // nothing would ever get written. A late read is still honoured: adopt()
    // merges whenever it hasn't already run.
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

    // Wrapped: persisting Frecency matters strictly less than the launch that
    // just happened (record() runs from the Action dispatch path), so a
    // failed write (full disk, read-only home) should cost only the
    // accumulated Frecency, not the Action.
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

    // FileView doesn't promise to create the directory it writes into, and on
    // a fresh machine nothing else has. mkdir -p is idempotent, so this runs
    // unconditionally rather than behind a check.
    Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", root.stateDir])

    // How long the read gets before the file is considered ours to overwrite.
    // Costs nothing once the file exists: adopt() settles immediately and this
    // fires into a no-op.
    Timer {
        interval: 2000
        running: true
        repeat: false
        onTriggered: root.settle()
    }

    FileView {
        id: view

        path: root.path

        // No `watchChanges`: this process is the only writer, so watching
        // would just mean re-reading every one of its own writes. A missing
        // file fires no `onLoaded` at all -- the store stays empty and the
        // Launcher ranks on match score alone.
        onLoaded: root.adopt(view.text())
    }
}
