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

    function applyConfirmedState(result): void {
        backlightState = Backlight.confirm(backlightState, result);
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
            if (exitCode === 0 && root.readResult) {
                root.applyConfirmedState(root.readResult);
                root.runQueuedWork();
            } else {
                root.backlightState = Backlight.readFailed(root.backlightState);
                console.warn(`dotfiles: failed to refresh backlight (brightnessctl exited ${exitCode})`);
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
            if (exitCode === 0 && root.writeResult) {
                root.applyConfirmedState(root.writeResult);
                root.confirmed(root.percent);
                root.runQueuedWork();
            } else {
                console.warn(`dotfiles: failed to set backlight (brightnessctl exited ${exitCode})`);
                root.refreshRequested = true;
                root.runQueuedWork();
            }
        }
    }

    Component.onCompleted: refresh()
}
