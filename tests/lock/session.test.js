// Tests for what the Session Lock holds, as opposed to what its password field
// is doing (lockstate.test.js).
//
//     node --test "tests/lock/*.test.js"
//
// The subject is the progression from requested to Secure and what each step
// publishes to the state file ADR 0017 makes the answer for shell callers. No
// compositor is involved, which is the point of the seam.

const test = require("node:test");
const assert = require("node:assert");

const Session = require("../../quickshell/.config/quickshell/lock/lib/session.js");

test("a fresh session holds nothing and publishes unlocked", () => {
    const state = Session.initial();

    assert.strictEqual(Session.phase(state), Session.UNLOCKED);
    assert.strictEqual(Session.isLocked(state), false);
    assert.strictEqual(Session.fileText(state), "unlocked\n");
});

test("requesting a lock is not yet Secure, and says so", () => {
    const state = Session.request(Session.initial());

    assert.strictEqual(Session.phase(state), Session.REQUESTED);
    assert.ok(Session.isLocked(state), "the session is on its way down and callers must treat it as locked");
    assert.notStrictEqual(Session.phase(state), Session.SECURE,
        "suspending here is the race the Secure distinction exists to prevent");
    assert.strictEqual(Session.fileText(state), "requested\n");
});

test("the compositor confirming the surfaces is what makes it Secure", () => {
    let state = Session.request(Session.initial());
    state = Session.observe(state, true, false);
    assert.strictEqual(Session.phase(state), Session.REQUESTED);

    state = Session.observe(state, true, true);
    assert.strictEqual(Session.phase(state), Session.SECURE);
    assert.strictEqual(Session.fileText(state), "secure\n");
});

test("a second lock request while locked changes nothing", () => {
    const locked = Session.observe(Session.request(Session.initial()), true, true);

    assert.strictEqual(Session.request(locked), locked,
        "the IPC lock command is fired from four call sites and a keybind repeats");
});

test("unlocking returns to unlocked", () => {
    let state = Session.observe(Session.request(Session.initial()), true, true);
    state = Session.release(state);

    assert.deepStrictEqual(state, Session.initial());
    assert.strictEqual(Session.fileText(state), "unlocked\n");
});

test("releasing an already-unlocked session changes nothing", () => {
    const state = Session.initial();

    assert.strictEqual(Session.release(state), state);
});

test("the compositor dropping a lock this process asked for ends the lock", () => {
    let state = Session.observe(Session.request(Session.initial()), true, true);
    state = Session.observe(state, false, false);

    assert.deepStrictEqual(state, Session.initial(),
        "an unlock can come from the compositor's own path, and a request left standing "
        + "would publish `requested` over an unlocked session forever");
});

test("a lock not yet accepted by the compositor stays requested", () => {
    const state = Session.observe(Session.request(Session.initial()), false, false);

    assert.strictEqual(Session.phase(state), Session.REQUESTED,
        "the compositor has not answered yet -- treating silence as a drop would abandon "
        + "the request before it was ever made");
});

test("logind's hint follows the lock, not the Secure distinction", () => {
    assert.strictEqual(Session.lockedHint(Session.initial()), false);
    assert.strictEqual(Session.lockedHint(Session.request(Session.initial())), true,
        "outside consumers are told the session is locked as soon as it is going down");
});

test("logind's object path names the graphical session explicitly", () => {
    assert.strictEqual(Session.logindSessionPath("3"),
        "/org/freedesktop/login1/session/_33");
    assert.strictEqual(Session.logindSessionPath("c2"),
        "/org/freedesktop/login1/session/c2");
    assert.strictEqual(Session.logindSessionPath(""), null,
        "without XDG_SESSION_ID, session/self would target the detached helper's session");
});

test("a fresh instance publishes unlocked over nothing and over unlocked", () => {
    assert.strictEqual(Session.startupText(""), "unlocked\n");
    assert.strictEqual(Session.startupText("unlocked\n"), "unlocked\n");
});

test("a fresh instance leaves a lock the last one died holding alone", () => {
    assert.strictEqual(Session.startupText("secure\n"), null,
        "the compositor keeps a Stranded Lock up after its client is gone, so `secure` is "
        + "still the truth about the screen");
    assert.strictEqual(Session.startupText("requested\n"), null);
});

test("the state file lives in the runtime directory, not a persistent one", () => {
    assert.strictEqual(Session.statePath("/run/user/1000", "/tmp"), "/run/user/1000/df-lock-state");
    assert.strictEqual(Session.statePath("", "/tmp"), "/tmp/df-lock-state",
        "a state file that outlives the boot is a stale answer waiting to be read");
});
