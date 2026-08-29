// Tests for the Session Lock's authentication state machine.
//
//     node --test "tests/lock/*.test.js"
//
// The subject is behaviour, not shape: what the surface accepts, what it says,
// and how a wrong password differs from a broken one. None of it needs a
// compositor, a display or a password -- which is the whole reason the logic
// lives in lib/lockstate.js rather than inside LockSurface.qml.

const test = require("node:test");
const assert = require("node:assert");

const Lock = require("../../quickshell/.config/quickshell/lock/lib/lockstate.js");

test("a fresh state takes input and offers the prompt", () => {
    const state = Lock.initial();

    assert.strictEqual(state.phase, Lock.IDLE);
    assert.strictEqual(state.password, "");
    assert.strictEqual(state.failures, 0);
    assert.ok(Lock.acceptsInput(state));
    assert.strictEqual(Lock.statusText(state), Lock.PROMPT);
});

test("typing is kept and an empty password is not submittable", () => {
    let state = Lock.edit(Lock.initial(), "hunter2");

    assert.strictEqual(state.password, "hunter2");
    assert.ok(Lock.canSubmit(state));

    state = Lock.edit(state, "");
    assert.strictEqual(Lock.canSubmit(state), false,
        "an empty field must not start a PAM conversation -- PAM would count it as a try");
});

test("submitting moves to authenticating, which refuses further input", () => {
    const state = Lock.begin(Lock.edit(Lock.initial(), "hunter2"));

    assert.strictEqual(state.phase, Lock.AUTHENTICATING);
    assert.strictEqual(state.password, "hunter2", "the password is still needed to answer PAM's prompt");
    assert.strictEqual(Lock.acceptsInput(state), false);
    assert.strictEqual(Lock.canSubmit(state), false, "a second Return must not start a second conversation");
    assert.strictEqual(Lock.statusText(state), "Checking…");
});

test("editing while authenticating changes nothing", () => {
    const state = Lock.begin(Lock.edit(Lock.initial(), "hunter2"));

    assert.deepStrictEqual(Lock.edit(state, "typed under the check"), state);
});

test("a rejected password is reported, counted, and clears the field", () => {
    let state = Lock.fail(Lock.begin(Lock.edit(Lock.initial(), "wrong")));

    assert.strictEqual(state.phase, Lock.IDLE, "a rejection returns the field, it does not wedge it");
    assert.strictEqual(state.password, "");
    assert.strictEqual(state.failures, 1);
    assert.strictEqual(Lock.statusText(state), "Authentication failed (1)");

    state = Lock.fail(Lock.begin(Lock.edit(state, "wrong again")));
    assert.strictEqual(state.failures, 2);
    assert.strictEqual(Lock.statusText(state), "Authentication failed (2)",
        "the count is the only thing distinguishing a typo from a lockout coming");
});

test("typing after a rejection clears the message but keeps the count", () => {
    const failed = Lock.fail(Lock.begin(Lock.edit(Lock.initial(), "wrong")));
    const typed = Lock.edit(failed, "r");

    assert.strictEqual(Lock.statusText(typed), Lock.PROMPT);
    assert.strictEqual(typed.failures, 1, "the tally survives -- PAM's does");
});

test("clearing the field back to empty leaves the message cleared", () => {
    const failed = Lock.fail(Lock.begin(Lock.edit(Lock.initial(), "wrong")));

    assert.strictEqual(Lock.statusText(Lock.edit(Lock.edit(failed, "r"), "")), Lock.PROMPT);
});

test("a PAM error reads differently from a wrong password", () => {
    const state = Lock.errored(Lock.begin(Lock.edit(Lock.initial(), "hunter2")));

    assert.strictEqual(state.phase, Lock.IDLE);
    assert.strictEqual(state.password, "");
    assert.strictEqual(Lock.statusText(state), "Authentication unavailable",
        "a broken PAM stack is not a wrong password, and saying so is the difference "
        + "between retyping and reaching for the runbook");
    assert.strictEqual(state.failures, 0, "an error is not an attempt, so it must not count towards lockout");
});

test("a correct password unlocks and leaves nothing behind", () => {
    const failed = Lock.fail(Lock.begin(Lock.edit(Lock.initial(), "wrong")));
    const state = Lock.succeed(Lock.begin(Lock.edit(failed, "right")));

    assert.strictEqual(state.phase, Lock.UNLOCKED);
    assert.strictEqual(state.password, "");
    assert.strictEqual(state.failures, 0);
    assert.strictEqual(state.message, "");
    assert.strictEqual(Lock.acceptsInput(state), false, "an unlocked surface is on its way out");
});

test("reset returns a fresh state, so a re-lock never shows the last attempt", () => {
    const used = Lock.fail(Lock.begin(Lock.edit(Lock.initial(), "wrong")));

    assert.deepStrictEqual(Lock.reset(used), Lock.initial());
});

test("late PAM answers for an abandoned attempt are ignored", () => {
    const idle = Lock.initial();

    assert.deepStrictEqual(Lock.fail(idle), idle);
    assert.deepStrictEqual(Lock.errored(idle), idle);
    assert.deepStrictEqual(Lock.succeed(idle), idle,
        "a success arriving after the attempt was abandoned must not unlock");
});
