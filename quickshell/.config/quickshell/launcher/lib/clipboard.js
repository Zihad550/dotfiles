// The clipboard Provider's pure half: parsing `cliphist list`'s output, the
// Entry shape, and the shell commands the primary Action runs.
//
// **cliphist, not elephant's own clipboard daemon, is what stores history.**
// Elephant had one (internal/providers/clipboard/clipboard.go, deleted with
// elephant in ticket 19) -- a `wl-paste --watch` loop feeding a gob file --
// but the spec is explicit that elephant is not retained as a backend
// (docs/launcher-spec.md, "Full replacement, not a reskin"). Writing a second
// clipboard-history daemon into this shell would be real infrastructure a
// ticket whose checkboxes are all about display and paste has no business
// growing. cliphist was walker's own tool for this
// (walker/.config/walker/config.toml:102, `provider = "clipboard"`, deleted
// with ticket 19) and is exactly the "Providers fetching their data through a
// process" pattern the spec already endorses for the dmenu scripts -- the same
// shape screenshots.js is, with `find` swapped for `cliphist list` and
// `wl-paste --watch cliphist store` doing the watching (wired in
// hypr/.config/hypr/lua/autostart.lua, outside this Provider's own concern).
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/clipboard.test.js) -- the same arrangement as matching.js.

var ICON_TEXT = "edit-paste";
var ICON_IMAGE = "image-x-generic";

// Display truncation limit for a text entry -- long enough to read as the
// content, short enough that one Entry stays one line. Independent of
// whatever preview width cliphist itself was configured with: this is what
// the checkbox asks for regardless of that setting.
var MAX_DISPLAY_LEN = 80;

// cliphist wraps a non-text entry's preview in this shape, e.g.
// "[[ binary data 190 KiB png ]]" -- the marker `isImage` below looks for.
var BINARY_RE = /^\[\[ binary data (.+) \]\]$/;

function listCommand() {
    return ["cliphist", "list"];
}

function clearCommand() {
    return ["cliphist", "wipe"];
}

// `cliphist delete`, like `decode`, reads the id-and-preview line off stdin
// rather than taking the id as an argument -- despite `cliphist --help`'s own
// usage line ("cliphist delete id"), which reads as a positional argument and
// is not one; confirmed on a real host, where passing the id as an argument
// hangs forever (delete is left waiting on the stdin it was never given) and
// piping the full `raw` line through is what actually completes. Same shape
// as copyArgv below, for the same reason.
function deleteArgv(raw) {
    return ["sh", "-c", 'printf "%s\\n" "$1" | cliphist delete', "_", raw];
}

// One line of `cliphist list` -> { raw, id, preview, isImage, detail }, or
// null for a line that does not parse.
//
// `raw` is the whole line, unsplit -- id and preview together, exactly as
// cliphist printed it. That is deliberate: `cliphist decode` reads a line in
// this same id-then-preview shape off its own stdin (the way every
// integration script pipes a picker's chosen line straight into it), not an
// id passed as an argument, so `raw` is what a paste needs to travel with,
// untouched, all the way to copyArgv below.
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

// Every history entry, in the order `cliphist list` printed them.
//
// No re-sort, unlike screenshots.js's own parseListing: `find` has no
// ordering promise of its own, but `cliphist list` does -- newest first, the
// same thing checkbox 1 asks for -- so imposing a second ordering here would
// only be able to get that wrong. If that assumption is ever wrong on a real
// host it shows up as this Provider's own list reading oldest-first, which is
// exactly the failure the ticket's Manual verification step for this
// checkbox is written to catch.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];

    return text.split("\n")
        .map(parseLine)
        .filter(function (item) { return item !== null; });
}

// Collapses embedded whitespace -- including a newline a multi-line text
// entry can genuinely contain -- to a single space, then shortens to `maxLen`
// characters, marking that it did. Used only for what an Entry *displays*;
// the content a paste sends to the clipboard is `raw`, never this.
function truncate(text, maxLen) {
    var collapsed = String(text).replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLen)
        return collapsed;
    return collapsed.slice(0, Math.max(0, maxLen - 1)) + "…";
}

// One history entry, as the shape Clipboard.qml's catalog wants.
//
// **Image entries read as "Image", not as cliphist's own bracket-marker
// text.** Checkbox 4 asks for image entries to be distinguishable from text
// "rather than shown as noise" -- and `[[ binary data 190 KiB png ]]` printed
// verbatim as an Entry's name is exactly that noise, not a fix for it.
// `detail` (cliphist's own words between the brackets) still says something
// useful, so it becomes the subtext instead of being dropped.
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

// Every history entry, as the shape Clipboard.qml's catalog wants: the
// display Entries, plus the corpus texts prepare() needs.
//
// The corpus text for a text entry is the *full* preview, not the truncated
// display name -- so narrowing by typing after "$" can match content past
// character 80, even though the row on screen cuts off there. An image's
// corpus text is the plain word "image" rather than its bracket-marker text,
// so typing "image" finds it and the marker's own punctuation is not
// something a Query has to happen to contain.
function catalogOf(items, provider) {
    var entries = items.map(function (item) {
        return entryFor(item, provider);
    });

    var texts = items.map(function (item) {
        return item.isImage ? "image" : item.preview;
    });

    return { entries: entries, texts: texts };
}

// The primary Action, for a text entry: cliphist's own decode, piped straight
// to the Wayland clipboard. `raw` travels as `$1` -- never interpolated into
// the command string -- so a copied line carrying a quote or a `$(` cannot
// break out of it, the same reasoning as calc.js's copyArgv.
//
// Two functions, one per kind, rather than one taking an `isImage` flag --
// the same shape screenshots.js's copyImageArgv and copyPathsArgv are, and
// for the same reason: the two pipelines share nothing but `raw`, so a flag
// here would only be picking between two unrelated scripts rather than
// varying one.
function copyArgv(raw) {
    return ["sh", "-c", 'printf "%s\\n" "$1" | cliphist decode | wl-copy', "_", raw];
}

// The primary Action, for an image: decoded to a temp file rather than piped
// straight through, because the mime type has to be sniffed off the actual
// bytes -- `wl-copy` with no `--type` defaults to plain text, which would put
// image bytes on the clipboard under the wrong type and every image-consuming
// target would refuse them. `file -b --mime-type` on a real file is the same
// approach screenshots.js's copyImageArgv already uses; a temp file is what
// makes that possible here, since decode's output has no file of its own to
// sniff until one is made. Removed with `trap … EXIT` regardless of how the
// pipeline ends.
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
