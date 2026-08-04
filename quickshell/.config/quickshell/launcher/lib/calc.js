// The calculator Provider's pure half: which Queries are worth a calculation,
// what qalc's output means, which answer belongs to which Query, and how a
// result reaches the clipboard.
//
// The arithmetic itself is qalc's -- libqalculate, the same binary elephant
// shelled out to (resources/elephant/internal/providers/calc/setup.go:131,
// deleted with ticket 19). That
// is a decision rather than an inheritance: the provider is named
// "Calculator/Unit-Conversion" there and `10 cm to inch` and currency
// conversion are things it answers today. Writing an expression evaluator here
// instead would quietly drop both, and the spec names exactly one deliberate
// drop -- the symbol picker -- so this is not a drop that is ours to add.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/calc.test.js) -- the same arrangement as matching.js, and for
// the same reason. See the note at the top of that file about `.pragma library`
// and top-level functions.
//
// **This Provider is not ranked.** Its Entry does not go through score() at
// all; Launcher.qml appends it after the merged pool. The reason is in
// entriesFor below.

// The icon-theme name, as elephant's default (calc/setup.go:85, deleted with
// ticket 19).
var ICON = "accessories-calculator";

// Elephant's min_chars, default 3 (calc/setup.go:47, deleted with ticket 19).
// Without it every digit typed on the way to a longer Query spawns a process.
var MIN_CHARS = 3;

// Whether a Query is one to calculate.
//
// Both rules are elephant's defaults -- min_chars and require_number
// (calc/setup.go:46-47, deleted with ticket 19) -- and together they are what
// checkbox 5 asks for. The
// digit rule does the heavy lifting: an application name, a window title and a
// menu entry name have no digit in them, so the overwhelming majority of
// Queries never reach qalc at all.
//
// Note what this deliberately does *not* try to be: a check that the Query is
// well-formed arithmetic. That question is qalc's, it knows unit and currency
// syntax this file has no business modelling, and getting a wrong answer to it
// here would mean refusing to calculate something the calculator can do. What
// this is instead is a cheap filter in front of a process spawn; resultOf below
// is where "qalc could not make anything of it" is turned back into no Entry.
function wanted(query) {
    if (typeof query !== "string")
        return false;

    var trimmed = query.trim();
    if (trimmed.length < MIN_CHARS)
        return false;

    return /[0-9]/.test(trimmed);
}

// The process to run. Terse mode: `-t` prints the result and nothing else, so
// there is no "2 + 2 = 4" line to parse a result out of.
function argvOf(query) {
    return ["qalc", "-t", query];
}

// What qalc's output means, or "" for output that is not a result.
//
// Three kinds of not-a-result, and the middle one is the interesting one:
//
//   nothing        qalc printed nothing, or whitespace
//   the Query back what qalc does with an expression it cannot evaluate -- it
//                  hands the input through. "1password" is a Query with a digit
//                  in it, so wanted() lets it past, and an Entry reading
//                  "1password" whose primary Action copies the string just
//                  typed is a row that looks like an answer and is not one
//   an error       qalc's own diagnostic, which is prose rather than a value
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

// The Entries for a Query, given the answer currently in hand. None or one.
//
// `answer` is { query, text } -- the result *and* the Query it was launched
// for. That pairing is the whole of the staleness rule, and it exists because
// qalc runs asynchronously: typing "12*" and then "12*3" leaves two processes
// in flight and nothing guarantees they finish in the order they started. A
// result shown against the Query it was not computed for is the failure that
// reads as "the calculator is sometimes wrong", which is far worse than a
// frame with no answer in it.
//
// No placeholder row while a calculation is in flight, which is where this
// parts company with elephant's async path (calc/setup.go:229-244, deleted
// with ticket 19). A row whose
// primary Action has nothing to copy is a key that does nothing, and a key that
// does nothing is indistinguishable from the Launcher ignoring you -- the
// failure lib/actions.js is built around. qalc answers in milliseconds; what
// the absence costs is a frame.
//
// **No Entry Key.** A sum is not a thing chosen again: "2+2" today and "2+2"
// next month are the same string but not the same act, and there is nothing for
// usage to accumulate against. Leaving the field off is the whole of opting out
// -- Frecency.record treats a missing key as a no-op -- which is the same thing
// the windows Provider does and for the same reason.
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

// The argv that puts a result on the clipboard.
//
// Through stdin rather than as an argument, and the reason is a minus sign:
// `wl-copy -5` is wl-copy being handed what looks like flags. Elephant's
// default command is `wl-copy -n '%VALUE%'` and it interpolates, which is the
// same class of question one layer up. Piping sidesteps both -- and it is what
// bin/df-screenshot-copy-paths (deleted with ticket 19) did.
//
// The result arrives as a positional argument to the script rather than being
// spliced into it, so a result containing a quote or a `$(` is data the whole
// way down. `sh` in the middle is $0, which is the name `sh -c` wants before
// the arguments start.
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
