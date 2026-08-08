// The directories Provider's pure half: cache parsing, the Entry shape, and
// the commands a directory can be opened with.
//
// No path eliding here: the QML delegate already elides with
// `Text.ElideRight` (Launcher.qml), so the full relative path is handed over
// and the view does the rest.
//
// Two corpus texts per Entry -- leaf and full relative path -- not one.
// Scoring only the full path made `dev/backend.old` and
// `dev/monorepo/services/api/backend` score identically for "backend" (both
// match as one contiguous run right after a "/"), so the tie went to the
// shorter haystack and `backend.old` won over an actual directory named
// `backend`. Scoring the leaf separately breaks that tie correctly: `backend`
// is the shorter haystack on its own. The cost is roughly double the
// per-keystroke scan for one text each.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/directories.test.js).

var CACHE_DIR_NAME = "df-dir-picker";
var CACHE_FILE_NAME = "folders.list";

// How long a cache is trusted before refresh() rebuilds it in the background.
var STALE_SECONDS = 300;

var PRUNE_NAMES = [
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission"
];

// Scanned deep, in addition to $HOME one level deep.
var ROOTS = ["dotfiles", "dev"];

// The devpod devcontainer bind-mounts these at the same absolute path, so a
// remote location is just the scheme, host, and same local path.
var SSH_HOST = "devcontainer.devpod";
var MIRRORED = ["/dev", "/dotfiles", "/.agents"];

function cachePath(home) {
    return home + "/.cache/" + CACHE_DIR_NAME + "/" + CACHE_FILE_NAME;
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// One path per line, blank lines dropped. Whatever wrote the file is
// trusted -- this Provider only ever reads its own cache.
function parseCache(text) {
    if (typeof text !== "string" || text === "")
        return [];
    return text.split("\n").filter(function (line) {
        return line !== "";
    });
}

// "~" for $HOME itself, path relative to it otherwise.
function relOf(path, home) {
    if (path === home)
        return "~";
    if (home && path.indexOf(home + "/") === 0)
        return path.slice(home.length + 1);
    return path;
}

// Whether a directory is one the devcontainer also has, at the same absolute
// path -- the condition that makes an ssh:// URL meaningful for it.
function isMirrored(path, home) {
    for (var i = 0; i < MIRRORED.length; i++) {
        var root = home + MIRRORED[i];
        if (path === root || path.indexOf(root + "/") === 0)
            return true;
    }
    return false;
}

// `key` is the absolute path -- stable across restarts, so Frecency
// accumulates against it. `name` (the display text) is always the full
// relative path, never just the leaf: a bare leaf is ambiguous the moment
// two projects share a directory name, regardless of which corpus text
// (textsFor below) actually matched.
function entryFor(path, home, provider) {
    return {
        name: relOf(path, home),
        subtext: path,
        icon: "folder",
        key: path,
        provider: provider,
        target: {
            path: path,
            mirrored: isMirrored(path, home)
        }
    };
}

function leafOf(rel) {
    var at = rel.lastIndexOf("/");
    return at < 0 ? rel : rel.slice(at + 1);
}

// Leaf first (so prepare() reads it as the Entry's name and an exact leaf
// match earns EXACT_WEIGHT), then the full relative path so a Query naming a
// parent segment still matches. Deduplicated when a top-level directory's
// leaf and relative path are the same string.
function textsFor(rel) {
    var leaf = leafOf(rel);
    return leaf !== rel ? [leaf, rel] : [rel];
}

// The tmux session name a directory's Entry runs its session under: the
// relative path slugged, "/" -> "-", "home" for $HOME itself. A hyphen the
// path already contains survives, so the slug isn't injective (~/dev/foo and
// ~/dev-foo both name session "dev-foo", first one wins) -- accepted, not
// defended against.
//
// "." and ":" -> "_": those are target separators in tmux's own grammar (a
// name containing one parses as window.pane, so `new-window -t` fails).
// Found via ~/.agents (a mirrored root) naming its session ".agents", where
// the leading dot tripped it. "_" rather than "-" so a dot-led path doesn't
// open its session name with a dash.
function sessionNameOf(path, home) {
    var rel = relOf(path, home);
    if (rel === "~")
        return "home";
    return rel.split("/").join("-").split(".").join("_").split(":").join("_");
}

// `host` is the resolved custom host, or falsy to mean "use the default" --
// the fallback the devcontainer-host state file's contract promises (blank
// or missing = default). SSH_HOST is that shared default; bin/df-tmux-session
// (ticket 02) and the Quick Settings row (ticket 03) must honor the same rule.
function sshUrlFor(path, host) {
    return "ssh://" + (host || SSH_HOST) + path;
}

// `routed` is the caller's already-resolved decision -- isMirrored(path,
// home) AND the routing toggle -- not isMirrored's raw answer. The toggle
// overrides isMirrored rather than layering on top of it, so this function
// never sees "mirrored but routing is off": the caller has already collapsed
// that to false before calling.
function defaultOpenArgv(path, routed, launchPrefix, host) {
    var target = routed ? sshUrlFor(path, host) : path;
    return (launchPrefix || []).concat(["zeditor", target]);
}

// A ghostty window on the session script (bin/df-tmux-session), with the
// directory's session name and its path as separate arguments.
//
// The path is passed raw, not through shellEscape: ghostty 1.2+ execs its
// `-e` arguments verbatim (no shell round-trip), so single-quote doubling
// would reach the session script as literal text. Escaping only matters
// where a shell re-parses the argument, which is inside the session script
// itself -- it owns that escape.
function tmuxLaunchArgv(path, home) {
    return [
        "ghostty", "-e",
        home + "/dotfiles/bin/df-tmux-session",
        sessionNameOf(path, home),
        path
    ];
}

// The secondary Action's chooser. Files carries no remote command at all, so
// a mirrored directory still opens it locally.
//
// Tmux opens the window on the session script rather than on the directory
// itself, so it needs `home` too (the script path and session name both
// derive from it), and runs locally even for a mirrored directory (the
// script owns the remote window) -- same argv either way, unaffected by
// `routed`/`host` (it re-resolves both itself, per ticket 02).
//
// Tmux is `scoped: false`, unlike Files: an unscoped Tmux window is the
// launcher's child and dies with it, which is fine here because the ghostty
// window is only a client -- tmux detaches the client and the session lives
// on. That's not true for an editor, which is why Files keeps the launch
// prefix (so `df-qs-restart launcher` doesn't take its window down).
function chooserApps(path, routed, home, host) {
    var target = routed ? sshUrlFor(path, host) : path;
    var sshHost = host || SSH_HOST;

    function pick(local, remote) {
        return routed && remote ? remote : local;
    }

    return [
      {
          // `target` is the session name, not the path the other rows show
          // -- it's what the row attaches you to and what appears in `tmux ls`.
          name: "Tmux", icon: "utilities-terminal",
          target: sessionNameOf(path, home),
          scoped: false,
          argv: tmuxLaunchArgv(path, home)
      },
        {
            name: "Zed", icon: "zed", target: target,
            argv: pick(["zeditor", path], ["zeditor", target])
        },
        {
            name: "VSCode", icon: "vscode", target: target,
            argv: pick(["code", path], ["code", "--remote", "ssh-remote+" + sshHost, path])
        },
        {
            name: "Cursor", icon: "cursor", target: target,
            argv: pick(["cursor", path], ["cursor", "--remote", "ssh-remote+" + sshHost, path])
        },
        {
            name: "Neovim", icon: "nvim", target: target,
            argv: pick(
                ["ghostty", "--working-directory=" + path, "-e", "nvim"],
                // Escaped, unlike the other four: this argument isn't run
                // locally -- it's handed whole to `ssh`, parsed by a shell on
                // the *other* end, so a path with a space would otherwise
                // break silently.
                ["ghostty", "-e", "ssh", "-t", sshHost, "cd " + shellEscape(path) + " && exec nvim"]
            )
        },
        {
            // No remote command at all -- Files is always local.
            name: "Files", icon: "folder",
            target: path,
            argv: ["nautilus", path]
        }
    ];
}

// No `key`: these don't recur the way a directory does -- the directory
// itself already recorded a choice on the secondary Action that opened this.
function chooserEntriesFor(path, routed, home, launchPrefix, provider, host) {
    var prefix = launchPrefix || [];
    return chooserApps(path, routed, home, host).map(function (app) {
        return {
            name: app.name,
            subtext: app.target,
            icon: app.icon,
            provider: provider,
            target: { argv: app.scoped === false ? app.argv : prefix.concat(app.argv) }
        };
    });
}

// $HOME one level deep (so plain folders like Downloads are reachable,
// hidden entries skipped), then the dev roots six deep, pruned and
// deduplicated. The cache path and format are inherited unchanged, so an
// existing ~/.cache/df-dir-picker/folders.list still reads.
//
// A root that doesn't exist is left to `find` to fail quietly on
// (`2>/dev/null`) rather than checked for first -- neither this module nor
// the Provider has a synchronous way to ask, and a missing root contributing
// nothing is the same outcome either way.
function buildCacheScript(home) {
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

// Guarded so refresh() can be called on every Launcher open for free:
// skipped while a build is already running (the tmp file is its own lock) or
// while the cache is younger than STALE_SECONDS. Missing entirely counts as
// stale, which is what builds a cache at all on a fresh machine.
function refreshScript(home) {
    var cache = cachePath(home);
    var tmp = cache + ".tmp";

    return "[ -e " + shellEscape(tmp) + " ] && exit 0; "
        + "age=$(( $(date +%s) - $(stat -c %Y " + shellEscape(cache) + " 2>/dev/null || echo 0) )); "
        + "if [ ! -s " + shellEscape(cache) + " ] || [ \"$age\" -gt " + STALE_SECONDS + " ]; then "
        + buildCacheScript(home) + "; fi";
}

function refreshCommand(home) {
    return ["sh", "-c", refreshScript(home)];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        STALE_SECONDS: STALE_SECONDS,
        PRUNE_NAMES: PRUNE_NAMES,
        ROOTS: ROOTS,
        SSH_HOST: SSH_HOST,
        MIRRORED: MIRRORED,
        cachePath: cachePath,
        parseCache: parseCache,
        relOf: relOf,
        isMirrored: isMirrored,
        entryFor: entryFor,
        leafOf: leafOf,
        textsFor: textsFor,
        sessionNameOf: sessionNameOf,
        sshUrlFor: sshUrlFor,
        defaultOpenArgv: defaultOpenArgv,
        tmuxLaunchArgv: tmuxLaunchArgv,
        chooserApps: chooserApps,
        chooserEntriesFor: chooserEntriesFor,
        buildCacheScript: buildCacheScript,
        refreshScript: refreshScript,
        refreshCommand: refreshCommand
    };
}
