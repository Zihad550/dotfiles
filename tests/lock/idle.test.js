// Idle Ladder decisions, with no compositor or clock involved.
//
//     node --test tests/lock/idle.test.js

// QML supplies elapsed time and carries out the returned transitions. This
// module decides which Stages have fired and what activity must unwind.

const test = require("node:test");
const assert = require("node:assert");

const Idle = require("../../quickshell/.config/quickshell/lock/lib/idle.js");

const timings = { dim: 120, lock: 1800, blank: 1830, suspend: 1860 };

test("Stages fire once, in configured order, as elapsed time crosses them", () => {
    let state = Idle.initial(timings);

    let transition = Idle.advance(state, 119, false);
    assert.deepStrictEqual(transition.entered, []);

    transition = Idle.advance(transition.state, 120, false);
    assert.deepStrictEqual(transition.entered, [Idle.DIM]);

    transition = Idle.advance(transition.state, 1830, false);
    assert.deepStrictEqual(transition.entered, [Idle.LOCK, Idle.BLANK]);

    transition = Idle.advance(transition.state, 2000, false);
    assert.deepStrictEqual(transition.entered, [Idle.SUSPEND]);

    transition = Idle.advance(transition.state, 3000, false);
    assert.deepStrictEqual(transition.entered, [], "a Stage fires only once in an idle cycle");
});

test("activity unwinds every fired Stage in reverse order", () => {
    const idled = Idle.advance(Idle.initial(timings), 2000, false).state;
    const transition = Idle.resetOnActivity(idled);

    assert.deepStrictEqual(transition.exited,
        [Idle.SUSPEND, Idle.BLANK, Idle.LOCK, Idle.DIM]);
    assert.deepStrictEqual(transition.state, Idle.initial(timings));
});

test("activity only unwinds Stages which fired", () => {
    const dimmed = Idle.advance(Idle.initial(timings), 120, false).state;

    assert.deepStrictEqual(Idle.resetOnActivity(dimmed).exited, [Idle.DIM]);
});

test("application inhibition suppresses the whole ladder", () => {
    let transition = Idle.advance(Idle.initial(timings), 2000, true);
    assert.deepStrictEqual(transition.entered, []);

    transition = Idle.advance(transition.state, 2000, false);
    assert.deepStrictEqual(transition.entered,
        [Idle.DIM, Idle.LOCK, Idle.BLANK, Idle.SUSPEND]);
});

test("a disabled Stage is absent without changing the other timings", () => {
    const devbox = { dim: null, lock: 1800, blank: 1830, suspend: null };
    const transition = Idle.advance(Idle.initial(devbox), 2000, false);

    assert.deepStrictEqual(transition.entered, [Idle.LOCK, Idle.BLANK]);
});

test("invalid or unordered timings are rejected", () => {
    assert.throws(() => Idle.initial({ dim: 20, lock: 10, blank: 30, suspend: 40 }),
        /configured order/);
    assert.throws(() => Idle.initial({ dim: -1, lock: 10, blank: 30, suspend: 40 }),
        /non-negative/);
});
