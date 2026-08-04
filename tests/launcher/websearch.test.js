// Tests for the web search Provider's pure half -- which Queries leave the
// machine, what URL they become, and the rule that keeps a search row from
// appearing over things the Launcher can actually answer.
//
//     node --test "tests/launcher/*.test.js"
//
// The narrowing rule is the whole of this Provider's design, so it is the whole
// of this file. What the container cannot check is the browser opening
// (checkbox 3's second half).

const test = require("node:test");
const assert = require("node:assert");

const Web = require("../../quickshell/.config/quickshell/launcher/lib/websearch.js");

const provider = { label: "websearch" };
const PREFIX = ["uwsm-app", "--"];

// The two states the Launcher puts this Provider in: something else answered,
// or nothing did.
const ANSWERED = true;
const UNANSWERED = false;

test("a Query nothing else answered becomes a search Entry", () => {
    const entries = Web.entriesFor("how tall is a giraffe", UNANSWERED, provider);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "Search: how tall is a giraffe");
    assert.equal(entries[0].provider, provider);
});

test("a Query something else answered produces nothing", () => {
    // Checkbox 5, and the reason this Provider is consulted last rather than
    // ranked. "fir" is a Query with a local answer; a search row above or
    // beside Firefox is the flooding the checkbox names.
    assert.deepEqual(Web.entriesFor("fir", ANSWERED, provider), []);
});

test("an empty Query produces nothing either way", () => {
    // score() matches everything against an empty needle, so an unguarded
    // Provider would put a permanent row in the list the Launcher shows before
    // anything is typed.
    assert.deepEqual(Web.entriesFor("", UNANSWERED, provider), []);
    assert.deepEqual(Web.entriesFor("   ", UNANSWERED, provider), []);
});

test("the search URL is the engine's, with the Query encoded into it", () => {
    const entries = Web.entriesFor("tsc noEmit", UNANSWERED, provider);
    assert.equal(entries[0].target.url, "https://www.google.com/search?q=tsc%20noEmit");
});

test("a Query with URL syntax in it is encoded rather than pasted", () => {
    // The failure this prevents is a Query containing `&` or `#` silently
    // truncating the search at the browser.
    const entries = Web.entriesFor("a&b#c=d", UNANSWERED, provider);
    assert.equal(entries[0].target.url, "https://www.google.com/search?q=a%26b%23c%3Dd");
});

test("a Query that is a link is offered as a link", () => {
    // Elephant's own rule (providers/websearch/setup.go:249-260 -- that
    // checkout is deleted with ticket 19): a Query that
    // parses as a URL is something to open, not something to search for.
    const entries = Web.entriesFor("github.com/quickshell-mirror", UNANSWERED, provider);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "Open: https://github.com/quickshell-mirror");
    assert.equal(entries[0].target.url, "https://github.com/quickshell-mirror");
});

test("a link keeps the scheme it was typed with", () => {
    const entries = Web.entriesFor("http://localhost:3000", UNANSWERED, provider);
    assert.equal(entries[0].target.url, "http://localhost:3000");
});

test("a link is offered even when something else answered", () => {
    // The asymmetry is deliberate and it is elephant's: a link is not a
    // fallback. Typing a URL is unambiguous, so it does not wait for the pool
    // to come up empty the way a search does.
    const entries = Web.entriesFor("github.com", ANSWERED, provider);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].target.url, "https://github.com");
});

test("what is not a link", () => {
    // A host has to have a dot in it, or be localhost, and a Query with a space
    // in it is prose. Without the dot rule every single word typed would be
    // offered as a URL.
    assert.equal(Web.looksLikeLink("firefox"), false);
    assert.equal(Web.looksLikeLink("2+2"), false);
    assert.equal(Web.looksLikeLink("how tall is a giraffe"), false);
    assert.equal(Web.looksLikeLink("github.com issues"), false);
    assert.equal(Web.looksLikeLink("ftp://example.com"), false);
    assert.equal(Web.looksLikeLink(""), false);
});

test("what is", () => {
    assert.equal(Web.looksLikeLink("github.com"), true);
    assert.equal(Web.looksLikeLink("https://github.com/a/b?c=d"), true);
    assert.equal(Web.looksLikeLink("localhost:3000"), true);
    assert.equal(Web.looksLikeLink("192.168.1.1:8080"), true);
});

test("neither Entry carries an Entry Key", () => {
    // Checkbox 4. A search is never the same search twice -- the Query is part
    // of it -- so there is no identity for Frecency to accumulate against, and
    // fabricating one would teach the store that searching is the thing this
    // machine does most.
    assert.equal(Web.entriesFor("giraffe height", UNANSWERED, provider)[0].key, undefined);
    assert.equal(Web.entriesFor("github.com", UNANSWERED, provider)[0].key, undefined);
});

test("the URL is opened through the launch prefix, as one argument", () => {
    // Same prefix and the same reasoning as every other Provider's launch. The
    // URL is one argv element, so a `&` in it cannot become shell syntax --
    // elephant had to shell-escape here because it went through `sh -c`.
    assert.deepEqual(Web.openArgv("https://example.com/a?b=c&d=e", PREFIX), ["uwsm-app", "--", "xdg-open", "https://example.com/a?b=c&d=e"]);
});

test("an absent launch prefix still produces a runnable argv", () => {
    assert.deepEqual(Web.openArgv("https://example.com", null), ["xdg-open", "https://example.com"]);
});

test("no URL is no argv, rather than a bare xdg-open", () => {
    // xdg-open with no argument opens a file manager on the current directory.
    // Returning [] is what lets the caller refuse to run rather than run
    // something surprising.
    assert.deepEqual(Web.openArgv("", PREFIX), []);
});
