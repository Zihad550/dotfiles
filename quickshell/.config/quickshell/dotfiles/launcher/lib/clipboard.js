// The clipboard Provider's pure half: parsing `cliphist list`'s output, the
// Entry shape, and the shell commands the primary Action runs.
//
// cliphist stores history, not a hand-rolled daemon here: it's already the
// "Providers fetching their data through a process" pattern, same shape as
// screenshots.js with `find` swapped for `cliphist list` (`wl-paste --watch
// cliphist store` does the watching, wired in hypr/.config/hypr/lua/autostart.lua).
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/clipboard.test.js).

var ICON_TEXT = "edit-paste";
var ICON_IMAGE = "image-x-generic";

// Long enough to read as content, short enough to stay one line.
var MAX_DISPLAY_LEN = 80;

// cliphist wraps a non-text entry's preview like "[[ binary data 190 KiB png ]]".
var BINARY_RE = /^\[\[ binary data (.+) \]\]$/;

function listCommand() {
    return ["cliphist", "list"];
}

function clearCommand() {
    return ["cliphist", "wipe"];
}

// `cliphist delete`, like `decode`, reads the id-and-preview line off stdin
// rather than taking the id as an argument -- despite `cliphist --help`'s
// usage line suggesting otherwise. Confirmed on a real host: passing the id
// as an argument hangs forever waiting on stdin it never gets; piping the
// full `raw` line through is what actually completes.
function deleteArgv(raw) {
    return ["sh", "-c", 'printf "%s\\n" "$1" | cliphist delete', "_", raw];
}

// `raw` is the whole line, unsplit -- id and preview together, exactly as
// cliphist printed it. `cliphist decode` reads that same id-then-preview
// shape off stdin, so `raw` is what a paste needs to travel with, untouched,
// all the way to copyArgv below.
function parseLine(line) {
    var tab = line.indexOf("\t");
    if (tab < 0)
        return null;

    var id = line.slice(0, tab);
    var preview = line.slice(tab + 1);
    if (id === "" || preview === "")
        return null;

    var match = preview.match(BINARY_RE);

    return {
        raw: line,
        id: id,
        preview: preview,
        isImage: match !== null,
        detail: match ? match[1] : null
    };
}

// No re-sort: `cliphist list` already prints newest-first, unlike `find`
// (screenshots.js), so imposing a second ordering here could only get it wrong.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];

    return text.split("\n")
        .map(parseLine)
        .filter(function (item) { return item !== null; });
}

// Collapses whitespace (including a real newline in a multi-line entry) to a
// single space, then shortens. Used only for what an Entry *displays* -- the
// content a paste sends to the clipboard is `raw`, never this.
function truncate(text, maxLen) {
    var collapsed = String(text).replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLen)
        return collapsed;
    return collapsed.slice(0, Math.max(0, maxLen - 1)) + "…";
}

// Image entries read as "Image", not cliphist's own bracket-marker text --
// printing "[[ binary data 190 KiB png ]]" verbatim would be noise, not a
// fix. `detail` (the words between the brackets) becomes the subtext instead
// of being dropped.
function entryFor(item, provider) {
    if (item.isImage) {
        return {
            name: "Image",
            subtext: item.detail || "",
            icon: ICON_IMAGE,
            provider: provider,
            target: { raw: item.raw, isImage: true }
        };
    }

    return {
        name: truncate(item.preview, MAX_DISPLAY_LEN),
        subtext: "",
        icon: ICON_TEXT,
        provider: provider,
        target: { raw: item.raw, isImage: false }
    };
}

// The corpus text for a text entry is the *full* preview, not the truncated
// display name, so narrowing by typing can match content past character 80
// even though the row on screen cuts off there. An image's corpus text is
// the plain word "image" rather than its bracket-marker text.
function catalogOf(items, provider) {
    var entries = items.map(function (item) {
        return entryFor(item, provider);
    });

    var texts = items.map(function (item) {
        return item.isImage ? "image" : item.preview;
    });

    return { entries: entries, texts: texts };
}

// `raw` travels as `$1`, never interpolated into the command string, so a
// copied line carrying a quote or `$(` can't break out of it.
function copyArgv(raw) {
    return ["sh", "-c", 'printf "%s\\n" "$1" | cliphist decode | wl-copy', "_", raw];
}

// Decoded to a temp file rather than piped straight through, because the
// mime type has to be sniffed off the actual bytes -- `wl-copy` with no
// `--type` defaults to plain text, which would put image bytes on the
// clipboard under the wrong type. Removed with `trap … EXIT` regardless of
// how the pipeline ends.
function copyImageArgv(raw) {
    return ["sh", "-c",
        "tmp=$(mktemp) && trap 'rm -f \"$tmp\"' EXIT && "
        + 'printf "%s\\n" "$1" | cliphist decode > "$tmp" && '
        + 'wl-copy --type "$(file -b --mime-type "$tmp")" < "$tmp"',
        "_", raw];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ICON_TEXT: ICON_TEXT,
        ICON_IMAGE: ICON_IMAGE,
        MAX_DISPLAY_LEN: MAX_DISPLAY_LEN,
        listCommand: listCommand,
        clearCommand: clearCommand,
        deleteArgv: deleteArgv,
        parseLine: parseLine,
        parseListing: parseListing,
        truncate: truncate,
        entryFor: entryFor,
        catalogOf: catalogOf,
        copyArgv: copyArgv,
        copyImageArgv: copyImageArgv
    };
}
