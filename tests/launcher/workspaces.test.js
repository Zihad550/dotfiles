// Tests for the workspaces Provider's pure half -- how a workspace is named,
// found and described, and the exact argv the rename Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// The rename argv is the whole reason this module exists: the old script
// interpolated the new name into a Lua expression unescaped, so a `"` in a
// name broke the dispatch silently. The quoting rules are pinned here so a
// name that looks like code cannot turn a rename into something else.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const W = require("../../quickshell/.config/quickshell/launcher/lib/workspaces.js");
const CatalogCheck = require("./catalog-check.js");

// A real HyprlandWorkspace reports its windows as `toplevels.values` -- the
// shape the bar's own empty-check reads (dotfiles/modules/Workspaces.qml) --
// so that is the shape these samples use. `windows` remains testable as the
// fallback.
const SAMPLE = [
    { id: 3, name: "3-(dev)", toplevels: { values: [{}, {}, {}, {}, {}] }, active: false },
    { id: 4, name: "4", toplevels: { values: [] }, active: true },
    { id: -99, name: "special:note", toplevels: { values: [{}, {}] }, active: false }
];

// The catalog for SAMPLE, built and prepared exactly as Workspaces.qml builds
// and prepares it, so the tests below rank the same corpus the QML ranks.
const built = C.keylessCatalog(SAMPLE, item => W.entryFor(item, null), W.textsFor);
const corpus = M.prepare(built.texts, null, built.owners);

function namesFor(query) {
    return M.collapse(corpus, M.rank(corpus, query)).indices.map(index => built.entries[index].name);
}

test("a workspace is named by its name", () => {
    assert.strictEqual(W.nameFor({ name: "3-(dev)" }), "3-(dev)");
    assert.strictEqual(W.nameFor({ name: "special:note" }), "special:note");
    assert.strictEqual(W.nameFor({ name: "" }), "(unnamed workspace)");
});

test("the sub-line says how many windows and whether it is active", () => {
    assert.strictEqual(W.subtextFor({ name: "3-(dev)", toplevels: { values: [{}, {}, {}, {}, {}] }, active: false }), "5 windows");
    assert.strictEqual(W.subtextFor({ name: "4", toplevels: { values: [] }, active: true }), "empty · active");
    assert.strictEqual(W.subtextFor({ name: "3", windows: 1, active: true }), "1 window · active",
        "a plain `windows` count still works, as the fallback");
    assert.strictEqual(W.subtextFor({ name: "3", active: true }), "empty · active",
        "neither shape present degrades to the empty count, not an error");
});

test("a workspace is found by its name and by its plain id", () => {
    const item = { id: 3, name: "3-(dev)" };
    assert.deepStrictEqual(W.textsFor(item, W.entryFor(item, null)), ["3-(dev)", "3"],
        "the id is the text a rename must not break");
    assert.deepStrictEqual(W.textsFor({ id: 4, name: "4" }, W.entryFor({ id: 4, name: "4" }, null)),
        ["4"], "an id equal to the name adds nothing");
    assert.deepStrictEqual(W.textsFor({ id: -99, name: "special:note" }, W.entryFor({ id: -99, name: "special:note" }, null)),
        ["special:note"], "a special workspace's negative id is meaningless to type");
});

test("a workspace is found through the corpus by both of its texts", () => {
    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name, or an alias would quietly earn what only a name may.
    CatalogCheck.nameFirst(built);

    assert.deepStrictEqual(namesFor("dev"), ["3-(dev)"], "by the name");
    assert.deepStrictEqual(namesFor("3"), ["3-(dev)"],
        "by the plain id -- the text a rename must not break");
    assert.deepStrictEqual(namesFor("note"), ["special:note"],
        "textsFor builds what it is given -- the special filter is Workspaces.qml's, not this module's");
});

test("the catalog carries the workspace itself as the Entry's target", () => {
    const built = C.keylessCatalog([{ id: 3, name: "3-(dev)", windows: 5, active: false }],
        item => W.entryFor(item, "provider"), W.textsFor);
    assert.strictEqual(built.entries.length, 1);
    assert.strictEqual(built.entries[0].name, "3-(dev)");
    assert.strictEqual(built.entries[0].target.id, 3);
    assert.strictEqual(built.entries[0].key, undefined, "no Entry Key -- ids do not survive a restart");
});

test("the rename prompt is the old script's text", () => {
    assert.strictEqual(W.promptText(3, "3-(dev)"), "Rename workspace 3 (3-(dev))");
});

test("special workspaces are named by the same predicate the bar uses", () => {
    assert.strictEqual(W.isSpecial("special"), true);
    assert.strictEqual(W.isSpecial("special:note"), true);
    assert.strictEqual(W.isSpecial("3-(dev)"), false);
    assert.strictEqual(W.isSpecial(""), false);
});

test("the rename prompt prefills the plain name", () => {
    assert.strictEqual(W.plainNameOf("3-(dev)", 3), "dev");
    assert.strictEqual(W.plainNameOf("3", 3), "", "an unchanged workspace prompts empty -- the script's own start");
    assert.strictEqual(W.plainNameOf("custom-name", 3), "custom-name",
        "a nonconforming name prefills as itself rather than being rewritten");
});

test("the rename dispatch is one Lua expression, name quoted", () => {
    assert.deepStrictEqual(W.renameLuaArgv(3, "3-(games)"), [
        "hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "3", name = "3-(games)" })'
    ]);
});

test("a name containing a quote cannot break the Lua dispatch", () => {
    const argv = W.renameLuaArgv(3, '3-(a"b)');
    assert.deepStrictEqual(argv, [
        "hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "3", name = "3-(a\\"b)" })'
    ]);
});

test("a name containing a backslash cannot break the Lua dispatch either", () => {
    // The escape order is the point: backslash first, then quote. A name
    // ending in `\` used to close the Lua string early -- the quote escape
    // reached by the other character.
    assert.deepStrictEqual(W.renameLuaArgv(3, "3-(a\\)"), [
        "hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "3", name = "3-(a\\\\)" })'
    ]);

    assert.deepStrictEqual(W.renameLuaArgv(3, '3-(a\\"b)'), [
        "hyprctl", "dispatch", 'hl.dsp.workspace.rename({ workspace = "3", name = "3-(a\\\\\\"b)" })'
    ], "both together, each escaped once -- the quote pass must not rewrite the backslash pass's output");
});

test("the notification names what changed", () => {
    assert.deepStrictEqual(W.notifyArgv(3, "3-(dev)", "3-(games)"), [
        "notify-send", "Workspace renamed", "Workspace 3: '3-(dev)' → '3-(games)'"
    ]);
});
