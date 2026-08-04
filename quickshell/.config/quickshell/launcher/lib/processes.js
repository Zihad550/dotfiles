// The processes Provider's pure half: parsing `ps` output, building Entries,
// and the argv the kill Action runs.
//
// Ticket 16. Ported from bin/walker/manage-processes (deleted): the script
// piped `ps -eo pid,comm,cmd,%cpu --sort=-%cpu` through an awk that rebuilt
// each line as "PID name cmd (cpu% CPU)". The same `ps` invocation feeds this
// module and the awk is replaced by parseListing, for the same reason every
// other Provider here keeps its parsing in a pure module: the format decision
// lives under test, where a wrong answer reads as a preference rather than a
// fault.
//
// The script's row shape survives on the Entry: the name is the comm (the
// process name, "firefox"), and the sub-line is the full command line with the
// CPU percentage -- " /usr/bin/firefox --new-window (5.2% CPU)" is what the
// row said when this was a dmenu line, so it is what the row says now.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/processes.test.js) -- the same arrangement as matching.js.

// One `ps -eo` line -> { pid, name, cmd, cpu }, or null for a line that does
// not parse.
//
// `comm` cannot contain a space, `cmd` can and does, and the %cpu column is
// last -- so the first field is the pid, the second the name, the last the
// cpu, and the middle is the command line. A line with fewer than three
// fields (the header, a truncated line) is not a process and is dropped, the
// way screenshots.js drops a listing line that does not fit.
//
// The line is trimmed *before* the split, and the trim is load-bearing, not
// cosmetic: ps right-aligns the pid column, so every real row leads with
// spaces, and an untrimmed split would hand back "" as the first field --
// which is exactly how the first host round came back empty. The awk in the
// script was spared the same trap because awk rebuilds each record with
// single-space separators, which is also what the split collapses `cmd`'s
// internal runs to -- parity, not a loss.
function parseLine(line) {
    if (typeof line !== "string")
        return null;

    var fields = line.trim().split(/\s+/);
    if (fields.length < 3)
        return null;

    var pid = fields[0];
    var name = fields[1];
    var cpu = fields[fields.length - 1];
    var cmd = fields.slice(2, fields.length - 1).join(" ");

    // The header ("PID COMMAND CMD %CPU") parses by shape, so the pid must
    // also be numeric -- the script's awk emitted the header as a row, and a
    // row named "COMMAND" is exactly the kind of thing nobody notices.
    if (!/^[0-9]+$/.test(pid) || name === "")
        return null;

    return { pid: pid, name: name, cmd: cmd, cpu: cpu };
}

// The whole of `ps`'s stdout -> the process list. A blank line (a trailing
// newline, `ps`'s own wrapping) drops out.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];

    var out = [];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var process = parseLine(lines[i]);
        if (process !== null)
            out.push(process);
    }
    return out;
}

// One process, as the shape Processes.qml's catalog wants.
//
// Two corpus texts per process -- the comm, then the full command line -- so
// "firefox" finds the browser by name and "mongodb_uri" finds it by the
// argument that says which one it is. keylessCatalog builds the `texts`/
// `owners` arrays for that, the same arrangement as the windows Provider.
//
// No Entry Key: a process does not recur (it is a different process after a
// restart), so there is nothing for Frecency to accumulate against -- the
// same opt-out the windows Provider uses, kept by keylessCatalog building no
// keys.
// The comm is the name, and it comes first among the texts for the rule
// stated in lib/catalog.js.
function entryFor(item, provider) {
    var subtext = item.cmd;
    if (item.cpu)
        subtext = (subtext === "" ? "" : subtext + " ") + "(" + item.cpu + "% CPU)";

    return {
        name: item.name,
        subtext: subtext,
        icon: "utilities-system-monitor",
        provider: provider,
        target: item
    };
}

// The texts one process is found by: its comm first -- so prepare() reads it
// as the Entry's name, the rule in lib/catalog.js -- then its full command
// line, unless the command is just the name again.
function textsFor(item, entry) {
    var texts = [entry.name];
    if (item.cmd && item.cmd !== entry.name)
        texts.push(item.cmd);
    return texts;
}

// The kill Action's argv: `kill -9 <pid>` -- the script's exact command,
// carried over unchanged. This is SIGKILL on purpose; the script chose it and
// "their destructive Actions behave as the scripts did" is the ticket.
function killArgv(pid) {
    return ["kill", "-9", String(pid)];
}

// What the notification says when a kill finishes. Named by the process, not
// the pid: the row said "firefox", and a notification saying "1 24601" would
// be about something the user never chose to look at.
//
// The exit code is the signal. `kill -9` exits 0 when the signal was
// delivered, and non-zero when it could not be -- a process that had already
// exited between the listing and the key press (which the sub-second-stale
// listing makes ordinary), or one owned by another user. Both used to be
// silent, and both look identical to success from the list, since the row is
// gone on the next open either way.
function notifyArgv(name, exitCode, stderr) {
    if (exitCode === 0)
        return ["notify-send", "Process killed", name];

    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Kill failed: " + name, detail];
}

// The ps invocation the script ran, kept field-for-field.
function listCommand() {
    return ["ps", "-eo", "pid,comm,cmd,%cpu", "--sort=-%cpu"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseLine: parseLine,
        parseListing: parseListing,
        entryFor: entryFor,
        textsFor: textsFor,
        killArgv: killArgv,
        notifyArgv: notifyArgv,
        listCommand: listCommand
    };
}
