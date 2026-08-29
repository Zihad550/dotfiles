pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "lib/session.js" as Session

// The Session Lock, as its own always-running Quickshell instance -- the third
// alongside the bar's `dotfiles` config and the Launcher's.
//
// Isolation is the reason it is not a module in either: `df-qs-restart` exists
// to be used, and a QML fault in a bar module must not be able to drop a live
// lock. See docs/session-lifecycle-spec.md (Implementation Decisions).
//
// Restart with `df-qs-restart lock`; read this instance's log with
// `qs -c lock log` (`-f` follows). Lock it with
// `qs -c lock ipc call lock lock` -- from a shell that has WAYLAND_DISPLAY,
// since `qs -c` matches on the display too and says `No running instances`
// without it. The runbook's TTY section covers that.
//
// The appearance and the PAM conversation live in LockSurface.qml, which is
// also what the `lock-probe` config renders (`df-qs-test lock-probe`) in an
// ordinary window -- so iterating on the lock cannot lock anyone out.
//
// What this file adds on top of that surface is the lock itself: the
// compositor's session lock, the IPC command that takes it, and the three
// signals that report it (ADR 0017). Deferral, monitor attach and Stranded Lock
// recovery are a separate change.
//
// The WlSessionLock arrangement follows Omarchy's shell/plugins/lock/Service.qml,
// read at revision 83881e979b35468c3e7d60b171e319ede61a88fd; the state file and
// its command-only IPC are this repo's, and have no upstream counterpart.
ShellRoot {
    id: root

    property var session: Session.initial()

    // What is already on disk and already told to logind. `session` changes on
    // transitions these two do not see -- taking the lock leaves the phase at
    // `requested` -- and republishing an unchanged answer costs a blocking write.
    property string publishedText: ""
    property bool publishedHint: false
    readonly property string logindSessionPath: Session.logindSessionPath(
        Quickshell.env("XDG_SESSION_ID")) || ""

    // `session`'s own initialiser fires onSessionChanged, and it fires before
    // Component.onCompleted -- so without this the first thing written is
    // `unlocked`, over whatever the last instance left behind.
    property bool publishing: false

    property bool strandedLockResolved: false

    function queueSessionLock(): void {
        pendingSessionLockTimer.start();
        sessionLockStabilizeTimer.restart();
    }

    function requestSessionLock(): void {
        if (sessionLockStabilizeTimer.running)
            return;

        if (!Session.shouldAcquire(root.session, Quickshell.screens)) {
            if (root.session.requested && !sessionLock.locked)
                pendingSessionLockTimer.start();
            return;
        }

        pendingSessionLockTimer.stop();
        sessionLock.locked = true;

        if (!sessionLock.locked) {
            console.warn("df lock: the compositor refused the session lock");
            root.unlock();
        }
    }

    // `qs -c lock ipc call lock lock`. Idempotent: a repeat while locked is a
    // second press of the keybind, not a second lock.
    function lock(): void {
        const next = Session.request(root.session);
        if (next === root.session)
            return;

        // Fresh: the previous lock's failure count and message must not come
        // up on the screen with this one.
        lockAuth.reset();

        root.session = next;
        root.queueSessionLock();
    }

    function unlock(): void {
        // The compositor first: publishing `unlocked` over surfaces that are
        // still up points df-power at a confirmation that cannot render above a
        // lock (ADR 0015).
        sessionLock.locked = false;
        sessionLockStabilizeTimer.stop();
        pendingSessionLockTimer.stop();
        root.session = Session.release(root.session);
    }

    function syncFromCompositor(): void {
        root.session = Session.observe(root.session, sessionLock.locked, sessionLock.secure);
    }

    onSessionChanged: root.publish()

    // The two published signals ADR 0017 keeps apart, written where a
    // transition is known to have happened. The third -- the compositor's
    // report of a blocked monitor -- belongs to Stranded Lock detection.
    function publish(): void {
        if (!root.publishing)
            return;

        // Blocking and atomic: no reader ever sees a half-written file, and the
        // answer is on disk before the transition is observable anywhere else.
        // That is also what makes an abnormal exit safe -- see the runbook.
        const text = Session.fileText(root.session);
        if (text !== root.publishedText) {
            root.publishedText = text;
            stateFile.setText(text);
        }

        const hint = Session.lockedHint(root.session);
        if (hint === root.publishedHint)
            return;

        root.publishedHint = hint;
        if (root.logindSessionPath.length === 0) {
            console.warn("df lock: XDG_SESSION_ID is unset; cannot publish logind's locked hint");
            return;
        }

        // For outside consumers; read by nothing here. Detached because a
        // logind that refuses the hint must not hold up a lock.
        Quickshell.execDetached(["busctl", "--system", "--quiet", "call",
            "org.freedesktop.login1", root.logindSessionPath,
            "org.freedesktop.login1.Session", "SetLockedHint", "b",
            hint ? "true" : "false"]);
    }

    // One conversation for the whole lock, not one per screen -- see
    // LockAuth.qml. It outlives the surfaces, which the protocol creates and
    // destroys with each lock.
    LockAuth {
        id: lockAuth

        onUnlocked: root.unlock()
    }

    WlSessionLock {
        id: sessionLock

        locked: false

        onLockStateChanged: root.syncFromCompositor()
        onSecureStateChanged: root.syncFromCompositor()

        // One of these per screen, created and destroyed by the compositor's
        // protocol -- which is what covers a second monitor without this file
        // knowing how many there are.
        WlSessionLockSurface {
            // Painted before the surface's content is, so an unthemed flash on
            // the way up does not show the session underneath.
            color: "black"

            LockSurface {
                anchors.fill: parent

                auth: lockAuth

                // Not while merely requested: keystrokes before the compositor
                // calls the surface Secure are not guaranteed to be exclusive
                // to it, and the first one would be the start of a password.
                inputEnabled: sessionLock.secure
            }
        }
    }

    // Omarchy shell/plugins/lock/Service.qml,
    // revision 83881e979b35468c3e7d60b171e319ede61a88fd.
    Timer {
        id: sessionLockStabilizeTimer
        interval: 500
        onTriggered: root.requestSessionLock()
    }

    Timer {
        id: pendingSessionLockTimer
        interval: 100
        repeat: true
        onTriggered: root.requestSessionLock()
    }

    Connections {
        target: Quickshell

        function onScreensChanged(): void {
            if (root.session.requested && !sessionLock.locked)
                root.queueSessionLock();
            strandedLockRetryTimer.rearm();
            root.checkStrandedLock();
        }
    }

    // Omarchy shell/plugins/lock/Service.qml and bin/omarchy-hyprland-session-locked,
    // revision 83881e979b35468c3e7d60b171e319ede61a88fd.
    function checkStrandedLock(): void {
        if (root.strandedLockResolved || strandedLockCheck.running)
            return;

        strandedLockCheck.running = true;
    }

    Process {
        id: strandedLockCheck
        command: ["hyprctl", "-j", "monitors"]

        stdout: StdioCollector {
            id: stdout
        }
        stderr: StdioCollector {}

        onExited: {
            const report = Session.compositorLockReport(stdout.text);
            if (report === Session.COMPOSITOR_UNDETERMINED)
                return;

            root.strandedLockResolved = true;
            strandedLockRetryTimer.stop();
            if (Session.isStranded(root.session, report)) {
                console.warn("df lock: recovering Stranded Lock");
                root.lock();
            }
        }
    }

    Timer {
        id: strandedLockRetryTimer
        interval: 500
        repeat: true
        property int remaining: 20

        function rearm(): void {
            if (root.strandedLockResolved)
                return;

            remaining = 20;
            start();
        }

        onTriggered: {
            remaining -= 1;
            if (remaining <= 0) {
                stop();
                return;
            }
            root.checkStrandedLock();
        }
    }

    // Where shell callers learn whether the session is locked. bin/df-power
    // will read it once its call site moves; it runs from a keybind at the lock
    // screen, where nothing can render feedback, so it cannot ask a process
    // (ADR 0017).
    FileView {
        id: stateFile

        path: Session.statePath(Quickshell.env("XDG_RUNTIME_DIR") || "", Quickshell.env("TMPDIR") || "")
        // Reads block too: startup adopts what the last instance left behind,
        // and an async answer would arrive after the decision it informs.
        blockLoading: true
        blockWrites: true
        atomicWrites: true
        printErrors: false
    }

    IpcHandler {
        target: "lock"

        // Commands only. A caller that needs state reads the state file: `qs
        // ipc call` exits zero against a target that does not exist, so a
        // question asked here has a wrong answer indistinguishable from a
        // right one (ADR 0017).
        function lock(): void {
            root.lock();
        }
    }

    Component.onCompleted: {
        // This instance holds no lock -- but a previous one may have died still
        // holding one, and the compositor keeps that up. startupText() decides
        // whether saying so is safe.
        const startup = Session.startupText(stateFile.text());
        root.publishing = true;

        strandedLockRetryTimer.rearm();
        root.checkStrandedLock();

        if (startup === null) {
            console.warn(`df lock: leaving ${stateFile.path} as the last instance left it`);
            return;
        }

        root.publishedText = startup;
        stateFile.setText(startup);
    }
}
