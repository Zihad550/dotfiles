// What the Session Lock holds, as a plain value.
//
// lockstate.js is the password field; this is the lock itself -- requested,
// Secure, or neither. Every function takes a state and returns a new one, so
// the progression is answerable by tests/lock/session.test.js rather than by
// locking a screen and watching what happens.
//
// This owns one of the three lock-state signals ADR 0017 keeps apart: the
// runtime state file shell callers read. The other two -- the compositor's
// report of a monitor blocked by a lock, and logind's hint -- are not state
// this module derives anything from. `lockedHint` is written out for outside
// consumers and read back by nothing here.
//
// Free of QML types so it loads under a plain JS runtime too, matching
// launcher/lib/*.js.

// The three values the state file can hold. `requested` is not a weaker
// `secure`: it is the window in which the session is going down but the
// compositor has not yet said the surfaces are up, which is exactly the window
// suspending must not happen in.
var UNLOCKED = "unlocked";
var REQUESTED = "requested";
var SECURE = "secure";

var COMPOSITOR_UNLOCKED = "unlocked";
var COMPOSITOR_LOCKED = "locked";
var COMPOSITOR_UNDETERMINED = "undetermined";

var STATE_FILE = "df-lock-state";

function initial() {
    return { requested: false, held: false, secure: false };
}

function request(state) {
    if (state.requested)
        return state;

    return { requested: true, held: state.held, secure: state.secure };
}

// The compositor's answer: `held` is the lock being active, `secure` its
// promise that every surface is up and nothing behind them is reachable.
function observe(state, held, secure) {
    // A lock that was accepted and is now gone is over, whatever this process
    // still thinks it asked for -- the compositor can end one on its own, and a
    // request left standing would publish `requested` over a live session.
    if (state.held && !held)
        return initial();

    return { requested: state.requested, held: !!held, secure: !!secure };
}

function release(state) {
    if (!isLocked(state))
        return state;

    return initial();
}

function phase(state) {
    if (state.secure)
        return SECURE;
    if (state.requested || state.held)
        return REQUESTED;
    return UNLOCKED;
}

function isLocked(state) {
    return phase(state) !== UNLOCKED;
}

// Omarchy shell/plugins/lock/Service.qml,
// revision 83881e979b35468c3e7d60b171e319ede61a88fd.
function shouldAcquire(state, screens) {
    if (!state.requested || state.held || state.secure)
        return false;

    return (screens || []).some(function(screen) {
        return screen && screen.name && screen.width > 0 && screen.height > 0;
    });
}

// Omarchy bin/omarchy-hyprland-session-locked,
// revision 83881e979b35468c3e7d60b171e319ede61a88fd.
function compositorLockReport(text) {
    var monitors;
    try {
        monitors = JSON.parse(text);
    } catch (_) {
        return COMPOSITOR_UNDETERMINED;
    }

    if (!Array.isArray(monitors) || monitors.length === 0)
        return COMPOSITOR_UNDETERMINED;

    var hasConclusiveMonitor = false;
    for (var i = 0; i < monitors.length; i++) {
        var blockers = monitors[i] && Array.isArray(monitors[i].solitaryBlockedBy)
            ? monitors[i].solitaryBlockedBy
            : [];
        if (blockers.indexOf("LOCK") !== -1)
            return COMPOSITOR_LOCKED;
        if (blockers.indexOf("WORKSPACE") === -1)
            hasConclusiveMonitor = true;
    }

    return hasConclusiveMonitor ? COMPOSITOR_UNLOCKED : COMPOSITOR_UNDETERMINED;
}

function isStranded(state, report) {
    return report === COMPOSITOR_LOCKED && !isLocked(state);
}

// Whether the compositor is actually covering the screens. Not the same
// question as isLocked: a lock stays `requested` for as long as no screen
// exists to take it, and nothing is covered in the meantime. Anything that has
// to be seen has to ask this rather than isLocked, which would hold it back
// forever behind a lock that never arrived.
function coversScreens(state) {
    return !!(state.held || state.secure);
}

// What the state file holds. Trailing newline so `cat` and `read` both behave.
function fileText(state) {
    return phase(state) + "\n";
}

// Set as soon as the session is locked rather than once it is Secure: the hint
// answers "is this session in use", and a session on its way down is not.
function lockedHint(state) {
    return isLocked(state);
}

// logind's `session/self` follows the detached busctl helper, not the
// graphical session that launched Quickshell. Target the inherited session.
function logindSessionPath(sessionId) {
    if (!sessionId)
        return null;

    var component = "";
    for (var i = 0; i < sessionId.length; i++) {
        var character = sessionId[i];
        var allowed = /[A-Za-z]/.test(character)
            || (i > 0 && /[0-9]/.test(character));
        component += allowed
            ? character
            : "_" + character.charCodeAt(0).toString(16).padStart(2, "0");
    }

    return "/org/freedesktop/login1/session/" + component;
}

// What a fresh instance should write, given whatever the last one left behind,
// or null to leave the file alone. A non-unlocked answer is a lock the
// compositor may still be holding for a client that is gone -- and a Stranded
// Lock is still the truth about the screen. Claiming `unlocked` over one is the
// single direction this file must never be wrong in.
function startupText(previousText) {
    var previous = String(previousText || "").trim();
    if (previous === REQUESTED || previous === SECURE)
        return null;

    return fileText(initial());
}

// Runtime, not ~/.local/state: a file that survives the boot is a stale answer
// waiting to be read. Fallback mirrors bin/df-launch-special-workspace.
function statePath(runtimeDir, tmpDir) {
    var dir = runtimeDir && runtimeDir.length > 0 ? runtimeDir : (tmpDir || "/tmp");
    return dir + "/" + STATE_FILE;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        UNLOCKED: UNLOCKED,
        REQUESTED: REQUESTED,
        SECURE: SECURE,
        COMPOSITOR_UNLOCKED: COMPOSITOR_UNLOCKED,
        COMPOSITOR_LOCKED: COMPOSITOR_LOCKED,
        COMPOSITOR_UNDETERMINED: COMPOSITOR_UNDETERMINED,
        STATE_FILE: STATE_FILE,
        initial: initial,
        request: request,
        observe: observe,
        release: release,
        phase: phase,
        isLocked: isLocked,
        coversScreens: coversScreens,
        shouldAcquire: shouldAcquire,
        compositorLockReport: compositorLockReport,
        isStranded: isStranded,
        fileText: fileText,
        lockedHint: lockedHint,
        logindSessionPath: logindSessionPath,
        startupText: startupText,
        statePath: statePath
    };
}
