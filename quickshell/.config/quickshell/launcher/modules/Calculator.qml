import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/calc.js" as Calc

// The calculator Provider: an arithmetic expression typed into the Query gets
// its answer in the list, Return copies it. Arithmetic runs through qalc
// (libqalculate); the rules for which Queries are worth a process and what its
// output means live in lib/calc.js.
//
// Deliberately no `catalog` (see docs/launcher-spec.md, "the one variant that
// isn't ranked"): the Entry is generated from the Query itself, so scoring it
// against the Query would always rank it first. Launcher.qml appends it to the
// pool by hand instead.
QtObject {
    id: root

    readonly property string label: "calculator"
    readonly property string description: "Evaluate an expression"

    // Nothing to load: an empty Provider means the Query isn't one to
    // calculate, which is an answer, not a fault.
    readonly property bool ready: true

    readonly property string prefix: "="

    // Required, not defaulted to "": a Provider silently bound to "" would
    // just never produce a row, with nothing to explain why.
    required property string queryText

    // { query, text }, tagged with the Query it was computed for -- entriesFor
    // refuses an answer whose Query has moved on, so a late-arriving result
    // can't show against the wrong expression.
    property var answer: null

    readonly property var entries: Calc.entriesFor(root.queryText, root.answer, root)

    // Closes a real gap, not just informational: between the keystroke that
    // finishes an expression and qalc answering, this Provider has no Entry,
    // so the web search would be the lone (highlighted) row and Return would
    // open a browser instead of copying the result. Tied to the process
    // actually running rather than "no answer yet", so a qalc that fails to
    // start doesn't suppress the web search permanently.
    readonly property bool calculating: Calc.wanted(root.queryText) && qalc.running

    // Primary only -- elephant's "save to history" Action is deliberately not
    // ported, nothing asks for it.
    readonly property var actions: ({
        primary: {
            label: "copy result",
            invoke: entry => root.copy(entry)
        }
    })

    function copy(entry): void {
        const result = entry.target.result;

        // Can't happen for an Entry that exists (entriesFor produces none
        // without a result), but a silent no-op is worse than a loud warning.
        if (!result) {
            console.warn("launcher: calculator Entry with no result to copy");
            return;
        }

        Quickshell.execDetached(Calc.copyArgv(result));
    }

    // Every keystroke asks; wanted() makes most of them free.
    onQueryTextChanged: root.evaluate()

    // At most one qalc in flight: several running at once would race and
    // could land out of order ("12*" answering after "12*3"). Rather than
    // kill-and-restart, this waits and lets the run that finishes re-trigger
    // evaluate() for whatever the Query has become -- entriesFor's tag check
    // is the backstop if that ordering ever slips.
    function evaluate(): void {
        if (!Calc.wanted(root.queryText) || qalc.running)
            return;

        qalc.launchedFor = root.queryText;
        qalc.command = Calc.argvOf(root.queryText);
        qalc.running = true;
    }

    function settle(query: string, output: string): void {
        root.answer = {
            query: query,
            text: Calc.resultOf(output, query)
        };
    }

    // QtObject has no default property to nest a child into, hence the
    // explicit property.
    readonly property Process runner: Process {
        id: qalc

        // Carried on the process, not read off root.queryText when the answer
        // arrives -- by then the Query may have moved on.
        property string launchedFor: ""

        stdout: StdioCollector {
            id: output

            onStreamFinished: root.settle(qalc.launchedFor, output.text)
        }

        // Collected and dropped: qalc writes a diagnostic for every expression
        // it can't evaluate, which would be a log line per keystroke on a
        // half-typed Query. resultOf's answer already covers "no result".
        stderr: StdioCollector {}

        // Not a duplicate of the collector's handler: stream-close and process-
        // exit order isn't guaranteed, so this settles again to cover whichever
        // fires last -- both orders land on the same answer, neither on silence.
        onExited: {
            root.settle(qalc.launchedFor, output.text);
            root.evaluate();
        }
    }
}
