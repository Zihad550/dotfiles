import QtQuick
import Quickshell
import qs.modules
import qs.media as Upstream

// Isolated rendering probe: no notification server or live playback actions.
ShellRoot {
    Upstream.Service { id: service }
    PanelWindow {
        implicitWidth: 360
        implicitHeight: 400
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
                    canGoNext: true, canGoPrevious: true, canTogglePlaying: true,
                    identity: "Preview player"
                })
                readonly property var browser: ({
                    identity: "Browser", trackTitle: "Another media source", isPlaying: false
                })
                readonly property var sourcePlayers: [fixture, browser]
                function playerKey(player) { return player.identity }
                function runAction(action) {
                    if (action === "playPause") activePlayer.isPlaying = !activePlayer.isPlaying
                }
                function selectPlayer(key) {
                    activePlayer = key === "Browser" ? browser : fixture
                }
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
            if (!widget.visible || widget.width <= 0 || !previewService.activePlayer) {
                console.error("MEDIA_CONTROLS_FAIL: mock player controls did not load");
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_CONTROLS_PASS");
        }
    }
    Timer {
        interval: 2200
        running: true
        onTriggered: {
            previewService.selectPlayer("Browser");
            if (previewService.activePlayer !== previewService.browser) {
                console.error("MEDIA_SOURCE_SWITCH_FAIL: browser was not selected");
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_SOURCE_SWITCH_PASS");
        }
    }
    Timer {
        interval: 2800
        running: true
        onTriggered: {
            previewService.selectPlayer("Preview player");
            if (previewService.activePlayer !== previewService.fixture) {
                console.error("MEDIA_SOURCE_SWITCH_FAIL: preview player was not selected");
                Qt.exit(1);
                return;
            }
            console.log("MEDIA_SOURCE_RESTORE_PASS");
        }
    }
    Timer {
        interval: 1500
        running: true
        onTriggered: {
            const output = Quickshell.env("MEDIA_PROBE_IMAGE");
            if (!output) return;
            widget.grabToImage(result => result.saveToFile(output));
        }
    }
}
