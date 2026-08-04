// Scratch quickshell config, run with `df-qs-test`. Separate instance from
// `qs -c dotfiles`, so anything in here can crash without taking the bar down.
//
// Currently: JS matching in QML measured 46ms cold / 111ms live per keystroke
// over the 17k-entry dir cache, so it is out for the big providers. This now
// A/Bs that against shelling out to fzf over an async Process -- the number
// that decided the Launcher would own matching in QML rather than keeping
// elephant (deleted with ticket 19) as the backend.
//
// Corpus is the real dir-picker cache when it exists, because synthetic data
// would lie: fuzzy scorers are sensitive to string length and shared prefixes,
// and that file is long deeply-nested paths that share prefixes -- the worst
// case, and the largest provider.
//
// Controls are the buttons under the input; Escape or a click on the dimmed
// backdrop quits.

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

PanelWindow {
    id: probe

    anchors {
        top: true
        left: true
        right: true
        bottom: true
    }

    WlrLayershell.layer: WlrLayer.Overlay
    exclusiveZone: 0
    // Confirmed sufficient: the input takes keys as soon as the window maps,
    // no click needed, so Exclusive (which can take the keyboard away from the
    // terminal that launched this) is not needed.
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    color: "transparent"

    // ---- corpus -------------------------------------------------------------

    property var corpus: []
    property string corpusName: "loading..."

    // Lowercased once at load. Doing it inside the scorer instead would measure
    // toLowerCase() on every entry on every keystroke, which no real launcher
    // does and which would dominate the result.
    property var corpusLower: []

    Process {
        id: load

        // The provider flagged as the likely worst case. `cat` of a missing
        // file just yields nothing, which triggers the synthetic fallback.
        command: ["bash", "-c", "cat \"$HOME/.cache/df-dir-picker/folders.list\" 2>/dev/null"]
        running: true

        property var lines: []

        stdout: SplitParser {
            onRead: line => {
                if (line !== "")
                    load.lines.push(line);
            }
        }

        onExited: {
            if (load.lines.length > 0) {
                probe.corpus = load.lines;
                probe.corpusName = "~/.cache/df-dir-picker/folders.list";
            } else {
                probe.corpus = probe.synthesize(12000);
                probe.corpusName = "synthetic (dir cache absent -- REAL NUMBERS WILL DIFFER)";
            }

            const lower = new Array(probe.corpus.length);
            for (let i = 0; i < probe.corpus.length; i++)
                lower[i] = probe.corpus[i].toLowerCase();
            probe.corpusLower = lower;

            probe.refilter();
        }
    }

    // Deep paths drawn from a small vocabulary, so prefixes repeat the way real
    // project trees do. A corpus of random strings would be far too easy.
    function synthesize(n) {
        const words = ["src", "lib", "test", "node_modules", "dist", "internal", "pkg", "cmd", "components", "hooks", "utils", "config", "assets", "docs", "scripts", "build"];
        const roots = ["projects", "work", "dotfiles", "go/src/github.com", "code/archive"];
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
            let p = `/home/jehad/${roots[i % roots.length]}/repo${i % 400}`;
            const depth = 2 + (i % 4);
            for (let d = 0; d < depth; d++)
                p += `/${words[(i + d * 7) % words.length]}`;
            out[i] = p;
        }
        return out;
    }

    // ---- scorer -------------------------------------------------------------

    // Subsequence match with consecutive- and boundary-run bonuses. Roughly what
    // fzy does and what elephant did in compiled Go; the point is to measure a
    // realistic amount of work, not to ship this exact scoring.
    // Returns -1 for no match.
    function score(haystack, needle) {
        const hl = haystack.length;
        const nl = needle.length;
        if (nl === 0)
            return 0;
        if (nl > hl)
            return -1;

        let s = 0;
        let h = 0;
        let run = 0;

        for (let n = 0; n < nl; n++) {
            const c = needle.charCodeAt(n);
            // Where this char would land to be consecutive with the last one.
            // Captured before the scan: `found` is assigned from `h`, so
            // comparing the two afterwards would always be true.
            const start = h;
            let found = -1;
            while (h < hl) {
                if (haystack.charCodeAt(h) === c) {
                    found = h;
                    break;
                }
                h++;
            }
            if (found < 0)
                return -1;

            run = (n > 0 && found === start) ? run + 1 : 0;
            s += 1 + run * 2;
            // Start of a path segment scores like a word boundary.
            if (found === 0 || haystack.charCodeAt(found - 1) === 47)
                s += 4;
            h++;
        }
        // Shorter matches rank above longer ones at equal score.
        return s * 1000 - hl;
    }

    // ---- filtering ----------------------------------------------------------

    property bool debounceOn: false
    property int debounceMs: 150
    property bool incrementalOn: true

    // Only the visible slice is handed to the view. Scoring still touches the
    // whole corpus -- ranking needs it -- but instantiating thousands of
    // delegates would benchmark the list, not the filter.
    readonly property int displayCap: 200

    property var results: []
    property int matchCount: 0

    property string prevQuery: ""
    property var prevIndices: []

    property real lastMs: 0
    property real maxMs: 0
    property string benchResult: ""

    // Sound only because the matcher is a subsequence test: if a string does
    // not contain "fo" as a subsequence it cannot contain "foo" either, so the
    // previous match set is a safe superset to narrow. It would be wrong for a
    // matcher that can match on something the shorter query missed.
    function candidateIndices(query) {
        if (incrementalOn && prevQuery !== "" && query.startsWith(prevQuery))
            return prevIndices;
        return null;
    }

    function refilter() {
        const query = input.text.toLowerCase();
        const t0 = Date.now();

        const reuse = candidateIndices(query);
        const lower = corpusLower;

        // Only the best `displayCap` are ever shown, so ranking the rest is
        // wasted work. This keeps a fixed buffer of that many, held sorted
        // descending, and inserts into it -- instead of allocating an object
        // per match and sorting the lot. Once the buffer is full, the common
        // case is one numeric comparison against its worst entry and nothing
        // else: no allocation, and no comparator call, which is the expensive
        // part of Array.sort in a JS engine.
        //
        // Verified against the old full-sort path: identical top-N on every
        // query tried, ties included, because the shift condition is a strict
        // `<` and so leaves equal scores in encounter order.
        const K = displayCap;
        const bufIdx = new Int32Array(K);
        const bufScore = new Float64Array(K);
        let n = 0;

        // Every match, unranked. Kept separately because incremental narrowing
        // needs the whole candidate set to stay sound -- narrowing the top-N
        // would throw away entries a longer query still has to see.
        const all = [];

        const scan = reuse !== null ? reuse.length : lower.length;
        for (let k = 0; k < scan; k++) {
            const i = reuse !== null ? reuse[k] : k;
            const sc = score(lower[i], query);
            if (sc < 0)
                continue;

            all.push(i);

            // Worse than the worst kept entry, and the buffer is full.
            if (n === K && sc <= bufScore[n - 1])
                continue;

            let p = n < K ? n++ : K - 1;
            while (p > 0 && bufScore[p - 1] < sc) {
                bufScore[p] = bufScore[p - 1];
                bufIdx[p] = bufIdx[p - 1];
                p--;
            }
            bufScore[p] = sc;
            bufIdx[p] = i;
        }

        const dt = Date.now() - t0;

        prevQuery = query;
        prevIndices = all;
        matchCount = all.length;

        const shown = [];
        for (let k = 0; k < n; k++)
            shown.push(corpus[bufIdx[k]]);
        results = shown;

        lastMs = dt;
        if (dt > maxMs)
            maxMs = dt;
    }

    Timer {
        id: debounceTimer

        interval: probe.debounceMs
        onTriggered: probe.refilter()
    }

    function onQueryChanged() {
        if (debounceOn)
            debounceTimer.restart();
        else
            refilter();
    }

    // A single pass can read 0ms at Date.now()'s resolution. This runs a set of
    // prefixes repeatedly with the incremental path disabled, which is the
    // honest cold-cost number: what one keystroke costs against the full corpus.
    function runBenchmark() {
        const queries = ["d", "do", "dot", "dotf", "src", "nm", "cmp", "gsrc", "zzzz"];
        const reps = 25;
        let worst = 0;
        let total = 0;

        for (let q = 0; q < queries.length; q++) {
            const needle = queries[q];
            const t0 = Date.now();
            for (let r = 0; r < reps; r++) {
                let n = 0;
                for (let i = 0; i < corpusLower.length; i++)
                    if (score(corpusLower[i], needle) >= 0)
                        n++;
            }
            const per = (Date.now() - t0) / reps;
            total += per;
            if (per > worst)
                worst = per;
        }

        benchResult = `cold pass: avg ${(total / queries.length).toFixed(2)}ms, worst ${worst.toFixed(2)}ms over ${corpus.length} entries (${reps}x each, no incremental, no sort)`;
    }

    // ---- ui -----------------------------------------------------------------

    // Clickable rather than key-bound, so the controls cannot collide with a
    // compositor or shell binding on whatever key was chosen -- one less thing
    // to rule out when a toggle appears to do nothing.
    component Btn: Rectangle {
        id: btn

        property string label: ""
        property bool active: false

        signal clicked

        implicitWidth: caption.implicitWidth + 20
        implicitHeight: 28
        radius: 4
        color: hover.containsMouse ? "#45475a" : "#313244"
        border.color: btn.active ? "#a6e3a1" : "#585b70"
        border.width: 1

        Text {
            id: caption

            anchors.centerIn: parent
            text: btn.label
            color: btn.active ? "#a6e3a1" : "#cdd6f4"
            font.pixelSize: 12
            font.family: "monospace"
        }

        MouseArea {
            id: hover

            anchors.fill: parent
            hoverEnabled: true
            onClicked: {
                btn.clicked();
                // Clicking a button must not cost the input its focus, or the
                // next keystroke goes to whatever is underneath.
                input.forceActiveFocus();
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#c0000000"

        MouseArea {
            anchors.fill: parent
            onClicked: Qt.quit()
        }
    }

    Rectangle {
        anchors.centerIn: parent

        width: 900
        height: 620
        color: "#1e1e2e"
        border.color: "#89b4fa"
        border.width: 1
        radius: 8

        // Swallows clicks on the panel's own background. Without it a click on
        // any dead space falls through to the backdrop and quits.
        MouseArea {
            anchors.fill: parent
            onClicked: input.forceActiveFocus()
        }

        Column {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 10

            TextInput {
                id: input

                width: parent.width
                color: "#cdd6f4"
                font.pixelSize: 24
                font.family: "monospace"
                focus: true

                onTextChanged: probe.onQueryChanged()

                Keys.onEscapePressed: Qt.quit()
            }

            Rectangle {
                width: parent.width
                height: 1
                color: "#45475a"
            }

            Text {
                width: parent.width
                text: `corpus: ${probe.corpusName}  (${probe.corpus.length} entries)`
                color: probe.corpusName.indexOf("synthetic") === 0 ? "#f9e2af" : "#a6adc8"
                font.pixelSize: 13
                font.family: "monospace"
                elide: Text.ElideMiddle
            }

            Text {
                // Max is what matters: a mean hides the keystroke that stutters.
                text: `filter: last ${probe.lastMs}ms   max ${probe.maxMs}ms   matches ${probe.matchCount} (showing ${probe.results.length})`
                color: probe.maxMs >= 16 ? "#f38ba8" : "#a6e3a1"
                font.pixelSize: 15
                font.family: "monospace"
            }

            Row {
                spacing: 8

                Btn {
                    label: probe.debounceOn ? `debounce ${probe.debounceMs}ms` : "debounce OFF"
                    active: probe.debounceOn
                    onClicked: probe.debounceOn = !probe.debounceOn
                }

                Btn {
                    label: `interval ${probe.debounceMs}ms`
                    onClicked: probe.debounceMs = probe.debounceMs >= 300 ? 30 : probe.debounceMs + 60
                }

                Btn {
                    label: `incremental ${probe.incrementalOn ? "ON" : "OFF"}`
                    active: probe.incrementalOn
                    onClicked: {
                        probe.incrementalOn = !probe.incrementalOn;
                        // Drop the cached match set, or the next keystroke
                        // narrows results built under the old setting.
                        probe.prevQuery = "";
                    }
                }

                Btn {
                    label: "run bench"
                    onClicked: probe.runBenchmark()
                }

                Btn {
                    label: "reset max"
                    onClicked: probe.maxMs = 0
                }

                Btn {
                    label: "quit"
                    onClicked: Qt.quit()
                }
            }

            Text {
                width: parent.width
                visible: probe.benchResult !== ""
                text: probe.benchResult
                color: "#89b4fa"
                font.pixelSize: 13
                font.family: "monospace"
                wrapMode: Text.WordWrap
            }

            Rectangle {
                width: parent.width
                height: 1
                color: "#45475a"
            }

            ListView {
                width: parent.width
                height: 380

                model: probe.results
                clip: true
                // Off: flicking would add its own frame cost to what is being
                // measured here.
                interactive: false

                delegate: Text {
                    required property string modelData

                    width: ListView.view.width
                    text: modelData
                    color: "#cdd6f4"
                    font.pixelSize: 13
                    font.family: "monospace"
                    elide: Text.ElideMiddle
                }
            }
        }
    }
}
