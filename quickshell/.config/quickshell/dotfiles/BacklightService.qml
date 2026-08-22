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
    // Set for the duration of the in-flight write only; distinguishes a
    // slider's absolute request from a media key's relative one so the OSD
    // fires for the latter alone.
    property string writeOrigin: ""

    readonly property bool available: backlightState.available
    readonly property int percent: backlightState.percent
    // The optimistic value Quick Settings displays: the slider's latest
    // requested target ahead of hardware confirmation, or `percent` once
    // reconciled.
    readonly property int requested: backlightState.requested

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
    // in pendingAdjustment rather than dropping, so runPendingWrite applies
    // the latest total once the in-flight write confirms.
    function adjust(step: int): void {
        if (step === 0)
            return;
        backlightState = Backlight.queueAdjustment(backlightState, step);
        runPendingWrite();
    }

    // The Quick Settings slider's absolute counterpart to adjust(): a rapid
    // drag only ever produces one more write, and the final requested
    // position always wins.
    function setAbsolute(percent: int): void {
        if (!backlightState.available)
            return;
        backlightState = Backlight.queueTarget(backlightState, percent);
        runPendingWrite();
    }

    function runPendingWrite(): void {
        if (writeProcess.running || readProcess.running)
            return;

        if (backlightState.pendingTarget !== null) {
            const absolute = Backlight.takeAbsolute(backlightState);
            if (!absolute) {
                refresh();
                return;
            }
            backlightState = absolute.state;
            writeOrigin = "slider";
            writeResult = null;
            writeProcess.command = absolute.command;
            writeProcess.running = true;
            return;
        }

        if (backlightState.pendingAdjustment === 0)
            return;
        const adjustment = Backlight.takeAdjustment(backlightState);
        if (!adjustment) {
            refresh();
            return;
        }

        backlightState = adjustment.state;
        writeOrigin = "key";
        writeResult = null;
        writeProcess.command = adjustment.command;
        writeProcess.running = true;
    }

    function runQueuedWork(): void {
        if (refreshRequested) {
            refreshRequested = false;
            refresh();
        } else {
            runPendingWrite();
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
            const origin = root.writeOrigin;
            root.writeOrigin = "";
            root.backlightState = outcome.state;
            if (outcome.confirmedPercent !== null) {
                // Slider changes stay visible in the panel only -- raising
                // the OSD too would be a second, redundant feedback surface.
                if (origin === "key")
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
