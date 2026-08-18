var CACHE_DIR_NAME = "df-dir-picker";
var CACHE_FILE_NAME = "folders.list";
var STALE_SECONDS = 300;

var PRUNE_NAMES = [
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission"
];

var ROOTS = ["dotfiles", "dev"];

function cachePath(home) {
    return home + "/.cache/" + CACHE_DIR_NAME + "/" + CACHE_FILE_NAME;
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

function candidate(text, home) {
    var paths = parse(text);
    if (paths.length === 0)
        return { ok: false, paths: [], error: "empty Directory Index" };
    if (paths.indexOf(home) < 0)
        return { ok: false, paths: [], error: "Directory Index does not contain home" };

    for (var i = 0; i < paths.length; i++) {
        if (!inScope(paths[i], home))
            return { ok: false, paths: [], error: "path outside Directory Index scope: " + paths[i] };
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

function publish(snapshot, text, home) {
    var next = candidate(text, home);
    if (!next.ok || samePaths(snapshot.paths, next.paths))
        return snapshot;
    return {
        paths: next.paths,
        revision: snapshot.revision + 1
    };
}

function buildScanScript(home) {
    var dir = home + "/.cache/" + CACHE_DIR_NAME;
    var cache = cachePath(home);
    var tmp = cache + ".tmp";

    var pruneArgs = PRUNE_NAMES.map(function (name) {
        return "-name " + shellEscape(name);
    }).join(" -o ");

    var homeScan = "find " + shellEscape(home) + " -mindepth 1 -maxdepth 1 "
        + "\\( " + pruneArgs + " -o -name '.*' \\) -prune -o -type d -print";

    var rootArgs = ROOTS.map(function (name) {
        return shellEscape(home + "/" + name);
    }).join(" ");
    var rootScan = "find " + rootArgs + " -maxdepth 6 -type d \\( " + pruneArgs + " \\) -prune "
        + "-o -type d -print 2>/dev/null";

    return "mkdir -p " + shellEscape(dir) + " && { "
        + "printf '%s\\n' " + shellEscape(home) + "; "
        + homeScan + "; "
        + rootScan + "; "
        + "} 2>/dev/null | sort -u > " + shellEscape(tmp)
        + " && mv " + shellEscape(tmp) + " " + shellEscape(cache);
}

function accessScript(home) {
    var cache = cachePath(home);
    var tmp = cache + ".tmp";

    return "[ -e " + shellEscape(tmp) + " ] && exit 0; "
        + "age=$(( $(date +%s) - $(stat -c %Y " + shellEscape(cache) + " 2>/dev/null || echo 0) )); "
        + "if [ ! -s " + shellEscape(cache) + " ] || [ \"$age\" -gt " + STALE_SECONDS + " ]; then "
        + buildScanScript(home) + "; fi";
}

function accessCommand(home) {
    return ["sh", "-c", accessScript(home)];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        STALE_SECONDS: STALE_SECONDS,
        PRUNE_NAMES: PRUNE_NAMES,
        ROOTS: ROOTS,
        cachePath: cachePath,
        parse: parse,
        serialize: serialize,
        inScope: inScope,
        candidate: candidate,
        samePaths: samePaths,
        publish: publish,
        buildScanScript: buildScanScript,
        accessScript: accessScript,
        accessCommand: accessCommand
    };
}
