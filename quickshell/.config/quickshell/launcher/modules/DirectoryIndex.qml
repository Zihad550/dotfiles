import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/directoryindex.js" as Index

QtObject {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string cachePath: Index.cachePath(root.home)

    property var _snapshot: ({ paths: [], revision: 0 })
    readonly property var snapshot: root._snapshot

    function access(): void {
        if (!accessor.running) {
            accessor.command = Index.accessCommand(root.home);
            accessor.running = true;
        }
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

    readonly property Process accessor: Process {
        id: accessor

        onExited: cacheView.reload()
    }

    readonly property FileView cacheFile: FileView {
        id: cacheView

        path: root.cachePath
        watchChanges: true
        printErrors: false
        onFileChanged: cacheView.reload()
        onLoaded: root.adopt(cacheView.text())
    }
}
