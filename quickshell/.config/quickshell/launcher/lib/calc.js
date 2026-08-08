// The calculator Provider's pure half: which Queries are worth a calculation,
// what qalc's output means, which answer belongs to which Query, and how a
// result reaches the clipboard.
//
// Arithmetic runs through qalc (libqalculate) rather than a hand-rolled
// evaluator, since qalc also answers unit/currency conversion (`10 cm to
// inch`), which a hand-rolled evaluator would quietly drop.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/calc.test.js).
//
// This Provider is not ranked -- its Entry skips score() entirely; Launcher.qml
// appends it after the merged pool. See entriesFor below.

var ICON = "accessories-calculator";

// Without a minimum, every digit typed on the way to a longer Query would
// spawn a process.
var MIN_CHARS = 3;

// The digit rule does the heavy lifting: an application name, window title or
// menu entry rarely has a digit, so most Queries never reach qalc at all.
// Deliberately not a check for well-formed arithmetic -- that's qalc's job,
// which knows unit/currency syntax this file shouldn't model. This is just a
// cheap filter in front of a process spawn; resultOf below is where "qalc
// couldn't make anything of it" turns back into no Entry.
function wanted(query) {
    if (typeof query !== "string")
        return false;

    var trimmed = query.trim();
    if (trimmed.length < MIN_CHARS)
        return false;

    return /[0-9]/.test(trimmed);
}

// Terse mode: `-t` prints just the result, nothing to parse it out of.
function argvOf(query) {
    return ["qalc", "-t", query];
}

// "" for three kinds of not-a-result: nothing printed; the Query echoed back
// unchanged (qalc's response to an expression it can't evaluate -- "1password"
// has a digit, so wanted() lets it through, and echoing it back would look
// like a real answer); or an error diagnostic.
function resultOf(stdout, query) {
    if (typeof stdout !== "string")
        return "";

    var text = stdout.trim();
    if (text === "")
        return "";

    if (typeof query === "string" && text === query.trim())
        return "";

    if (/^error\b/i.test(text))
        return "";

    return text;
}

// None or one Entry for a Query, given the answer currently in hand.
//
// `answer` is `{ query, text }`: qalc runs asynchronously, so typing "12*"
// then "12*3" can leave two processes in flight with no guaranteed finish
// order, and the tag is what stops a result showing against the wrong Query.
//
// No placeholder row while a calculation is in flight -- a row whose primary
// Action has nothing to copy is a key that silently does nothing, which reads
// as the Launcher ignoring you. qalc answers in milliseconds, so the cost of
// waiting is one frame.
//
// No Entry Key: "2+2" today and "2+2" next month are the same string but not
// the same act, so there's nothing for Frecency to accumulate against.
function entriesFor(query, answer, provider) {
    if (!wanted(query))
        return [];

    if (!answer || answer.query !== query || !answer.text)
        return [];

    return [{
        name: answer.text,
        subtext: query,
        icon: ICON,
        provider: provider,
        target: { result: answer.text }
    }];
}

// Through stdin, not as an argument -- a negative result like "-5" would
// otherwise look like a flag to wl-copy. The result is a positional argument
// to the shell script rather than spliced into it, so a quote or `$(` in it
// stays data rather than becoming shell syntax.
function copyArgv(result) {
    return ["sh", "-c", 'printf "%s" "$1" | wl-copy', "sh", result];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ICON: ICON,
        MIN_CHARS: MIN_CHARS,
        wanted: wanted,
        argvOf: argvOf,
        resultOf: resultOf,
        entriesFor: entriesFor,
        copyArgv: copyArgv
    };
}
