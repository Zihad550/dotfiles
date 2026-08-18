import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/directoryindex.js" as Index

// The one persistent owner of Directory Index loading, scan policy,
// persistence observation, and versioned publication. It is shared state,
// not a Provider: Providers consume snapshot paths and own only Entries.
QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string cachePath: Index.cachePath(root.home)

    property var _snapshot: ({ paths: [], revision: 0 })
    readonly property var snapshot: root._snapshot

    function access(): void {
        Quickshell.execDetached(Index.accessCommand(root.home));
    }

    function adopt(text): void {
        const checked = Index.candidate(text, root.home);
        if (!checked.ok) {
            console.warn("launcher: Directory Index rejected persisted data:", checked.error);
            return;
        }

        const published = Index.publish(root._snapshot, text, root.home);
        if (published === root._snapshot)
            return;

        root._snapshot = published;
        console.log("launcher: Directory Index published revision", published.revision,
            "with", published.paths.length, "path(s)");
    }

    Component.onCompleted: root.access()

    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath
        watchChanges: true
        printErrors: false
        onFileChanged: cacheView.reload()
        onLoaded: root.adopt(cacheView.text())
    }
}
