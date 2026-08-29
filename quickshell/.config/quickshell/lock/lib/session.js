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

// What the state file holds. Trailing newline so `cat` and `read` both behave.
function fileText(state) {
    return phase(state) + "\n";
}

// Set as soon as the session is locked rather than once it is Secure: the hint
// answers "is this session in use", and a session on its way down is not.
function lockedHint(state) {
    return isLocked(state);
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
        STATE_FILE: STATE_FILE,
        initial: initial,
        request: request,
        observe: observe,
        release: release,
        phase: phase,
        isLocked: isLocked,
        fileText: fileText,
        lockedHint: lockedHint,
        startupText: startupText,
        statePath: statePath
    };
}
