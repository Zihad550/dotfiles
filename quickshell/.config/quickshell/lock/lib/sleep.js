// The logind delay inhibitor the Session Lock holds for itself.
//
// The lock is both the thing holding the machine and the thing that has to
// become Secure, so "am I Secure yet" is a local property and the upstream's
// watcher, IPC budget and status polling have nothing left to do -- see
// docs/adr/0016-lock-holds-its-own-sleep-inhibitor.md. What survives that is a
// three-value progression: holding, holding while the lock secures, released.
//
// Free of QML types so it loads under a plain JS runtime too, matching
// launcher/lib/*.js and session.js beside it.

// Holding the machine with nothing pending, holding it while the session
// secures, and released -- logind may suspend from here.
var HOLDING = "holding";
var SECURING = "securing";
var RELEASED = "released";

// How long the lock will hold the machine after logind announces sleep. Copied
// from Omarchy's budget cap (bin/omarchy-system-sleep-lock, revision
// 83881e979b35468c3e7d60b171e319ede61a88fd), which leaves logind a fifth of the
// window below to act on the release.
var SECURE_BUDGET_MS = 12000;

// What the drop-in in setup/arch-hyprland/setup-packages/setup-sleep-inhibit
// asks logind for, asserted against it in tests/lock/wiring.test.js. A budget
// past this window is not a budget: logind suspends when the window expires
// whether the session is Secure or not.
var INHIBIT_DELAY_SECONDS = 15;

function initial() {
    return { phase: HOLDING, unsecuredNotice: false };
}

function announce(state) {
    if (state.phase !== HOLDING)
        return state;

    return { phase: SECURING, unsecuredNotice: state.unsecuredNotice };
}

function secured(state) {
    if (state.phase !== SECURING)
        return state;

    return { phase: RELEASED, unsecuredNotice: state.unsecuredNotice };
}

// The deadline is the lock's own, held well inside logind's: a broken lock
// costs seconds of suspend, not a closed laptop awake in a bag.
function expire(state) {
    if (state.phase !== SECURING)
        return state;

    return { phase: RELEASED, unsecuredNotice: true };
}

// A resume arriving while the lock is still securing means logind stopped
// waiting for us and slept anyway -- its window is shorter than the one the
// drop-in asks for, or it has not reloaded that drop-in yet. The session was
// exposed exactly as an expired budget would have left it, so it is reported
// the same way. An aborted suspend reaches here too and is reported as well:
// this is the direction to be wrong in.
function resume(state) {
    return {
        phase: HOLDING,
        unsecuredNotice: state.unsecuredNotice || awaitingSecure(state)
    };
}

function holdsInhibitor(state) {
    return state.phase !== RELEASED;
}

function awaitingSecure(state) {
    return state.phase === SECURING;
}

function noticePending(state) {
    return !!state.unsecuredNotice;
}

function takeNotice(state) {
    if (!state.unsecuredNotice)
        return state;

    return { phase: state.phase, unsecuredNotice: false };
}

// One line of the logind signal monitor: true for the suspend announcement,
// false for the resume, null for everything else it prints -- its greeting, and
// every other signal the manager emits.
//
//     /org/freedesktop/login1: org.freedesktop.login1.Manager.PrepareForSleep (true,)
function signalValue(line) {
    var text = String(line || "");
    if (text.indexOf("PrepareForSleep") === -1)
        return null;
    if (/\(\s*true\s*,?\s*\)/.test(text))
        return true;
    if (/\(\s*false\s*,?\s*\)/.test(text))
        return false;

    return null;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        HOLDING: HOLDING,
        SECURING: SECURING,
        RELEASED: RELEASED,
        SECURE_BUDGET_MS: SECURE_BUDGET_MS,
        INHIBIT_DELAY_SECONDS: INHIBIT_DELAY_SECONDS,
        initial: initial,
        announce: announce,
        secured: secured,
        expire: expire,
        resume: resume,
        holdsInhibitor: holdsInhibitor,
        awaitingSecure: awaitingSecure,
        noticePending: noticePending,
        takeNotice: takeNotice,
        signalValue: signalValue
    };
}
