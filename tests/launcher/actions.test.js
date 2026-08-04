// Tests for the Core Action vocabulary -- which key reaches which Action, and
// what the Launcher does afterwards.
//
//     node --test "tests/launcher/*.test.js"
//
// This is the seam where "the same key does the same kind of thing in every
// Provider" is either true or not, and it is not observable from the outside:
// a chord that resolves to nothing and a chord that resolves to an Action doing
// nothing look identical while the Launcher sits there. So the mapping is a
// pure function over a declared table, and the cases that would otherwise cost
// a host round trip -- Shift held on Return, a letter that must stay Query
// text, an unfilled slot -- are named below.

const test = require("node:test");
const assert = require("node:assert");

const A = require("../../quickshell/.config/quickshell/launcher/lib/actions.js");

// Qt key codes, spelled out here rather than imported, so a test that passes
// against the wrong number is impossible to write by copying the module.
const KEY_ESCAPE = 0x01000000;
const KEY_TAB = 0x01000001;
const KEY_BACKSPACE = 0x01000003;
const KEY_RETURN = 0x01000004;
const KEY_ENTER = 0x01000005;
const KEY_W = 0x57;

const SHIFT = 0x02000000;
const CONTROL = 0x04000000;
const ALT = 0x08000000;

function press(key, modifiers) {
    return { key: key, modifiers: modifiers || 0 };
}

// A Provider, as far as this module is concerned: something with `actions`.
function provider(actions) {
    return { label: "test", actions: actions };
}

function noop() {}

test("Return is the primary chord, and the numpad's Enter is the same chord", () => {
    assert.strictEqual(A.chordOf(press(KEY_RETURN)), "Return");
    assert.strictEqual(A.chordOf(press(KEY_ENTER)), "Return");
});

test("Shift on Return is a different chord from Return", () => {
    assert.strictEqual(A.chordOf(press(KEY_RETURN, SHIFT)), "Shift+Return");
    assert.notStrictEqual(A.chordOf(press(KEY_RETURN, SHIFT)), A.chordOf(press(KEY_RETURN)));
});

test("modifiers are named in one order, whatever order they were pressed in", () => {
    assert.strictEqual(A.chordOf(press(KEY_W, CONTROL)), "Ctrl+W");
    assert.strictEqual(A.chordOf(press(KEY_W, CONTROL | SHIFT)), "Ctrl+Shift+W");
    assert.strictEqual(A.chordOf(press(KEY_W, SHIFT | CONTROL)), "Ctrl+Shift+W");
    assert.strictEqual(A.chordOf(press(KEY_W, ALT | CONTROL)), "Ctrl+Alt+W");
});

test("a bare letter is Query text, not a chord", () => {
    // The rule that keeps typing working: without it a Provider could bind `w`
    // and swallow every w someone types. A letter becomes reachable only once
    // Ctrl or Alt says it is not text.
    assert.strictEqual(A.chordOf(press(KEY_W)), "");
});

test("a capital letter is still Query text -- Shift alone is not a chord", () => {
    // Shift is how a capital is typed, so a rule that took *any* modifier would
    // swallow every capital and present as a broken keyboard. Shift counts only
    // alongside Ctrl or Alt, and on a key that is not a letter at all.
    assert.strictEqual(A.chordOf(press(KEY_W, SHIFT)), "");
    assert.strictEqual(A.chordOf(press(KEY_W, CONTROL | SHIFT)), "Ctrl+Shift+W");
    assert.strictEqual(A.chordOf(press(KEY_RETURN, SHIFT)), "Shift+Return");
});

test("Backspace is never a chord, modified or not", () => {
    // Deliberately unreachable: Backspace belongs to the Query, and ticket 11
    // spends it on deleting back past a prefix. A Provider must not be able to
    // take it.
    assert.strictEqual(A.chordOf(press(KEY_BACKSPACE)), "");
    assert.strictEqual(A.chordOf(press(KEY_BACKSPACE, CONTROL)), "");
});

test("Tab is the mark chord", () => {
    assert.strictEqual(A.chordOf(press(KEY_TAB)), "Tab");
});

test("the same chord reaches the same slot in every Provider", () => {
    const applications = provider({ primary: { label: "launch", invoke: noop } });
    const windows = provider({ primary: { label: "switch to", invoke: noop } });

    const chord = A.chordOf(press(KEY_RETURN));

    assert.strictEqual(A.resolve(applications, chord).slot, "primary");
    assert.strictEqual(A.resolve(windows, chord).slot, "primary");

    // Same slot, same key -- and the label is the Provider's own, which is what
    // makes the footer say "launch" over an application and "switch to" over a
    // window.
    assert.strictEqual(A.resolve(applications, chord).label, "launch");
    assert.strictEqual(A.resolve(windows, chord).label, "switch to");
});

test("an unfilled slot resolves to nothing rather than erroring", () => {
    const applications = provider({ primary: { label: "launch", invoke: noop } });

    assert.strictEqual(A.resolve(applications, "Shift+Return"), null);
});

test("an unfilled back slot resolves to nothing, so Escape can still dismiss", () => {
    // Not a special case in the shell: Escape resolving to nothing is what lets
    // the key go unaccepted and reach the window's own dismissal. "Unfilled
    // slot does nothing" and "Escape still dismisses" are the same rule.
    const applications = provider({ primary: { label: "launch", invoke: noop } });

    assert.strictEqual(A.resolve(applications, "Escape"), null);
});

test("a Provider with no actions at all offers none", () => {
    assert.strictEqual(A.resolve({ label: "empty" }, "Return"), null);
    assert.deepStrictEqual(A.available({ label: "empty" }), []);
    assert.strictEqual(A.resolve(null, "Return"), null);
});

test("a slot filled with something that cannot be invoked is not filled", () => {
    const broken = provider({ primary: { label: "launch" } });

    assert.strictEqual(A.resolve(broken, "Return"), null);
});

test("an Action closes the Launcher unless it asks for something else", () => {
    const p = provider({
        primary: { label: "launch", invoke: noop },
        secondary: { label: "close window", invoke: noop, after: "refresh" }
    });

    assert.strictEqual(A.resolve(p, "Return").after, "close");
    assert.strictEqual(A.resolve(p, "Shift+Return").after, "refresh");
});

test("back stays open by default, because leaving a Provider is not leaving the Launcher", () => {
    const p = provider({ back: { label: "up a level", invoke: noop } });

    assert.strictEqual(A.resolve(p, "Escape").after, "stay");
});

test("an outcome nobody declared falls back to the slot's own default", () => {
    const p = provider({
        primary: { label: "launch", invoke: noop, after: "AsyncReload" },
        back: { label: "up a level", invoke: noop, after: "AsyncReload" }
    });

    // Walker's spelling, or a typo (the old launcher is gone -- ticket 19 --
    // but its outcome names live on in muscle memory and in this table).
    // Falling back to the slot's default rather
    // than to a second hardcoded answer is what stops a typo in a directory
    // Provider dismissing the Launcher instead of going up a level.
    assert.strictEqual(A.resolve(p, "Return").after, "close");
    assert.strictEqual(A.resolve(p, "Escape").after, "stay");
});

test("what the Launcher does next is asked, not compared against a string", () => {
    const p = provider({
        primary: { label: "launch", invoke: noop },
        secondary: { label: "close window", invoke: noop, after: "refresh" },
        back: { label: "up a level", invoke: noop }
    });

    assert.ok(A.wantsClose(A.resolve(p, "Return")));
    assert.ok(!A.wantsRefresh(A.resolve(p, "Return")));

    assert.ok(A.wantsRefresh(A.resolve(p, "Shift+Return")));
    assert.ok(!A.wantsClose(A.resolve(p, "Shift+Return")));

    // `stay` is neither, which is the whole of what it means.
    assert.ok(!A.wantsClose(A.resolve(p, "Escape")));
    assert.ok(!A.wantsRefresh(A.resolve(p, "Escape")));

    // And an unresolved chord is not an instruction to do either.
    assert.ok(!A.wantsClose(null));
    assert.ok(!A.wantsRefresh(null));
});

test("available lists the filled Actions with the Provider's labels, core order first", () => {
    const p = provider({
        back: { label: "up a level", invoke: noop },
        primary: { label: "open", invoke: noop },
        extras: [{ chord: "Ctrl+W", label: "close window", invoke: noop }]
    });

    assert.deepStrictEqual(A.available(p).map(action => [action.chord, action.label]), [
        ["Return", "open"],
        ["Escape", "up a level"],
        ["Ctrl+W", "close window"]
    ]);
});

test("an extra Action beyond the core set is reachable by its own chord", () => {
    const p = provider({
        primary: { label: "switch to", invoke: noop },
        extras: [{ chord: "Ctrl+W", label: "close window", invoke: noop, after: "refresh" }]
    });

    const found = A.resolve(p, A.chordOf(press(KEY_W, CONTROL)));

    assert.strictEqual(found.label, "close window");
    assert.strictEqual(found.after, "refresh");
    assert.strictEqual(found.slot, "");
});

test("the windows Provider's declared shape resolves as written", () => {
    // The literal declaration from Windows.qml, checked here rather than only
    // on the host: the Provider is QML and cannot be loaded under node, so this
    // is the one place a typo in the chord or the outcome is caught by
    // something other than pressing the key and watching nothing happen.
    const windows = provider({
        primary: { label: "switch to", invoke: noop },
        extras: [{ chord: "Ctrl+W", label: "close window", invoke: noop, after: "refresh" }]
    });

    assert.deepStrictEqual(A.available(windows).map(action => [action.chord, action.label, action.after]), [
        ["Return", "switch to", "close"],
        ["Ctrl+W", "close window", "refresh"]
    ]);

    // And the chord is one a key press actually produces, which is the failure
    // that would otherwise advertise the key in the footer and do nothing.
    assert.strictEqual(A.chordOf(press(KEY_W, CONTROL)), "Ctrl+W");
    assert.ok(A.wantsRefresh(A.resolve(windows, "Ctrl+W")));
    assert.ok(!A.wantsClose(A.resolve(windows, "Ctrl+W")));
});

test("an extra claiming a core chord is dropped rather than shadowing the slot", () => {
    const p = provider({
        primary: { label: "launch", invoke: noop },
        extras: [{ chord: "Return", label: "something else", invoke: noop }]
    });

    assert.strictEqual(A.resolve(p, "Return").label, "launch");
    assert.deepStrictEqual(A.available(p).map(action => action.label), ["launch"]);
});

test("two extras claiming one chord keep the first rather than picking silently", () => {
    const p = provider({
        extras: [
            { chord: "Ctrl+W", label: "first", invoke: noop },
            { chord: "Ctrl+W", label: "second", invoke: noop }
        ]
    });

    assert.strictEqual(A.resolve(p, "Ctrl+W").label, "first");
});

test("an extra on a chord no key press produces is dropped, not advertised", () => {
    // The worst failure this module can have, reached from the Provider's side:
    // a hand-written chord that renders in the footer -- so the key is
    // advertised -- and resolves to nothing when pressed.
    const p = provider({
        extras: [
            { chord: "Ctrl+w", label: "lowercase", invoke: noop },
            { chord: "Shift+Ctrl+W", label: "wrong order", invoke: noop },
            { chord: "F2", label: "a key the Launcher does not name", invoke: noop },
            { chord: "Ctrl+Delete", label: "same", invoke: noop },
            { chord: "W", label: "a letter with nothing held", invoke: noop }
        ]
    });

    assert.deepStrictEqual(A.available(p), []);
});

test("every chord chordOf produces is one an extra may be declared on", () => {
    // The round trip, in the direction that matters: what the keyboard emits
    // and what a Provider may write are the same set.
    assert.ok(A.isChord(A.chordOf(press(KEY_RETURN))));
    assert.ok(A.isChord(A.chordOf(press(KEY_RETURN, SHIFT))));
    assert.ok(A.isChord(A.chordOf(press(KEY_ESCAPE))));
    assert.ok(A.isChord(A.chordOf(press(KEY_TAB))));
    assert.ok(A.isChord(A.chordOf(press(KEY_W, CONTROL))));
    assert.ok(A.isChord(A.chordOf(press(KEY_W, CONTROL | ALT | SHIFT))));
});

test("an extra with no chord or no way to invoke it is dropped", () => {
    const p = provider({
        extras: [
            { label: "no chord", invoke: noop },
            { chord: "Ctrl+K", label: "no invoke" }
        ]
    });

    assert.deepStrictEqual(A.available(p), []);
    assert.strictEqual(A.resolve(p, "Ctrl+K"), null);
});

test("the core chords read as symbols and anything else reads as itself", () => {
    assert.strictEqual(A.hintOf("Return"), "⏎");
    assert.strictEqual(A.hintOf("Shift+Return"), "⇧⏎");
    assert.strictEqual(A.hintOf("Escape"), "esc");
    assert.strictEqual(A.hintOf("Tab"), "tab");
    assert.strictEqual(A.hintOf("Ctrl+W"), "Ctrl+W");
});

test("a click means the primary slot, and finds the same chord Return does", () => {
    // The pointer has no modifiers to build a chord out of, so it asks for the
    // slot by name. Both routes have to land on one Action or clicking and
    // pressing Enter can quietly do different things.
    assert.strictEqual(A.chordFor("primary"), A.chordOf(press(KEY_RETURN)));
    assert.strictEqual(A.chordFor("back"), "Escape");
    assert.strictEqual(A.chordFor("mark"), A.chordOf(press(KEY_TAB)));
});

test("the core slots are declared once, in the order the footer shows them", () => {
    assert.deepStrictEqual(A.core().map(slot => [slot.slot, slot.chord]), [
        ["primary", "Return"],
        ["secondary", "Shift+Return"],
        ["mark", "Tab"],
        ["back", "Escape"]
    ]);
});

test("mark stays open by default, because toggling a selection is not leaving the Launcher", () => {
    const p = provider({ mark: { label: "mark", invoke: noop } });

    assert.strictEqual(A.resolve(p, "Tab").after, "stay");
});

test("a Provider that fills mark advertises it in the footer, between secondary and back", () => {
    const p = provider({
        primary: { label: "copy image", invoke: noop },
        secondary: { label: "copy path", invoke: noop },
        mark: { label: "mark", invoke: noop },
        back: { label: "up", invoke: noop }
    });

    assert.deepStrictEqual(A.available(p).map(action => action.slot), ["primary", "secondary", "mark", "back"]);
});

test("a Provider that leaves mark unfilled does nothing on Tab", () => {
    const applications = provider({ primary: { label: "launch", invoke: noop } });

    assert.strictEqual(A.resolve(applications, "Tab"), null);
});

test("every Action except back and mark counts as choosing the Entry", () => {
    // What Frecency accumulates against. Counting `back` would teach the store
    // that a sub-menu's parent is the most-used thing there is; counting `mark`
    // would teach it that every screenshot ticked on the way to picking two of
    // them was chosen too.
    const p = provider({
        primary: { label: "open", invoke: noop },
        secondary: { label: "open with", invoke: noop },
        mark: { label: "mark", invoke: noop },
        back: { label: "up", invoke: noop },
        extras: [{ chord: "Ctrl+W", label: "close", invoke: noop, after: "refresh" }]
    });

    assert.deepStrictEqual(
        A.available(p).filter(A.counts).map(action => action.chord),
        ["Return", "Shift+Return", "Ctrl+W"]);

    assert.strictEqual(A.counts(A.resolve(p, "Escape")), false);
    assert.strictEqual(A.counts(A.resolve(p, "Tab")), false);
});

test("a chord that reached no Action counts as nothing", () => {
    // resolve() returns null for a slot no Provider filled, and the shell hands
    // that straight on rather than checking first.
    assert.strictEqual(A.counts(null), false);
    assert.strictEqual(A.counts(undefined), false);
});
