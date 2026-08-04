// Tests for prefix routing's pure half -- which Provider a leading character
// names, what is left of the Query once it is stripped, and the collision
// check that runs once when the pool is built.
//
//     node --test "tests/launcher/*.test.js"
//
// Ticket 11's own checkboxes, one test group per line. What this file cannot
// close: that Calculator.qml and WebSearch.qml actually declare "=" and "@" as
// their own `prefix` -- that is QML wiring, host-verified the same way
// Launcher.qml's placement of the two is in ticket 09.

const test = require("node:test");
const assert = require("node:assert");

const Routing = require("../../quickshell/.config/quickshell/launcher/lib/routing.js");

const apps = { label: "applications" };
const windows = { label: "windows" };
const calc = { label: "calculator", prefix: "=" };
const websearch = { label: "web search", prefix: "@" };

const POOL = [apps, windows, calc, websearch];

test("a leading prefix routes the Query to exactly one Provider", () => {
    const routed = Routing.route(POOL, "=1234*7");

    assert.equal(routed.provider, calc);
    assert.equal(routed.query, "1234*7");
});

test("a different prefix routes to a different Provider", () => {
    const routed = Routing.route(POOL, "@how tall is a giraffe");

    assert.equal(routed.provider, websearch);
    assert.equal(routed.query, "how tall is a giraffe");
});

test("a prefix with nothing after it strips down to an empty Query", () => {
    const routed = Routing.route(POOL, "=");

    assert.equal(routed.provider, calc);
    assert.equal(routed.query, "");
});

test("prefixes are declared by the Provider itself, not looked up in a table", () => {
    // No provider named "calc" or "@" appears anywhere in routing.js -- the
    // caller can hand it any objects with a `prefix` and a `label`, invented
    // here rather than reused from POOL, and routing follows them.
    const custom = [{ label: "one", prefix: "%" }, { label: "two", prefix: "&" }];

    assert.equal(Routing.route(custom, "%five").provider, custom[0]);
    assert.equal(Routing.route(custom, "&six").provider, custom[1]);
});

test("no prefix in the Query leaves every Provider in play", () => {
    const routed = Routing.route(POOL, "firefox");

    assert.equal(routed.provider, null);
    assert.equal(routed.query, "firefox");
});

test("deleting back past the prefix returns to the default pool", () => {
    // route() keeps no memory of the keystroke before -- this is that claim,
    // exercised as the sequence a backspace actually produces: "=1", then "="
    // alone, then "" once the prefix itself is gone.
    assert.equal(Routing.route(POOL, "=1").provider, calc);
    assert.equal(Routing.route(POOL, "=").provider, calc);

    const afterBackspace = Routing.route(POOL, "");
    assert.equal(afterBackspace.provider, null);
    assert.equal(afterBackspace.query, "");
});

test("a prefix matching no Provider is treated as ordinary Query text", () => {
    // Checkbox 5's own wording: not swallowed. The leading "!" survives into
    // `query` untouched, the same as if it were any other character.
    const routed = Routing.route(POOL, "!nonexistent");

    assert.equal(routed.provider, null);
    assert.equal(routed.query, "!nonexistent");
});

test("a Provider that declares an empty prefix is never matched", () => {
    // Leaving `prefix` unset is the documented way to opt out; an empty string
    // is not treated as a synonym for that, because it would match every Query.
    const withEmpty = [{ label: "everything", prefix: "" }];

    const routed = Routing.route(withEmpty, "anything");

    assert.equal(routed.provider, null);
    assert.equal(routed.query, "anything");
});

test("two Providers claiming the same prefix is caught, not resolved silently", () => {
    const clashing = [calc, { label: "duplicate", prefix: "=" }];

    const found = Routing.problems(clashing);

    assert.equal(found.length, 1);
    assert.match(found[0], /"="/);
    assert.match(found[0], /calculator/);
    assert.match(found[0], /duplicate/);
});

test("distinct prefixes report no problems", () => {
    assert.deepEqual(Routing.problems(POOL), []);
});

test("a Provider declaring no prefix at all is not a collision with another that does", () => {
    assert.deepEqual(Routing.problems([apps, windows, calc]), []);
});
