import QtQuick
import Quickshell
import qs.modules
import qs.media as Upstream

// Isolated rendering probe: no notification server or live playback actions.
ShellRoot {
    Upstream.Service { id: service }
    PanelWindow {
        implicitWidth: 400
        implicitHeight: 30
        color: "#1e1e2e"
        Media {
            id: widget
            anchors.centerIn: parent
            service: QtObject {
                id: previewService
                property var activePlayer: null
                readonly property var fixture: ({
                    trackTitle: "Media port preview", trackArtist: "Omarchy",
                    trackAlbum: "Playback controls", isPlaying: true,
                    canGoNext: true, canGoPrevious: true, canTogglePlaying: true
                })
                readonly property var sourcePlayers: [activePlayer, {
                    identity: "Browser", trackTitle: "Another media source", isPlaying: false
                }]
                function playerKey(player) { return player.trackTitle }
                function runAction() {}
            }
        }
    }
    Timer {
        interval: 6000
        running: true
        onTriggered: {
            const shell = Qt.createComponent("shell.qml");
            if (shell.status === Component.Error) {
                console.error(shell.errorString());
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_PROBE_OK", service.statusJson());
            Qt.quit();
        }
    }
    Timer {
        interval: 200
        running: true
        onTriggered: previewService.activePlayer = previewService.fixture
    }
    Timer {
        interval: 500
        running: true
        onTriggered: {
            if (!widget.visible || !widget.children[0].visible || widget.width <= 0) {
                console.error("MEDIA_VISIBILITY_FAIL: player appeared but widget is hidden");
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_VISIBILITY_PASS");
            widget.children[0].popupOpen = true;
        }
    }
    Timer {
        interval: 2200
        running: true
        onTriggered: {
            widget.children[0].close();
            previewService.activePlayer = null;
        }
    }
    Timer {
        interval: 2400
        running: true
        onTriggered: {
            if (widget.visible) {
                console.error("MEDIA_VISIBILITY_FAIL: widget remains visible without media");
                Qt.exit(1);
                return;
            }
            previewService.activePlayer = previewService.fixture;
        }
    }
    Timer {
        interval: 2800
        running: true
        onTriggered: {
            if (!widget.visible || !widget.children[0].visible || widget.width <= 0) {
                console.error("MEDIA_VISIBILITY_FAIL: returning player is hidden");
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_REAPPEAR_PASS");
        }
    }
    Timer {
        interval: 1500
        running: true
        onTriggered: {
            const output = Quickshell.env("MEDIA_PROBE_IMAGE");
            if (!output) return;
            const items = widget.children[0].data;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.anchorItem !== undefined && item.open) {
                    item.contentItem[0].parent.parent.grabToImage(result => result.saveToFile(output));
                    break;
                }
            }
        }
    }
}
