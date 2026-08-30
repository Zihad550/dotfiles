// Tests for the logind delay inhibitor the Session Lock holds itself.
//
//     node --test "tests/lock/*.test.js"
//
// The subject is what the lock does between logind announcing sleep and the
// session reporting Secure: hold the machine, release once Secure, and give up
// on its own deadline rather than on logind's. No D-Bus is involved, which is
// the point of the seam (docs/adr/0016-lock-holds-its-own-sleep-inhibitor.md).

const test = require("node:test");
const assert = require("node:assert");

const Sleep = require("../../quickshell/.config/quickshell/lock/lib/sleep.js");

test("the inhibitor is held from the start, before anything announces sleep", () => {
    const state = Sleep.initial();

    assert.strictEqual(Sleep.holdsInhibitor(state), true,
        "a delay inhibitor taken when sleep is announced is already too late -- logind only "
        + "waits for inhibitors registered before the announcement");
    assert.strictEqual(Sleep.awaitingSecure(state), false);
    assert.strictEqual(Sleep.noticePending(state), false);
});

test("an announced sleep keeps holding the machine while the lock secures", () => {
    const state = Sleep.announce(Sleep.initial());

    assert.strictEqual(Sleep.holdsInhibitor(state), true);
    assert.strictEqual(Sleep.awaitingSecure(state), true,
        "the wait is what makes `locked before suspend` a fact rather than a race");
});

test("Secure is what releases the inhibitor", () => {
    const state = Sleep.secured(Sleep.announce(Sleep.initial()));

    assert.strictEqual(Sleep.holdsInhibitor(state), false);
    assert.strictEqual(Sleep.awaitingSecure(state), false);
    assert.strictEqual(Sleep.noticePending(state), false,
        "the machine slept over a Secure session, which is the whole point and not an incident");
});

test("nothing releases the inhibitor before sleep is announced", () => {
    const state = Sleep.initial();

    assert.strictEqual(Sleep.secured(state), state,
        "the session is Secure whenever it is locked, and releasing then would leave the next "
        + "suspend unguarded");
    assert.strictEqual(Sleep.expire(state), state);
});

test("the deadline releases the inhibitor rather than stranding a closed machine", () => {
    const state = Sleep.expire(Sleep.announce(Sleep.initial()));

    assert.strictEqual(Sleep.holdsInhibitor(state), false,
        "logind suspends when its window expires either way; holding on past our own deadline "
        + "only delays a suspend that is going to happen");
    assert.strictEqual(Sleep.noticePending(state), true,
        "a suspend without a Secure session is the one thing nobody can see happen");
});

test("the deadline stays inside the window logind was asked for", () => {
    assert.ok(Sleep.SECURE_BUDGET_MS > 0);
    assert.ok(Sleep.SECURE_BUDGET_MS < Sleep.INHIBIT_DELAY_SECONDS * 1000,
        "a deadline past logind's window is no deadline at all -- logind suspends first");
});

test("a lock that secures after the deadline does not un-notify", () => {
    let state = Sleep.expire(Sleep.announce(Sleep.initial()));
    state = Sleep.secured(state);

    assert.strictEqual(Sleep.noticePending(state), true,
        "the machine was already told it could sleep; securing afterwards does not unexpose "
        + "whatever was on the screen in between");
});

test("resuming takes the inhibitor again, and keeps what has not been reported", () => {
    let state = Sleep.expire(Sleep.announce(Sleep.initial()));
    state = Sleep.resume(state);

    assert.strictEqual(Sleep.holdsInhibitor(state), true,
        "the next suspend needs an inhibitor registered before it is announced");
    assert.strictEqual(Sleep.awaitingSecure(state), false);
    assert.strictEqual(Sleep.noticePending(state), true,
        "the notice is for the screen the session is unlocked into, which is after the resume");
});

test("a delivered notice is not delivered twice", () => {
    const state = Sleep.takeNotice(Sleep.expire(Sleep.announce(Sleep.initial())));

    assert.strictEqual(Sleep.noticePending(state), false);
    assert.strictEqual(Sleep.holdsInhibitor(state), false,
        "reporting the failure is not what re-arms the inhibitor -- the resume is");
});

test("taking a notice that is not pending changes nothing", () => {
    const state = Sleep.initial();

    assert.strictEqual(Sleep.takeNotice(state), state);
});

test("a repeated announcement is the same sleep, not a second one", () => {
    const announced = Sleep.announce(Sleep.initial());

    assert.strictEqual(Sleep.announce(announced), announced);
});

test("sleep announced after the inhibitor is gone cannot take it back", () => {
    const released = Sleep.secured(Sleep.announce(Sleep.initial()));

    assert.strictEqual(Sleep.announce(released), released,
        "logind has already been told it may suspend; re-arming here would be an inhibitor it "
        + "never agreed to wait for");
});

test("the sleep announcement is read off the signal, and resumes are told apart", () => {
    const announcement = "/org/freedesktop/login1: org.freedesktop.login1.Manager.PrepareForSleep (true,)";
    const resumed = "/org/freedesktop/login1: org.freedesktop.login1.Manager.PrepareForSleep (false,)";

    assert.strictEqual(Sleep.signalValue(announcement), true);
    assert.strictEqual(Sleep.signalValue(resumed), false,
        "false is the resume, and mistaking it for a suspend locks the session on every wake");
    assert.strictEqual(
        Sleep.signalValue("/org/freedesktop/login1: org.freedesktop.login1.Manager.SessionNew ('3',)"),
        null,
        "the monitor carries every signal the manager emits, and only this one means sleep");
    assert.strictEqual(Sleep.signalValue("Monitoring signals on object /org/freedesktop/login1"), null,
        "gdbus greets before it reports anything");
    assert.strictEqual(Sleep.signalValue(""), null);
});
