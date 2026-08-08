// The processes Provider's pure half: parsing `ps` output, building Entries,
// and the argv the kill Action runs.
//
// The name is the comm (process name, "firefox"); the sub-line is the full
// command line plus CPU percentage.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/processes.test.js).

// One `ps -eo` line -> { pid, name, cmd, cpu }, or null.
// `comm` can't contain a space, `cmd` can, and %cpu is last -- so the first
// field is pid, second is name, last is cpu, middle is the command line.
//
// Trimmed *before* splitting, and that's load-bearing, not cosmetic: ps
// right-aligns the pid column, so every real row leads with spaces, and an
// untrimmed split would hand back "" as the first field.
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

    // The header row ("PID COMMAND CMD %CPU") parses by shape too, so the
    // pid must also be numeric to be accepted.
    if (!/^[0-9]+$/.test(pid) || name === "")
        return null;

    return { pid: pid, name: name, cmd: cmd, cpu: cpu };
}

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

// No Entry Key: a process doesn't recur (it's a different process after a
// restart), so there's nothing for Frecency to accumulate against.
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

// comm first (so it reads as the Entry's name), then the full command line
// unless it's just the name again.
function textsFor(item, entry) {
    var texts = [entry.name];
    if (item.cmd && item.cmd !== entry.name)
        texts.push(item.cmd);
    return texts;
}

// SIGKILL, deliberately -- matches what the tool this replaced did.
function killArgv(pid) {
    return ["kill", "-9", String(pid)];
}

// Named by the process, not the pid -- "firefox" means something, "1 24601" doesn't.
//
// The exit code is the signal: `kill -9` exits 0 when delivered, non-zero
// when it couldn't be -- e.g. a process that already exited between the
// listing and the key press (the listing can be briefly stale), or one owned
// by another user. Both used to fail silently and look identical to success
// from the list.
function notifyArgv(name, exitCode, stderr) {
    if (exitCode === 0)
        return ["notify-send", "Process killed", name];

    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Kill failed: " + name, detail];
}

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
