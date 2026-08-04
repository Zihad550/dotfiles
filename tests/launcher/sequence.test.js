// Tests for listOf -- the QML-sequence-to-array copy that Windows.qml and
// Workspaces.qml both read their models through.
//
//     node --test "tests/launcher/*.test.js"
//
// A QML sequence cannot be built under node, but the one property that
// matters can: an array-*like* is an object with a numeric length and integer
// keys, which Array.isArray rejects. That rejection is what two host rounds
// died on, so it is what these pin.

const test = require("node:test");
const assert = require("node:assert");

const Seq = require("../../quickshell/.config/quickshell/launcher/lib/sequence.js");

// What a QML model's `values` looks like from JavaScript: indexable, with a
// length, and not an Array.
function sequence(items) {
    const fake = { length: items.length };
    items.forEach((item, index) => { fake[index] = item; });
    return fake;
}

test("an array-like copies into a real array", () => {
    const values = sequence(["a", "b", "c"]);
    assert.strictEqual(Array.isArray(values), false, "the fixture is only honest if it is not an Array");

    const out = Seq.listOf(values);
    assert.strictEqual(Array.isArray(out), true, "everything downstream can .filter and .map this");
    assert.deepStrictEqual(out, ["a", "b", "c"]);
});

test("a plain array survives unchanged", () => {
    assert.deepStrictEqual(Seq.listOf([1, 2]), [1, 2]);
});

test("an absent model costs an empty list, not an exception", () => {
    assert.deepStrictEqual(Seq.listOf(undefined), [],
        "`Hyprland.toplevels?.values` on a renamed property arrives as undefined");
    assert.deepStrictEqual(Seq.listOf(null), []);
    assert.deepStrictEqual(Seq.listOf({}), [], "no length is not a model");
    assert.deepStrictEqual(Seq.listOf({ length: "3" }), [], "a length that is not a number is not a model either");
});

test("the copy is a copy -- the caller cannot write back into the model", () => {
    const values = sequence(["a"]);
    const out = Seq.listOf(values);
    out.push("b");
    assert.strictEqual(values.length, 1);
});
