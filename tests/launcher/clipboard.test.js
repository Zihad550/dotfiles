// Tests for the clipboard Provider's pure half: parsing `cliphist list`'s
// output, telling an image entry from a text one, the display shape, and the
// shell commands the primary Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// `cliphist` itself is not exercised here -- these tests check the parsing
// and argv *shape*, the same limit screenshots.test.js has for `find`.
// Whether a real `cliphist list` line matches the marker this file looks for
// is a host claim, in the ticket's own Manual verification.

const test = require("node:test");
const assert = require("node:assert");

const C = require("../../quickshell/.config/quickshell/launcher/lib/clipboard.js");

test("listCommand is cliphist list, no shell needed", () => {
    assert.deepStrictEqual(C.listCommand(), ["cliphist", "list"]);
});

test("clearCommand is cliphist wipe, no shell needed", () => {
    assert.deepStrictEqual(C.clearCommand(), ["cliphist", "wipe"]);
});

test("deleteArgv pipes the raw id-and-preview line to cliphist delete, with the line as $1", () => {
    const argv = C.deleteArgv("42\thello world");

    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.match(argv[2], /printf "%s\\n" "\$1" \| cliphist delete/);
    assert.strictEqual(argv[3], "_");
    assert.strictEqual(argv[4], "42\thello world");
});

test("deleteArgv does not interpolate the raw line into the script string", () => {
    const raw = "9\tsomething with \"quotes\" and $(danger)";
    const argv = C.deleteArgv(raw);

    assert.strictEqual(argv[2].indexOf(raw), -1);
    assert.strictEqual(argv[argv.length - 1], raw);
});

test("parseLine splits cliphist's own id and preview on the first tab", () => {
    assert.deepStrictEqual(C.parseLine("42\thello world"), {
        raw: "42\thello world",
        id: "42",
        preview: "hello world",
        isImage: false,
        detail: null
    });
});

test("parseLine keeps every tab after the first as part of the preview", () => {
    const parsed = C.parseLine("7\tcol1\tcol2");
    assert.strictEqual(parsed.preview, "col1\tcol2");
    assert.strictEqual(parsed.raw, "7\tcol1\tcol2");
});

test("parseLine recognises cliphist's binary marker as an image, and keeps the raw line untouched", () => {
    const parsed = C.parseLine("43\t[[ binary data 190 KiB png ]]");
    assert.strictEqual(parsed.isImage, true);
    assert.strictEqual(parsed.detail, "190 KiB png");
    assert.strictEqual(parsed.raw, "43\t[[ binary data 190 KiB png ]]");
});

test("parseLine rejects a line with no tab, an empty id, or an empty preview", () => {
    assert.strictEqual(C.parseLine("no tab here"), null);
    assert.strictEqual(C.parseLine("\thello"), null);
    assert.strictEqual(C.parseLine("42\t"), null);
});

test("parseListing keeps cliphist's own order rather than re-sorting", () => {
    const text = [
        "3\tnewest",
        "2\tmiddle",
        "1\toldest"
    ].join("\n");

    assert.deepStrictEqual(C.parseListing(text).map(item => item.preview), ["newest", "middle", "oldest"]);
});

test("parseListing drops blank and unparsable lines", () => {
    const text = "2\ta\n\nnot a line\n1\tb\n";
    assert.deepStrictEqual(C.parseListing(text).map(item => item.preview), ["a", "b"]);
});

test("parseListing on empty text is an empty list", () => {
    assert.deepStrictEqual(C.parseListing(""), []);
});

test("truncate collapses embedded whitespace, including newlines, without shortening what still fits", () => {
    assert.strictEqual(C.truncate("a\nb\tc  d", 80), "a b c d");
});

test("truncate shortens to exactly the limit and marks that it did", () => {
    const long = "x".repeat(200);
    const truncated = C.truncate(long, 80);

    assert.strictEqual(truncated.length, 80);
    assert.ok(truncated.endsWith("…"));
    assert.strictEqual(truncated.slice(0, 79), "x".repeat(79));
});

test("entryFor a text item truncates the preview for display and carries the raw line to paste", () => {
    const long = "y".repeat(200);
    const entry = C.entryFor(C.parseLine("9\t" + long), { label: "clipboard" });

    assert.strictEqual(entry.name, C.truncate(long, C.MAX_DISPLAY_LEN));
    assert.strictEqual(entry.icon, C.ICON_TEXT);
    assert.strictEqual(entry.target.raw, "9\t" + long);
    assert.strictEqual(entry.target.isImage, false);
});

test("entryFor an image item reads as an image rather than the raw marker noise", () => {
    const entry = C.entryFor(C.parseLine("9\t[[ binary data 4 MiB jpg ]]"), { label: "clipboard" });

    assert.strictEqual(entry.name, "Image");
    assert.strictEqual(entry.subtext, "4 MiB jpg");
    assert.strictEqual(entry.icon, C.ICON_IMAGE);
    assert.strictEqual(entry.target.isImage, true);
    assert.strictEqual(entry.target.raw, "9\t[[ binary data 4 MiB jpg ]]");
});

test("catalogOf's corpus text is the full preview for text entries, not the truncated display name", () => {
    const long = "z".repeat(200);
    const items = [C.parseLine("1\t" + long)];
    const built = C.catalogOf(items, { label: "clipboard" });

    assert.strictEqual(built.texts[0], long);
    assert.strictEqual(built.entries[0].name.length, C.MAX_DISPLAY_LEN);
});

test("catalogOf's corpus text for an image is a plain word, not the binary marker", () => {
    const items = [C.parseLine("1\t[[ binary data 1 KiB png ]]")];
    const built = C.catalogOf(items, { label: "clipboard" });

    assert.strictEqual(built.texts[0], "image");
});

test("copyArgv pipes the raw id-and-preview line to cliphist decode, then wl-copy, with the line as $1", () => {
    const argv = C.copyArgv("42\thello world");

    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.match(argv[2], /printf "%s\\n" "\$1" \| cliphist decode \| wl-copy/);
    assert.strictEqual(argv[3], "_");
    assert.strictEqual(argv[4], "42\thello world");
});

test("copyImageArgv decodes to a temp file and copies with the sniffed mime type", () => {
    const argv = C.copyImageArgv("43\t[[ binary data 190 KiB png ]]");

    assert.strictEqual(argv[0], "sh");
    assert.strictEqual(argv[1], "-c");
    assert.match(argv[2], /cliphist decode > "\$tmp"/);
    assert.match(argv[2], /file -b --mime-type "\$tmp"/);
    assert.match(argv[2], /wl-copy --type/);
    assert.strictEqual(argv[3], "_");
    assert.strictEqual(argv[4], "43\t[[ binary data 190 KiB png ]]");
});

test("neither copyArgv nor copyImageArgv interpolates the raw line into the script string", () => {
    const raw = "9\tsomething with \"quotes\" and $(danger)";

    [C.copyArgv, C.copyImageArgv].forEach(fn => {
        const argv = fn(raw);
        assert.strictEqual(argv[2].indexOf(raw), -1);
        assert.strictEqual(argv[argv.length - 1], raw);
    });
});
