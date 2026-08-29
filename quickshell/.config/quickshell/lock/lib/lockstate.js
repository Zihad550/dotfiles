// The Session Lock's authentication state, as a plain value.
//
// Every function here takes a state and returns a new one; nothing mutates,
// nothing touches QML. LockSurface.qml holds one of these and re-derives what
// it draws from it, so the question "what does the surface do with a wrong
// password" is answerable by tests/lock/lockstate.test.js rather than by
// locking the screen and typing one. See docs/session-lifecycle-spec.md
// (Testing Decisions) for why this seam is the only one the lock gets.
//
// Free of QML types so it loads under a plain JS runtime too, matching
// launcher/lib/*.js.
//
// The phases:
//   idle           the field is live and waiting.
//   authenticating a PAM conversation is in flight; the field is frozen so a
//                  second Return cannot start a second conversation.
//   unlocked       terminal. The surface is on its way out.

var IDLE = "idle";
var AUTHENTICATING = "authenticating";
var UNLOCKED = "unlocked";

var PROMPT = "Enter Password";
var CHECKING = "Checking…";
// Distinct from a rejection on purpose: a wrong password is retyped, a broken
// PAM stack is a trip to docs/ and a TTY.
var UNAVAILABLE = "Authentication unavailable";

function initial() {
    return { phase: IDLE, password: "", failures: 0, message: "" };
}

// Deliberately not `initial()` under another name at the call site: re-locking
// must not carry the previous lock's attempt count or error onto the screen.
function reset(_state) {
    return initial();
}

function acceptsInput(state) {
    return state.phase === IDLE;
}

function canSubmit(state) {
    // An empty submission would still be a PAM attempt, and PAM counts it
    // towards the lockout.
    return state.phase === IDLE && state.password.length > 0;
}

function edit(state, text) {
    if (state.phase !== IDLE)
        return state;

    return {
        phase: state.phase,
        password: String(text),
        failures: state.failures,
        // The count survives; only the message goes. Clearing it on the first
        // keystroke is what makes a retype feel like a retype -- but the field
        // emptying again must not bring the stale message back.
        message: ""
    };
}

function begin(state) {
    if (!canSubmit(state))
        return state;

    return {
        phase: AUTHENTICATING,
        password: state.password,
        failures: state.failures,
        message: ""
    };
}

function fail(state) {
    if (state.phase !== AUTHENTICATING)
        return state;

    var failures = state.failures + 1;
    return {
        phase: IDLE,
        password: "",
        failures: failures,
        message: "Authentication failed (" + failures + ")"
    };
}

function errored(state) {
    if (state.phase !== AUTHENTICATING)
        return state;

    // Not counted: the attempt never reached PAM's verdict, so calling it a
    // failed try would overstate how close the lockout is.
    return {
        phase: IDLE,
        password: "",
        failures: state.failures,
        message: UNAVAILABLE
    };
}

function succeed(state) {
    if (state.phase !== AUTHENTICATING)
        return state;

    return { phase: UNLOCKED, password: "", failures: 0, message: "" };
}

function statusText(state) {
    if (state.phase === AUTHENTICATING)
        return CHECKING;
    if (state.message.length > 0)
        return state.message;
    return PROMPT;
}

// True when statusText is reporting something that went wrong, which is what
// the surface colours red rather than muted.
function statusIsError(state) {
    return state.phase !== AUTHENTICATING && state.message.length > 0;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        IDLE: IDLE,
        AUTHENTICATING: AUTHENTICATING,
        UNLOCKED: UNLOCKED,
        PROMPT: PROMPT,
        CHECKING: CHECKING,
        UNAVAILABLE: UNAVAILABLE,
        initial: initial,
        reset: reset,
        acceptsInput: acceptsInput,
        canSubmit: canSubmit,
        edit: edit,
        begin: begin,
        fail: fail,
        errored: errored,
        succeed: succeed,
        statusText: statusText,
        statusIsError: statusIsError
    };
}
