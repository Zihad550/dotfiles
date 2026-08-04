// The systemd Provider's pure half: parsing `systemctl list-units` output,
// building Entries that say which scope a unit is in, and the argv the
// restart Action runs -- the one Action here with privilege handling.
//
// Ticket 16. Ported from bin/walker/manage-systemd-processes (deleted): the
// script listed running user and system services and restarted the chosen
// one, `sudo systemctl restart` for a system unit and `systemctl --user
// restart` for a user one. The script's two listings become two Processes in
// Systemd.qml feeding one parser here, and the awk's "user:name - description"
// row shape survives as the Entry's name plus a scope-marked sub-line.
//
// The scope is not decoration. It is the privilege boundary: the restart
// command differs by scope, and an Entry that hid which scope it came from
// would make a row that looks like a user unit restart a system unit under
// authorization it never asked for. So the scope is part of the Entry's
// displayed text and part of the argv -- the same fact, spelled in both
// places.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/systemd.test.js) -- the same arrangement as matching.js.

// One `systemctl list-units` line -> { unit, description }, or null for a
// line that does not parse.
//
// The column layout is UNIT LOAD ACTIVE SUB DESCRIPTION -- four fixed fields
// and then the description, which may itself contain spaces, so the first
// field is the unit and everything from the fifth is the description. The
// same field pick the script's awk made (`$1=$2=$3=$4=""`).
//
// Trimmed before the split, the same defense the processes parser needed: a
// padded line (a unit name right-aligned by some tool) would otherwise hand
// back "" as the unit and be silently dropped.
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

// One listing's whole stdout -> the units in it. A header line ("UNIT LOAD
// ACTIVE SUB DESCRIPTION") is dropped by the ".service" check rather than
// listed as a unit.
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

// The two scopes this Provider knows, in the order the script listed them.
function scopes() {
    return ["user", "system"];
}

// The sub-line: which scope, then the description. The scope first, because
// it is the one that decides what the key will run.
function subtextFor(scope, description) {
    var parts = [scope];
    if (description && description !== "")
        parts.push(description);
    return parts.join(" · ");
}

// One unit, as the shape Systemd.qml's catalog wants.
//
// Three corpus texts per unit -- the unit name, its stem (the name without
// ".service", which is how people type "ssh"), and the description -- built
// by keylessCatalog from the textsFor below, the same arrangement as the
// windows Provider.
//
// No Entry Key: a unit is not a recurring choice with a stable identity worth
// learning -- it is infrastructure, and restarting it twice in a row is
// usually two visits to the same fault, not a habit to promote.
//
// The scope rides on the Entry -- the sub-line and the target both -- because
// it is the privilege boundary: the restart command differs by scope. See the
// header for why that difference has to be on the row.
function entryFor(unit, scope, provider) {
    return {
        name: unit.unit,
        subtext: subtextFor(scope, unit.description),
        icon: "system-services",
        provider: provider,
        target: { unit: unit.unit, scope: scope }
    };
}

// The texts one unit is found by: the unit name first -- so prepare() reads
// it as the Entry's name, the rule stated in lib/catalog.js -- then the stem,
// then the description, each dropped when it adds nothing.
function textsFor(item, entry) {
    var texts = [entry.name];

    var stem = item.unit.slice(0, -".service".length);
    if (stem !== item.unit && stem !== "")
        texts.push(stem);

    if (item.description && item.description !== "" && item.description !== stem)
        texts.push(item.description);

    return texts;
}

// The restart Action's argv -- the privilege handling the ticket names. A
// user unit restarts inside the user session; a system unit is authorized by
// polkit.
//
// **Deliberately not the script's `sudo`.** The script ran `sudo systemctl
// restart` for the system branch, and sudo asks for a password *on a
// terminal* -- which a detached exec from a launcher does not have. From a
// keybind the script therefore worked only when credentials happened to be
// cached and failed silently the rest of the time, and carrying that over
// would have carried over a failure nobody can see. Plain `systemctl restart`
// as an ordinary user is not the same command with the privilege dropped: it
// asks polkit for org.freedesktop.systemd1.manage-units, and the session's
// authentication agent (hyprpolkitagent.service, enabled by
// setup/arch-hyprland/setup-packages/setup-hyprland) puts up a password
// dialog with no terminal involved. The privilege *boundary* is what the
// ticket asks to keep, and it is unchanged -- a system unit still needs
// authorization and a user unit still does not; what changes is that being
// denied now says so.
//
// Not pkexec, which would also work: pkexec authenticates the whole command
// as root, so its dialog says "run this program as root" instead of naming
// the unit, and it wants a .policy file to read as anything better.
//
// The dialog also decides where the Launcher goes: it is an ordinary window,
// and the Launcher is an overlay-layer surface painted above every one of
// those, so a restart that leaves the Launcher open hides the very dialog it
// just raised. Hence Systemd.qml closes on restart rather than staying open --
// see the note there.
function restartArgv(scope, unit) {
    if (scope === "system")
        return ["systemctl", "restart", unit];
    return ["systemctl", "--user", "restart", unit];
}

// What the notification says when a restart finishes. The exit code is the
// whole signal: systemctl exits 0 only when the unit actually came back up,
// and non-zero covers every way it did not -- a dismissed or failed polkit
// dialog, a unit that failed to start, a name that no longer exists. The
// Launcher has closed by then (see Systemd.qml), so this notification is the
// only thing that says what happened.
//
// stderr is passed through on failure because systemctl's own message is
// better than anything this could invent: "Interactive authentication
// required" and "Job for x.service failed" are different faults with different
// fixes, and both arrive here as a non-zero code.
function notifyArgv(unit, exitCode, stderr) {
    if (exitCode === 0)
        return ["notify-send", "Service restarted", unit];

    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Restart failed: " + unit, detail];
}

// The listing invocation for one scope -- the script's exact flags, minus the
// awk. The system listing needs no sudo: listing is reading.
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
