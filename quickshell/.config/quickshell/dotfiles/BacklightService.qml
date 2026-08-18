pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "modules/lib/backlight.js" as Backlight

Singleton {
    id: root

    property bool available: false
    property int percent: 0
    property int maximum: 0
    property string device: ""

    property int pendingAdjustment: 0
    property bool refreshRequested: false
    property var readResult: null
    property var writeResult: null

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
        pendingAdjustment += step;
        runPendingAdjustment();
    }

    function runPendingAdjustment(): void {
        if (writeProcess.running || readProcess.running)
            return;
        if (!available || maximum < 1) {
            refresh();
            return;
        }

        const target = Math.max(0, Math.min(100, percent + pendingAdjustment));
        pendingAdjustment = 0;
        writeResult = null;
        writeProcess.command = Backlight.writeCommand(Backlight.rawForPercent(target, maximum));
        writeProcess.running = true;
    }

    function accept(result): void {
        device = result.device;
        maximum = result.maximum;
        percent = Backlight.percentForRaw(result.current, result.maximum);
        available = true;
    }

    function continueWork(): void {
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
                root.accept(root.readResult);
                root.continueWork();
            } else {
                root.available = false;
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
                root.accept(root.writeResult);
                root.confirmed(root.percent);
                root.continueWork();
            } else {
                console.warn(`dotfiles: failed to set backlight (brightnessctl exited ${exitCode})`);
                root.refreshRequested = true;
                root.continueWork();
            }
        }
    }

    Component.onCompleted: refresh()
}
