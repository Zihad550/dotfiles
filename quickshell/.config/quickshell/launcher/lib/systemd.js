// The systemd Provider's pure half: parsing `systemctl list-units` output,
// building Entries that say which scope a unit is in, and the argv the
// restart Action runs -- the one Action here with privilege handling.
//
// The scope isn't decoration -- it's the privilege boundary. The restart
// command differs by scope, so an Entry that hid which scope it came from
// could make a row that looks like a user unit restart a system unit under
// authorization it never asked for. The scope is part of both the displayed
// text and the argv.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/systemd.test.js).

// One `systemctl list-units` line -> { unit, description }, or null.
// Columns are UNIT LOAD ACTIVE SUB DESCRIPTION -- four fixed fields, then the
// description (which may itself contain spaces). Trimmed before splitting so
// a padded/right-aligned unit name doesn't come back as "" and get dropped.
function parseLine(line) {
    if (typeof line !== "string")
        return null;

    var fields = line.trim().split(/\s+/);
    if (fields.length < 4)
        return null;

    var unit = fields[0];
    if (unit === "" || unit.indexOf(".service") < 0)
        return null;

    return { unit: unit, description: fields.slice(4).join(" ") };
}

// The header line is dropped by the ".service" check rather than listed as a unit.
function parseListing(text) {
    if (typeof text !== "string" || text === "")
        return [];

    var out = [];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var unit = parseLine(lines[i]);
        if (unit !== null)
            out.push(unit);
    }
    return out;
}

function scopes() {
    return ["user", "system"];
}

// Scope first: it's the one that decides what the key will run.
function subtextFor(scope, description) {
    var parts = [scope];
    if (description && description !== "")
        parts.push(description);
    return parts.join(" · ");
}

// No Entry Key: a unit isn't a recurring choice with identity worth
// learning -- restarting it twice in a row usually means the same fault, not
// a habit to promote.
function entryFor(unit, scope, provider) {
    return {
        name: unit.unit,
        subtext: subtextFor(scope, unit.description),
        icon: "system-services",
        provider: provider,
        target: { unit: unit.unit, scope: scope }
    };
}

// Unit name first (so it reads as the Entry's name), then the stem ("ssh"
// from "ssh.service"), then the description -- each dropped when redundant.
function textsFor(item, entry) {
    var texts = [entry.name];

    var stem = item.unit.slice(0, -".service".length);
    if (stem !== item.unit && stem !== "")
        texts.push(stem);

    if (item.description && item.description !== "" && item.description !== stem)
        texts.push(item.description);

    return texts;
}

// Deliberately not `sudo`: sudo asks for a password on a terminal, which a
// detached exec from a launcher doesn't have, so it would fail silently
// whenever credentials weren't already cached. Plain `systemctl restart` as
// an ordinary user instead asks polkit for
// org.freedesktop.systemd1.manage-units, and the session's authentication
// agent (hyprpolkitagent.service) puts up a password dialog with no terminal
// involved -- the privilege boundary is unchanged, but a denial is now
// visible. Not pkexec either: pkexec's dialog says "run this program as
// root" rather than naming the unit.
//
// The Launcher is an overlay-layer surface painted above the polkit dialog,
// so Systemd.qml closes on restart rather than staying open and hiding it.
function restartArgv(scope, unit) {
    if (scope === "system")
        return ["systemctl", "restart", unit];
    return ["systemctl", "--user", "restart", unit];
}

// The exit code is the whole signal: systemctl exits 0 only when the unit
// actually came back up. stderr is passed through on failure since
// systemctl's own message ("Interactive authentication required" vs. "Job
// for x.service failed") is more useful than anything this could invent.
function notifyArgv(unit, exitCode, stderr) {
    if (exitCode === 0)
        return ["notify-send", "Service restarted", unit];

    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Restart failed: " + unit, detail];
}

// Listing needs no sudo: listing is reading.
function listCommand(scope) {
    var argv = ["systemctl"];
    if (scope === "user")
        argv.push("--user");
    argv.push("list-units", "--type=service", "--state=running", "--no-legend", "--no-pager");
    return argv;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseLine: parseLine,
        parseListing: parseListing,
        scopes: scopes,
        subtextFor: subtextFor,
        entryFor: entryFor,
        textsFor: textsFor,
        restartArgv: restartArgv,
        notifyArgv: notifyArgv,
        listCommand: listCommand
    };
}
