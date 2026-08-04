// Tests for the calculator Provider's pure half -- which Queries it answers,
// what it makes of qalc's output, which result belongs to which Query, and what
// it hands to the clipboard.
//
//     node --test "tests/launcher/*.test.js"
//
// Everything the container can check about ticket 09's calculator is here. The
// two things it cannot are the two that need a machine: qalc actually running
// (checkbox 1) and the clipboard actually receiving the result (checkbox 2).
// What is left -- the narrowing rule, the staleness rule, the argv -- is
// precisely where the failures that look like nothing at all live.

const test = require("node:test");
const assert = require("node:assert");

const Calc = require("../../quickshell/.config/quickshell/launcher/lib/calc.js");

const provider = { label: "calc" };

// A settled result for `query`, in the shape entriesFor takes.
function answered(query, text) {
    return { query: query, text: text };
}

test("a Query with an operator and a digit is one to calculate", () => {
    assert.equal(Calc.wanted("2+2"), true);
    assert.equal(Calc.wanted("125 * 4"), true);
    assert.equal(Calc.wanted("10 cm to inch"), true);
});

test("an empty Query is not", () => {
    assert.equal(Calc.wanted(""), false);
    assert.equal(Calc.wanted("   "), false);
});

test("a Query shorter than three characters is not", () => {
    // Elephant's min_chars, default 3 (providers/calc/setup.go:47 -- that
    // checkout is deleted with ticket 19). Without it
    // every single digit typed on the way to a longer Query spawns a qalc.
    assert.equal(Calc.wanted("2"), false);
    assert.equal(Calc.wanted("42"), false);
    assert.equal(Calc.wanted("1+1"), true);
});

test("a Query with no digit in it is not", () => {
    // require_number, default true (setup.go:46). This is the rule that keeps
    // the calculator out of the pool for the overwhelming majority of Queries:
    // an application name has no digit in it.
    assert.equal(Calc.wanted("firefox"), false);
    assert.equal(Calc.wanted("zed editor"), false);
    assert.equal(Calc.wanted("restart"), false);
});

test("the argv runs qalc in terse mode", () => {
    assert.deepEqual(Calc.argvOf("2+2"), ["qalc", "-t", "2+2"]);
});

test("a result is qalc's output, trimmed", () => {
    assert.equal(Calc.resultOf("4\n", "2+2"), "4");
    assert.equal(Calc.resultOf("  3.93701 in  \n", "10 cm to inch"), "3.93701 in");
});

test("no output is no result", () => {
    assert.equal(Calc.resultOf("", "2+2"), "");
    assert.equal(Calc.resultOf("   \n", "2+2"), "");
});

test("qalc echoing the Query back is no result", () => {
    // What qalc does with something it cannot evaluate: it hands the input
    // back. An Entry saying "1password" whose primary Action copies the string
    // you just typed is the silent no-op this whole module is shaped to avoid.
    assert.equal(Calc.resultOf("1password\n", "1password"), "");
    assert.equal(Calc.resultOf("1password\n", "  1password  "), "");
});

test("an error line is no result", () => {
    assert.equal(Calc.resultOf("error: Unknown function or unit.\n", "2+wat"), "");
    assert.equal(Calc.resultOf("Error: division by zero\n", "1/0"), "");
});

test("a settled result produces one Entry, showing the result over the Query", () => {
    const entries = Calc.entriesFor("2+2", answered("2+2", "4"), provider);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "4");
    assert.equal(entries[0].subtext, "2+2");
    assert.equal(entries[0].provider, provider);
    assert.equal(entries[0].target.result, "4");
});

test("the Entry carries no Entry Key, so nothing accumulates Frecency", () => {
    // Checkbox 4. A sum is not a thing chosen again -- "2+2" today and "2+2"
    // next month are the same string and not the same act -- so there is
    // nothing for usage to accumulate against. Frecency.record treats a missing
    // key as a no-op, so opting out is leaving the field off rather than a
    // special case anywhere else.
    const entries = Calc.entriesFor("2+2", answered("2+2", "4"), provider);
    assert.equal(entries[0].key, undefined);
});

test("a result belonging to an older Query is not shown", () => {
    // The trap the whole staleness rule exists for: qalc runs are asynchronous,
    // so typing "12*" then "12*3" can land the first process's answer after the
    // second's. Tagging each result with the Query it was launched for makes
    // "the calculator sometimes shows the wrong answer" impossible rather than
    // rare.
    assert.deepEqual(Calc.entriesFor("12*3", answered("12*", "12"), provider), []);
});

test("no result yet is no Entry", () => {
    // Rather than a "calculating…" placeholder. A row whose primary Action has
    // nothing to copy is a key that does nothing, which is the one failure this
    // Provider must not have; qalc answers in milliseconds, so what this costs
    // is a frame.
    assert.deepEqual(Calc.entriesFor("2+2", answered("2+2", ""), provider), []);
    assert.deepEqual(Calc.entriesFor("2+2", null, provider), []);
});

test("a Query not worth calculating yields no Entry even with a result in hand", () => {
    // Checkbox 5, from the other side: the narrowing rule is not only about
    // whether to spawn qalc. A result left over from a Query that has since
    // become one the calculator does not answer must not keep a row alive.
    assert.deepEqual(Calc.entriesFor("firefox", answered("firefox", "firefox"), provider), []);
    assert.deepEqual(Calc.entriesFor("", answered("", "0"), provider), []);
});

test("the result reaches the clipboard through stdin, not argv", () => {
    // A negative result is the reason. `wl-copy -5` is wl-copy being handed
    // what looks like flags, and it fails or copies something else; piping
    // sidesteps the question entirely, which is what bin/df-screenshot-copy
    // (deleted with ticket 19) did.
    const argv = Calc.copyArgv("-5");

    assert.equal(argv[0], "sh");
    assert.equal(argv[1], "-c");
    assert.equal(argv[argv.length - 1], "-5");
    assert.match(argv[2], /wl-copy/);

    // The result arrives as a positional argument rather than interpolated into
    // the script, so a result containing a quote cannot become shell syntax.
    assert.ok(argv[2].indexOf("-5") < 0);
});

test("a result with shell metacharacters in it is still copied verbatim", () => {
    const argv = Calc.copyArgv('$(rm -rf ~) "quoted"');
    assert.equal(argv[argv.length - 1], '$(rm -rf ~) "quoted"');
    assert.ok(argv[2].indexOf("rm -rf") < 0);
});
