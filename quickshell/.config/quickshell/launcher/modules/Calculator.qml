import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/calc.js" as Calc

// The calculator Provider: an arithmetic expression typed into the Query gets
// its answer in the list, and Return puts that answer on the clipboard.
//
// The arithmetic is qalc's -- libqalculate, the same binary elephant shelled
// out to. See the header of lib/calc.js for why that dependency is kept rather
// than replaced with an expression evaluator written here, and for every rule
// this file defers to: which Queries are worth a process, what its output
// means, and which answer belongs to which Query.
//
// The Provider interface it fills -- label, ready, actions, and the shape of an
// Entry -- is documented at the top of Applications.qml, with **one deliberate
// difference**: this Provider has no `catalog`. It is not ranked. Its Entry is
// appended to the pool by Launcher.qml rather than scored against the Query,
// because there is nothing to match it *against* -- the Entry is generated from
// the Query, so a corpus holding it would hold a copy of the needle and score
// above everything else on the screen. See the note on `localEntries` in
// Launcher.qml.
//
// It is also the first Provider whose Entries depend on the Query, which is why
// `queryText` is a required property: the Launcher hands it down, and this
// Provider's `entries` is a binding over it.
QtObject {
    id: root

    readonly property string label: "calculator"
    readonly property string description: "Evaluate an expression"

    // Nothing to load. An empty Provider here means the Query is not one to
    // calculate, which is an answer rather than a fault.
    readonly property bool ready: true

    // Walker's own prefix for this provider (walker/.config/walker/config.toml
    // -- deleted with ticket 19)
    // -- ticket 11 is what makes it reachable here. Read by lib/routing.js
    // through Launcher.qml; nothing in this file consults it.
    readonly property string prefix: "="

    // The Query, handed down by the window. Required rather than defaulted,
    // because a Provider silently bound to "" would simply never produce a row
    // and there would be nothing to see.
    required property string queryText

    // The answer in hand: { query, text }, tagged with the Query it was
    // computed for. The tag is not bookkeeping -- entriesFor refuses an answer
    // whose Query is no longer the Query, which is what makes a result arriving
    // late impossible to show against the wrong expression. null before the
    // first calculation of the session.
    property var answer: null

    // None or one. Every rule about which is in lib/calc.js, where it is under
    // test; what is here is the process that cannot be.
    readonly property var entries: Calc.entriesFor(root.queryText, root.answer, root)

    // Whether an answer to the Query being typed right now is still coming.
    //
    // Read by the web search, and it closes a real hole rather than being
    // informational. Between the keystroke that finishes "1234*7" and qalc
    // answering, this Provider has no Entry -- so without this the Launcher
    // would have no local answer, the web search would offer to Google the
    // expression, and being the only row it would be the highlighted one.
    // Return during that window would open a browser instead of copying 8638.
    // A window measured in milliseconds is still one the hand can land in.
    //
    // Tied to the process actually running, not to "no answer yet", so a qalc
    // that cannot start does not suppress the web search forever -- that would
    // trade a brief wrong answer for a permanent missing one.
    //
    // `running` does go false for the length of one statement in onExited below,
    // between the run that finished and the run that replaces it. That is not a
    // hole: it happens inside one synchronous handler, and a key press cannot be
    // delivered until the event loop is reached again -- so the flicker exists
    // for nothing that can act on it, and the highlight is re-asserted through
    // Qt.callLater afterwards, on the settled state.
    readonly property bool calculating: Calc.wanted(root.queryText) && qalc.running

    // Primary only. There is one thing to do with a result. Elephant offered a
    // second Action -- save to a calculation history -- and it is deliberately
    // not ported: it was only reachable through the `=` prefix, which ticket 11
    // wires up for routing but not for this, since nothing in the spec's user
    // stories asks for it.
    readonly property var actions: ({
        primary: {
            label: "copy result",
            invoke: entry => root.copy(entry)
        }
    })

    function copy(entry): void {
        const result = entry.target.result;

        // Cannot happen for an Entry that exists -- entriesFor produces none
        // without a result -- but a silent no-op is exactly what this Provider
        // must not do, and the two are separate functions.
        if (!result) {
            console.warn("launcher: calculator Entry with no result to copy");
            return;
        }

        Quickshell.execDetached(Calc.copyArgv(result));
    }

    // Every keystroke asks; wanted() is what makes most of them cost nothing.
    onQueryTextChanged: root.evaluate()

    // Start a calculation for the current Query, if there is one to start.
    //
    // **At most one process in flight.** A Query typed at speed would otherwise
    // leave several qalcs racing, and nothing orders their answers -- "12*" can
    // land after "12*3". Waiting instead of killing-and-restarting is what makes
    // that ordering a property of the code rather than a hope: the run that
    // finishes calls back in here for whatever the Query has become since. The
    // tag check in entriesFor still stands behind it, because a rule this file
    // enforces and a rule the pure module enforces are worth having both of when
    // the failure is a wrong answer shown confidently.
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

    // Assigned to a property rather than nested, because QtObject has no
    // default property to nest into -- the same shape every other Provider here
    // would need if it had a child.
    readonly property Process runner: Process {
        id: qalc

        // The Query this run was started for, carried on the process so the
        // answer can be tagged with it. Not read off root.queryText when the
        // answer arrives: by then it may be a different Query, which is the
        // whole thing being guarded against.
        property string launchedFor: ""

        stdout: StdioCollector {
            id: output

            onStreamFinished: root.settle(qalc.launchedFor, output.text)
        }

        // Collected and dropped. qalc writes a diagnostic for every expression
        // it cannot evaluate, and this Provider runs on a Query that is
        // half-typed most of the time, so forwarding them would put a line in
        // the log per keystroke. What matters -- "there is no result" -- is
        // already in resultOf's answer.
        stderr: StdioCollector {}

        // Settled again here, on purpose, and it is not a duplicate of the
        // collector's handler. Which of the two fires first is not something
        // this file gets to assume -- a process that exits before its stream is
        // drained settles "" here and the real answer a moment later, and one
        // whose stream closes first settles the same text twice. Both orders end
        // on the same answer, and neither ends on silence, which is the outcome
        // that would look exactly like a calculator that does not work.
        //
        // Then: the Query has almost certainly moved on while this ran.
        // evaluate() starts the next run for whatever it is now, and does
        // nothing when the answer in hand is already the right one.
        onExited: {
            root.settle(qalc.launchedFor, output.text);
            root.evaluate();
        }
    }
}
