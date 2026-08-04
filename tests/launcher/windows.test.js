// Tests for the windows Provider's pure half -- how a window is named, found
// and described -- and for the one claim the whole Provider rests on: that
// typing the name of something already running offers the window rather than
// the application that would launch a second copy of it.
//
//     node --test "tests/launcher/*.test.js"
//
// The claim is checked end to end through the real matching module, and through
// the same key composition (keylessCatalog handed this Provider's entryFor)
// the QML runs rather than a copy of it -- a test that reimplements the thing
// it is checking passes happily while the QML drifts away from it. Nothing
// here needs a compositor, which is the point: on the host a wrong answer
// reads as a preference rather than as a fault, so it would never be noticed.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const W = require("../../quickshell/.config/quickshell/launcher/lib/windows.js");
const CatalogCheck = require("./catalog-check.js");

// The windows Provider's catalog, paired with prepare() exactly as Windows.qml
// pairs it. `windows` is what the compositor reported, one object per window.
function windowsCatalog(windows) {
    const built = C.keylessCatalog(windows, item => W.entryFor(item, null), W.textsFor);
    return { entries: built.entries, corpus: M.prepare(built.texts, null, built.owners) };
}

// The applications Provider's catalog: one corpus text per Entry, keyed by
// desktop entry id.
function applicationsCatalog(names) {
    return {
        entries: names.map(name => ({ name: name, subtext: "" })),
        corpus: M.prepare(names, names)
    };
}

// The pool, in Launcher.qml's order -- windows before applications -- and its
// three steps: rank each Provider, collapse its texts to Entries, merge.
function pool(catalogs, query) {
    const ranked = catalogs.map(c => M.collapse(c.corpus, M.rank(c.corpus, query)));
    return M.merge(ranked).map(pick => catalogs[pick.provider].entries[pick.index].name);
}

test("a window is named by its title, and falls back to its application", () => {
    assert.strictEqual(W.nameFor("notes.md — Zed", "dev.zed.Zed"), "notes.md — Zed");
    assert.strictEqual(W.nameFor("", "dev.zed.Zed"), "dev.zed.Zed", "a window with no title yet is still offerable");
    assert.strictEqual(W.nameFor("", ""), "(untitled window)", "and one with neither is still selectable");
});

test("a window is found by its title and by its application", () => {
    const item = { title: "Some Page — Mozilla Firefox", appId: "org.mozilla.firefox" };
    const texts = W.textsFor(item, W.entryFor(item, null));
    assert.ok(texts.includes("Some Page — Mozilla Firefox"), "the title is matchable");
    assert.ok(texts.includes("org.mozilla.firefox"), "so is the application id");
    assert.ok(texts.includes("firefox"), "and so is the id's last segment");
});

test("corpus texts are not duplicated when there is nothing to add", () => {
    const textsFor = (title, appId) => {
        const item = { title: title, appId: appId };
        return W.textsFor(item, W.entryFor(item, null));
    };
    assert.deepStrictEqual(textsFor("ghostty", "ghostty"), ["ghostty"],
        "a plain id equal to the name adds nothing");
    assert.deepStrictEqual(textsFor("(untitled window)", ""), ["(untitled window)"],
        "a window with no application id is still matchable by its name");
    assert.deepStrictEqual(W.shortIdOf("Google-chrome"), "", "an X11 class has no segment to shorten");
    assert.deepStrictEqual(W.shortIdOf("trailing."), "", "a trailing dot is not a segment");
});

test("a running window outranks the application, until the Query is the whole name", () => {
    // The reason this Provider exists: both Providers are queried with the name
    // the user actually types, and the window comes first -- otherwise Enter
    // launches a second copy, which is exactly what the Launcher is supposed to
    // stop.
    //
    // **Ticket 20 narrowed that to Queries short of the whole name.** Typing the
    // application's name exactly is now read as naming the application, so it
    // goes first and Enter launches it. The window is one row down, not gone.
    // This is a reversal of what ticket 05 pinned here, made deliberately and on
    // the strength of use.
    const windows = windowsCatalog([
        { title: "Some Page — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "3" }
    ]);
    const applications = applicationsCatalog(["Firefox", "Firefox ESR", "Thunderbird"]);

    assert.deepStrictEqual(
        pool([windows, applications], "firefox"),
        ["Firefox", "Some Page — Mozilla Firefox", "Firefox ESR"],
        "the application named exactly that, then the window of it");

    assert.deepStrictEqual(
        pool([windows, applications], "firef"),
        ["Some Page — Mozilla Firefox", "Firefox", "Firefox ESR"],
        "one character short, and ticket 05's ordering is untouched");
});

test("an application with no window open is unaffected", () => {
    const windows = windowsCatalog([
        { title: "notes.md — Zed", appId: "dev.zed.Zed", workspace: "1" }
    ]);
    const applications = applicationsCatalog(["Firefox", "Zed"]);

    assert.deepStrictEqual(pool([windows, applications], "firefox"), ["Firefox"],
        "nothing running by that name means the application is the only answer");
});

test("every window of an application is offered, above the application", () => {
    const windows = windowsCatalog([
        { title: "Inbox — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "1" },
        { title: "Docs — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "special:magic" }
    ]);
    const applications = applicationsCatalog(["Firefox"]);

    // Queried one character short of the application's whole name, so this is
    // the windows-first ordering rather than ticket 20's exact-name case -- what
    // it pins is that *every* window is offered, not just the best one.
    assert.deepStrictEqual(
        pool([windows, applications], "firef"),
        ["Inbox — Mozilla Firefox", "Docs — Mozilla Firefox", "Firefox"]);

    assert.deepStrictEqual(
        pool([windows, applications], "firefox"),
        ["Firefox", "Inbox — Mozilla Firefox", "Docs — Mozilla Firefox"],
        "and on the whole name the application leads, with both windows still there");
});

test("a window is found by words in its title", () => {
    const windows = windowsCatalog([
        { title: "Inbox — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "1" },
        { title: "Docs — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "1" }
    ]);

    assert.deepStrictEqual(pool([windows], "inbox"), ["Inbox — Mozilla Firefox"]);
});

test("the sub-line says which application and which workspace", () => {
    assert.strictEqual(W.subtextFor("org.mozilla.firefox", "3"), "org.mozilla.firefox · workspace 3");
    assert.strictEqual(W.subtextFor("ghostty", "special:magic"), "ghostty · special:magic",
        "a special workspace reads as itself rather than being called a workspace");
    assert.strictEqual(W.subtextFor("ghostty", "special"), "ghostty · special");
    assert.strictEqual(W.subtextFor("", "3"), "workspace 3", "no application id leaves no dangling separator");
    assert.strictEqual(W.subtextFor("ghostty", ""), "ghostty", "and neither does no workspace");
    assert.strictEqual(W.subtextFor("", ""), "");
});

test("an empty query offers every window, before every application", () => {
    const windows = windowsCatalog([
        { title: "notes.md — Zed", appId: "dev.zed.Zed", workspace: "1" },
        { title: "", appId: "", workspace: "" }
    ]);
    const applications = applicationsCatalog(["Firefox", "Zed"]);

    assert.deepStrictEqual(
        pool([windows, applications], ""),
        ["notes.md — Zed", "(untitled window)", "Firefox", "Zed"],
        "including a window with nothing to identify it, which must not vanish");
});

test("the windows Provider supplies no Entry Key", () => {
    // Ticket 05's fifth checkbox, and ticket 07's fifth: window identity does
    // not survive a relaunch, so this Provider accumulates no Frecency and ranks
    // on match score alone.
    //
    // Asserted on the composed catalog's own output rather than trusted to the
    // comment beside it, because a comment cannot fail: adding a `key` here
    // would opt the Provider into Frecency silently, and the seam's keyless
    // tests -- which run against a synthetic corpus -- would all still pass.
    const built = C.keylessCatalog([
        { title: "Some Page — Mozilla Firefox", appId: "org.mozilla.firefox", workspace: "2", target: {} },
        { title: "", appId: "", workspace: "", target: {} }
    ], item => W.entryFor(item, null), W.textsFor);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name, or an alias would quietly earn what only a name may.
    CatalogCheck.nameFirst(built);

    for (const entry of built.entries)
        assert.strictEqual(entry.key, undefined, `${entry.name} should carry no Entry Key`);
});
