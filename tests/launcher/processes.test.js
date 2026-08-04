// Tests for the processes Provider's pure half -- parsing `ps` output into
// Entries, and the exact argv the kill Action runs.
//
//     node --test "tests/launcher/*.test.js"
//
// The parse is the risky part: a field containing spaces lives in the middle
// of the line and the layout is fixed only in `ps`'s manual. The samples
// below are real `ps -eo pid,comm,cmd,%cpu` lines, header included -- note
// the leading spaces, since ps right-aligns the pid column and every real
// row leads with them. The first host round found the empty-Provider bug the
// untrimmed shape caused, which is why parseLine trims before splitting and
// why the sample keeps the padding.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const P = require("../../quickshell/.config/quickshell/launcher/lib/processes.js");
const CatalogCheck = require("./catalog-check.js");

// The processes Provider's catalog, composed exactly as Processes.qml
// composes it -- keylessCatalog handed this Provider's own entryFor and
// textsFor.
const catalogOf = (processes, provider) => C.keylessCatalog(processes,
    item => P.entryFor(item, provider), P.textsFor);

const PS_SAMPLE = [
    "    PID COMMAND         CMD                         %CPU",
    "   1234 firefox         /usr/bin/firefox --new-window --profile-dir=/tmp/p 12.3",
    "   2345 ghostty         ghostty -e zellij -l work attach 0.4",
    "   3456 mongod          /usr/bin/mongod --config /etc/mongod.conf 1.1",
    "   4567 sshd            sshd: user@pts/0 0.0",
    "   5678 hyprland        /usr/bin/Hyprland 6.0",
    ""
].join("\n");

test("a ps line becomes a process, name and command kept apart", () => {
    assert.deepStrictEqual(P.parseLine("   1234 firefox         /usr/bin/firefox --new-window --profile-dir=/tmp/p 12.3"), {
        pid: "1234",
        name: "firefox",
        cmd: "/usr/bin/firefox --new-window --profile-dir=/tmp/p",
        cpu: "12.3"
    });
});

test("a real ps line's leading column padding does not eat the pid", () => {
    assert.strictEqual(P.parseLine("  12086 devpod          /usr/local/bin/devpod agent  133").pid, "12086",
        "the pid column is right-aligned, so every real row starts with spaces");
});

test("a command containing spaces stays one command line", () => {
    const process = P.parseLine("2345 ghostty ghostty -e zellij -l work attach 0.4");
    assert.strictEqual(process.cmd, "ghostty -e zellij -l work attach");
});

test("the header and a blank line are not processes", () => {
    assert.strictEqual(P.parseLine("PID COMMAND CMD %CPU"), null);
    assert.strictEqual(P.parseLine(""), null);
    assert.strictEqual(P.parseLine("1234"), null, "a truncated line has no command");
});

test("the whole listing parses", () => {
    const processes = P.parseListing(PS_SAMPLE);
    assert.strictEqual(processes.length, 5);
    assert.strictEqual(processes[0].name, "firefox");
    assert.strictEqual(processes[4].pid, "5678");
});

test("an entry shows the command line with the cpu in brackets", () => {
    const built = catalogOf(P.parseListing(PS_SAMPLE), null);
    assert.strictEqual(built.entries[0].name, "firefox");
    assert.strictEqual(built.entries[0].subtext, "/usr/bin/firefox --new-window --profile-dir=/tmp/p (12.3% CPU)");
    assert.strictEqual(built.entries[0].target.pid, "1234");
    assert.strictEqual(built.entries[0].key, undefined, "no Entry Key -- a process does not recur");
});

test("a process is found by its name and by its full command line", () => {
    const built = catalogOf(P.parseListing(PS_SAMPLE), null);
    const corpus = M.prepare(built.texts, null, built.owners);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name, or an alias would quietly earn what only a name may.
    CatalogCheck.nameFirst(built);

    const byName = M.collapse(corpus, M.rank(corpus, "firefox")).indices.map(index => built.entries[index].name);
    assert.deepStrictEqual(byName, ["firefox"]);

    const byArg = M.collapse(corpus, M.rank(corpus, "zellij")).indices.map(index => built.entries[index].name);
    assert.deepStrictEqual(byArg, ["ghostty"]);
});

test("the kill Action is the script's exact command", () => {
    assert.deepStrictEqual(P.killArgv("1234"), ["kill", "-9", "1234"]);
});

test("a successful kill notifies by name, not by pid", () => {
    assert.deepStrictEqual(P.notifyArgv("firefox", 0, ""), [
        "notify-send", "Process killed", "firefox"
    ], "the row said firefox, so the notification does too");
});

test("a failed kill is critical and carries kill's own reason", () => {
    // The ordinary case: the process exited between the listing and the key
    // press, so `kill -9` has nothing to signal.
    assert.deepStrictEqual(P.notifyArgv("sleep", 1, "kill: (24601): No such process\n"), [
        "notify-send", "--urgency=critical", "Kill failed: sleep", "kill: (24601): No such process"
    ]);
    assert.deepStrictEqual(P.notifyArgv("root-thing", 1, ""), [
        "notify-send", "--urgency=critical", "Kill failed: root-thing", "exit 1"
    ], "a bare code beats an empty body");
});

test("the listing command is the script's exact invocation", () => {
    assert.deepStrictEqual(P.listCommand(), ["ps", "-eo", "pid,comm,cmd,%cpu", "--sort=-%cpu"]);
});
