var INDEX_DIR_NAME = "df-dir-picker";
var INDEX_FILE_NAME = "folders.list";

var PRUNE_NAMES = [
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission"
];

var ROOTS = ["dotfiles", "dev"];

function indexPath(home) {
    return home + "/.cache/" + INDEX_DIR_NAME + "/" + INDEX_FILE_NAME;
}

// Not injective -- same acceptance as directories.js's sessionNameOf.
function slugHost(host) {
    return String(host).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function remoteIndexPath(home, host) {
    return home + "/.cache/" + INDEX_DIR_NAME + "/remote-" + slugHost(host) + ".list";
}

function scanPath(home) {
    return indexPath(home) + ".scan";
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function parse(text) {
    if (typeof text !== "string" || text === "")
        return [];
    return text.split("\n").filter(function (line) {
        return line !== "";
    });
}

function serialize(paths) {
    return paths.length === 0 ? "" : paths.join("\n") + "\n";
}

function hasPrunedSegment(relativePath) {
    var segments = relativePath.split("/");
    for (var i = 0; i < segments.length; i++) {
        if (PRUNE_NAMES.indexOf(segments[i]) >= 0)
            return true;
    }
    return false;
}

function inScope(path, home) {
    if (path === home)
        return true;
    if (!home || path.indexOf(home + "/") !== 0)
        return false;

    var relative = path.slice(home.length + 1);
    if (relative === "" || hasPrunedSegment(relative))
        return false;

    var segments = relative.split("/");
    if (segments.length === 1)
        return segments[0].charAt(0) !== ".";

    if (ROOTS.indexOf(segments[0]) < 0)
        return false;
    return segments.length - 1 <= 6;
}

function validateCandidate(text, home) {
    if (typeof text !== "string" || text === "")
        return { ok: false, paths: [], error: "empty Directory Index" };
    if (text.charAt(text.length - 1) !== "\n")
        return { ok: false, paths: [], error: "incomplete Directory Index record" };
    if (text.charAt(0) === "\n" || text.indexOf("\0") >= 0
            || text.indexOf("\r") >= 0 || text.indexOf("\n\n") >= 0)
        return { ok: false, paths: [], error: "unparseable Directory Index data" };

    var paths = parse(text);
    if (paths.indexOf(home) < 0)
        return { ok: false, paths: [], error: "Directory Index does not contain home" };

    var seen = {};
    for (var i = 0; i < paths.length; i++) {
        if (!inScope(paths[i], home))
            return { ok: false, paths: [], error: "path outside Directory Index scope: " + paths[i] };
        if (seen[paths[i]])
            return { ok: false, paths: [], error: "duplicate Directory Index path: " + paths[i] };
        seen[paths[i]] = true;
    }

    return { ok: true, paths: paths, error: "" };
}

function samePaths(left, right) {
    if (left.length !== right.length)
        return false;
    for (var i = 0; i < left.length; i++) {
        if (left[i] !== right[i])
            return false;
    }
    return true;
}

function preparePublication(snapshot, text, home) {
    var next = validateCandidate(text, home);
    if (!next.ok) {
        return {
            ok: false,
            changed: false,
            text: "",
            snapshot: snapshot,
            error: next.error
        };
    }
    if (samePaths(snapshot.paths, next.paths)) {
        return {
            ok: true,
            changed: false,
            text: "",
            snapshot: snapshot,
            error: ""
        };
    }
    return {
        ok: true,
        changed: true,
        text: text,
        snapshot: {
            paths: next.paths,
            revision: snapshot.revision + 1
        },
        error: ""
    };
}

function committedSnapshot(snapshot, prepared, persisted) {
    if (!persisted || !prepared || !prepared.ok || !prepared.changed)
        return snapshot;
    return prepared.snapshot;
}

function loadSnapshot(text, home, accessPending) {
    var loaded = validateCandidate(text, home);
    if (!loaded.ok) {
        return {
            snapshot: { paths: [], revision: 0 },
            scan: true,
            error: loaded.error
        };
    }

    return {
        snapshot: { paths: loaded.paths, revision: 1 },
        scan: accessPending === true,
        error: ""
    };
}

function idleSchedule() {
    return { running: false, pending: false };
}

function requestScan(schedule) {
    if (schedule.running) {
        return {
            schedule: { running: true, pending: true },
            scan: false
        };
    }

    return {
        schedule: { running: true, pending: false },
        scan: true
    };
}

function settleScan(schedule) {
    if (schedule.pending) {
        return {
            schedule: { running: true, pending: false },
            scan: true
        };
    }

    return {
        schedule: idleSchedule(),
        scan: false
    };
}

function finishAttempt(schedule, snapshot, prepared, persisted) {
    var settled = settleScan(schedule);
    return {
        snapshot: committedSnapshot(snapshot, prepared, persisted),
        schedule: settled.schedule,
        scan: settled.scan
    };
}

function buildScanScript(home) {
    var dir = home + "/.cache/" + INDEX_DIR_NAME;
    var scan = scanPath(home);
    var raw = scan + ".raw";
    var next = scan + ".tmp";

    var pruneArgs = PRUNE_NAMES.map(function (name) {
        return "-name " + shellEscape(name);
    }).join(" -o ");

    var homeScan = "find " + shellEscape(home) + " -mindepth 1 -maxdepth 1 "
        + "\\( " + pruneArgs + " -o -name '.*' \\) -prune -o -type d -print >> " + shellEscape(raw);

    var rootScans = ROOTS.map(function (name) {
        var root = home + "/" + name;
        return "{ [ ! -d " + shellEscape(root) + " ] || find " + shellEscape(root)
            + " -maxdepth 6 -type d \\( " + pruneArgs + " \\) -prune "
            + "-o -type d -print >> " + shellEscape(raw) + "; }";
    }).join(" && ");

    return "mkdir -p " + shellEscape(dir) + " && { "
        + "printf '%s\\n' " + shellEscape(home) + " > " + shellEscape(raw) + " && "
        + homeScan + " && "
        + rootScans + " && "
        + "sort -u " + shellEscape(raw) + " > " + shellEscape(next) + " && "
        + "mv " + shellEscape(next) + " " + shellEscape(scan) + " && "
        + "rm -f " + shellEscape(raw) + "; "
        + "}";
}

function accessCommand(home) {
    return ["sh", "-c", buildScanScript(home)];
}

// Same scan script as accessCommand, over ssh instead of a local shell, with
// the scan file tailed to stdout -- this machine can't read it off the
// remote host's disk the way accessCommand reads its own local file (ticket 91).
function remoteAccessCommand(home, host) {
    return ["ssh", host, buildScanScript(home) + " && cat " + shellEscape(scanPath(home))];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        PRUNE_NAMES: PRUNE_NAMES,
        ROOTS: ROOTS,
        indexPath: indexPath,
        slugHost: slugHost,
        remoteIndexPath: remoteIndexPath,
        scanPath: scanPath,
        parse: parse,
        serialize: serialize,
        inScope: inScope,
        validateCandidate: validateCandidate,
        samePaths: samePaths,
        preparePublication: preparePublication,
        committedSnapshot: committedSnapshot,
        loadSnapshot: loadSnapshot,
        idleSchedule: idleSchedule,
        requestScan: requestScan,
        settleScan: settleScan,
        finishAttempt: finishAttempt,
        buildScanScript: buildScanScript,
        accessCommand: accessCommand,
        remoteAccessCommand: remoteAccessCommand
    };
}
