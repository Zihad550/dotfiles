pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "modules/lib/backlight.js" as Backlight

Singleton {
    id: root

    property var backlightState: Backlight.initialState()
    property bool refreshRequested: false
    property var readResult: null
    property var writeResult: null

    readonly property bool available: backlightState.available
    readonly property int percent: backlightState.percent

    signal confirmed(int percent)

    function refresh(): void {
        if (readProcess.running || writeProcess.running) {
            refreshRequested = true;
            return;
        }
        readResult = null;
        readProcess.command = Backlight.readCommand();
        readProcess.running = true;
    }

    function raise(step: int): void {
        adjust(Math.abs(step));
    }

    function lower(step: int): void {
        adjust(-Math.abs(step));
    }

    // A held key fires faster than brightnessctl can settle. Steps accumulate
    // in pendingAdjustment rather than dropping, so runPendingAdjustment
    // applies the latest total once the in-flight write confirms.
    function adjust(step: int): void {
        if (step === 0)
            return;
        backlightState = Backlight.queueAdjustment(backlightState, step);
        runPendingAdjustment();
    }

    function runPendingAdjustment(): void {
        if (writeProcess.running || readProcess.running)
            return;
        if (backlightState.pendingAdjustment === 0)
            return;
        const adjustment = Backlight.takeAdjustment(backlightState);
        if (!adjustment) {
            refresh();
            return;
        }

        backlightState = adjustment.state;
        writeResult = null;
        writeProcess.command = adjustment.command;
        writeProcess.running = true;
    }

    function runQueuedWork(): void {
        if (refreshRequested) {
            refreshRequested = false;
            refresh();
        } else {
            runPendingAdjustment();
        }
    }

    Process {
        id: readProcess

        stdout: SplitParser {
            onRead: line => root.readResult = Backlight.parse(line)
        }

        stderr: StdioCollector {}

        onExited: exitCode => {
            const outcome = Backlight.settleRead(root.backlightState, exitCode, root.readResult);
            root.backlightState = outcome.state;
            if (outcome.succeeded) {
                root.runQueuedWork();
                return;
            }
            console.warn(`dotfiles: failed to refresh backlight (brightnessctl exited ${exitCode})`);
            // Drain an explicit refresh request (one-shot, bounded) so it
            // isn't stranded by this failure. A queued adjustment is left
            // alone: retrying it here too would spin forever against a
            // backlight that never comes back -- the next adjust()/refresh()
            // call picks it up instead.
            if (root.refreshRequested) {
                root.refreshRequested = false;
                root.refresh();
            }
        }
    }

    Process {
        id: writeProcess

        stdout: SplitParser {
            onRead: line => root.writeResult = Backlight.parse(line)
        }

        stderr: StdioCollector {}

        onExited: exitCode => {
            const outcome = Backlight.settleWrite(root.backlightState, exitCode, root.writeResult);
            root.backlightState = outcome.state;
            if (outcome.confirmedPercent !== null) {
                root.confirmed(outcome.confirmedPercent);
                root.runQueuedWork();
            } else {
                console.warn(`dotfiles: failed to set backlight (brightnessctl exited ${exitCode})`);
                root.refreshRequested = outcome.refresh;
                root.runQueuedWork();
            }
        }
    }

    Component.onCompleted: refresh()
}
