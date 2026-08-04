// Tests for the screenshots Provider's pure half: parsing `find`'s output,
// the Entry shape, and the shell commands the primary and secondary Actions
// run.
//
//     node --test "tests/launcher/*.test.js"
//
// `find` itself is not exercised here -- these tests check listScript's
// *shape*, the same limit directories.test.js has for its own refresh
// script. Whether it actually lists the real ~/Pictures/Screenshots is a
// host claim, in the ticket's own Manual verification.

const test = require("node:test");
const assert = require("node:assert");

const S = require("../../quickshell/.config/quickshell/launcher/lib/screenshots.js");

test("screenshotsDir is ~/Pictures/Screenshots", () => {
    assert.strictEqual(S.screenshotsDir("/home/jehad"), "/home/jehad/Pictures/Screenshots");
});

test("listScript names every extension the picker recognised, case-insensitively", () => {
    const script = S.listScript("/home/jehad/Pictures/Screenshots");

    assert.match(script, /find -L '\/home\/jehad\/Pictures\/Screenshots'/);
    S.EXTENSIONS.forEach(ext => {
        assert.match(script, new RegExp(`-iname '\\*\\.${ext}'`));
    });
    // One level deep, and errors swallowed rather than surfaced as an Entry.
    assert.match(script, /-maxdepth 1 -type f/);
    assert.match(script, /2>\/dev\/null$/);
});

test("listScript quotes a directory with a space or a quote in it", () => {
    const script = S.listScript("/home/jehad/My Pictures/it's");
    assert.match(script, /'\/home\/jehad\/My Pictures\/it'\\''s'/);
});

test("listCommand wraps the script for a shell, since execDetached cannot express -o", () => {
    const argv = S.listCommand("/home/jehad");
    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.strictEqual(argv[2], S.listScript(S.screenshotsDir("/home/jehad")));
});

test("parseLine splits find's own tab-separated mtime and path", () => {
    assert.deepStrictEqual(S.parseLine("1730000000.1234567\t/home/jehad/Pictures/Screenshots/a.png"), {
        mtime: 1730000000.1234567,
        path: "/home/jehad/Pictures/Screenshots/a.png"
    });
});

test("parseLine rejects a line with no tab, an unparsable mtime, or an empty path", () => {
    assert.strictEqual(S.parseLine("no tab here"), null);
    assert.strictEqual(S.parseLine("not-a-number\t/a.png"), null);
    assert.strictEqual(S.parseLine("1730000000\t"), null);
});

test("parseListing is newest first", () => {
    const text = [
        "1000\t/a.png",
        "3000\t/c.png",
        "2000\t/b.png"
    ].join("\n");

    assert.deepStrictEqual(S.parseListing(text).map(item => item.path), ["/c.png", "/b.png", "/a.png"]);
});

test("parseListing keeps find's own encounter order for a tied mtime", () => {
    const text = [
        "1000\t/first.png",
        "1000\t/second.png"
    ].join("\n");

    assert.deepStrictEqual(S.parseListing(text).map(item => item.path), ["/first.png", "/second.png"]);
});

test("parseListing drops blank and unparsable lines", () => {
    const text = "1000\t/a.png\n\nnot a line\n2000\t/b.png\n";
    assert.deepStrictEqual(S.parseListing(text).map(item => item.path), ["/b.png", "/a.png"]);
});

test("parseListing is empty for no output, not a fault", () => {
    assert.deepStrictEqual(S.parseListing(""), []);
    assert.deepStrictEqual(S.parseListing(undefined), []);
});

test("filenameOf is the last path segment", () => {
    assert.strictEqual(S.filenameOf("/home/jehad/Pictures/Screenshots/shot.png"), "shot.png");
    assert.strictEqual(S.filenameOf("shot.png"), "shot.png");
});

test("formatMtime pads every field to two digits", () => {
    const epoch = 1000;
    const expected = new Date(epoch * 1000);
    const pad = n => (n < 10 ? "0" + n : String(n));
    const want = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())} `
        + `${pad(expected.getHours())}:${pad(expected.getMinutes())}`;

    assert.strictEqual(S.formatMtime(epoch), want);
});

test("entryFor carries the path and reads marked back off the Provider's own selection", () => {
    const provider = {};
    const item = { mtime: 1730000000, path: "/home/jehad/Pictures/Screenshots/shot.png" };

    const unmarked = S.entryFor(item, {}, provider);
    assert.strictEqual(unmarked.name, "shot.png");
    assert.strictEqual(unmarked.icon, "");
    assert.strictEqual(unmarked.provider, provider);
    assert.strictEqual(unmarked.target.path, item.path);
    assert.strictEqual(unmarked.target.marked, false);
    assert.strictEqual(unmarked.key, undefined, "no Entry Key -- see the header on why");

    const marked = S.entryFor(item, { [item.path]: true }, provider);
    assert.strictEqual(marked.target.marked, true);
});

test("catalogOf builds one corpus text per Entry, in the given order", () => {
    const provider = {};
    const items = [
        { mtime: 2000, path: "/a.png" },
        { mtime: 1000, path: "/b.png" }
    ];

    const built = S.catalogOf(items, {}, provider);
    assert.deepStrictEqual(built.entries.map(entry => entry.name), ["a.png", "b.png"]);
    assert.deepStrictEqual(built.texts, ["a.png", "b.png"]);
});

test("copyImageArgv pipes the file's own bytes through a shell, path as $1", () => {
    const argv = S.copyImageArgv("/home/jehad/Pictures/Screenshots/shot.png");

    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.match(argv[2], /^wl-copy --type "\$\(file -b --mime-type "\$1"\)" < "\$1"$/);
    assert.strictEqual(argv[3], "_");
    assert.strictEqual(argv[4], "/home/jehad/Pictures/Screenshots/shot.png");
});

test("copyPathsArgv carries every path as its own argv element, not interpolated into the script", () => {
    const paths = ["/a.png", "/it's a b.png"];
    const argv = S.copyPathsArgv(paths);

    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.match(argv[2], /printf '%s\\n' "\$@" \| wl-copy/);
    assert.strictEqual(argv[3], "_");
    assert.deepStrictEqual(argv.slice(4), paths);
});
