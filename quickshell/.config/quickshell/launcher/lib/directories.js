// The directories Provider's pure half: cache parsing, the Entry shape, and
// the commands a directory can be opened with.
//
// Ported from menus/dotfiles_dirs.lua and menus/dotfiles_dir_opener.lua --
// elephant's own directories Provider (deleted with ticket 19) -- rather than
// invented. One thing did not carry over, deliberately: no Elide. The lua version shortens a long
// path by hand because GTK gives it no other way to keep both ends of a path
// visible. The QML delegate already elides with `Text.ElideRight`
// (Launcher.qml), so the full relative path is handed over and the view's
// own eliding does the rest -- one thing fewer this module has to get right
// and keep in sync with a font.
//
// **Two corpus texts per Entry, matching the lua's own `{ leaf, relative path
// }` -- this was not the first draft.** The first draft scored one text (the
// full relative path alone), on the theory that score()'s boundary bonus
// already rewards a match starting right after a "/" the way scoring the leaf
// separately would. It does not: `dev/backend.old` and
// `dev/monorepo/services/api/backend` both match "backend" as one contiguous
// run right after a "/", so both get the *same* quality, and the tie goes to
// the shorter haystack -- `backend.old` wins, which is exactly the
// misranking dotfiles_dirs.lua's own comment names as the reason it scores
// the leaf separately ("'dev/backend.old' beat a directory actually named
// 'backend' simply for sitting closer to the root"). Scoring the leaf
// separately is what separates them: `backend` is the shorter haystack, so it
// takes the length tie-break. An exact leaf match additionally earns
// EXACT_WEIGHT, because the leaf is the Entry's first text and therefore its
// name (matching.js, ticket 20) -- but that is a widening of the same gap, not
// what opens it. Pinned by a test that passes with EXACT_WEIGHT at 0.
//
// The cost is real -- roughly twice the per-keystroke scan the spec's own
// benchmark measured for one text each -- but it is the cost elephant's own
// provider already paid, not a new one this port introduces.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/directories.test.js) -- the same arrangement as matching.js,
// and for the same reason.

var CACHE_DIR_NAME = "df-dir-picker";
var CACHE_FILE_NAME = "folders.list";

// How long a cache is trusted before refresh() rebuilds it in the background.
// Elephant's own default (menus/dotfiles_dirs.lua, deleted with ticket 19).
var STALE_SECONDS = 300;

// Directories pruned out of the scan -- elephant's own list
// (menus/dotfiles_dirs.lua PRUNE, deleted with ticket 19), kept in sync with
// the old bin/df-dir-picker's build_cache() (deleted with ticket 19).
var PRUNE_NAMES = [
    ".local", "node_modules", ".git", ".obsidian-vault", ".var", "Cache",
    "cache", ".npm", ".nuget", ".cache", "Kiro", ".kiro", ".cursor",
    "Cypress", "cypress", "discord", "go", "obs-studio", "mpv", "transmission"
];

// Scanned deep, in addition to $HOME one level deep. "dotfiles", not
// ".dotfiles": the repo lives at ~/dotfiles.
var ROOTS = ["dotfiles", "dev"];

// The devpod devcontainer bind-mounts these at the same absolute path (see
// setup/devcontainer/.devcontainer/devcontainer.json), so a remote location is
// just the scheme, the host, and the same local path. Kept in sync with the
// two lua files above, which each say the same about the other.
var SSH_HOST = "devcontainer.devpod";
var MIRRORED = ["/dev", "/dotfiles", "/.agents"];

function cachePath(home) {
    return home + "/.cache/" + CACHE_DIR_NAME + "/" + CACHE_FILE_NAME;
}

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// One path per line, blank lines dropped. Whatever wrote the file is trusted
// -- this Provider only ever reads its own cache, never a directory listing
// handed to it directly.
function parseCache(text) {
    if (typeof text !== "string" || text === "")
        return [];
    return text.split("\n").filter(function (line) {
        return line !== "";
    });
}

// The fuzzy-matched text: "~" for $HOME itself, the path relative to it
// otherwise. A path outside $HOME (there should be none in the cache) is left
// whole rather than mangled.
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

// One directory, as the shape Directories.qml's catalog wants. `key` is the
// absolute path -- stable across restarts, which is the condition the spec
// puts on supplying an Entry Key at all, and what checkbox 7 asks Frecency to
// accumulate against.
//
// `name` is the *display* text -- always the full relative path, never just
// the leaf, because a leaf alone is ambiguous the moment two projects share a
// directory name. It is independent of what corpus text actually matched:
// textsFor below may find this Entry by its leaf alone, but what is shown is
// always the whole path, exactly as elephant's own `Text = rel` was.
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

// The leaf of a relative path -- "backend" from "dev/monorepo/backend", the
// whole thing when there is no "/" to split on ("~", or a top-level
// directory).
function leafOf(rel) {
    var at = rel.lastIndexOf("/");
    return at < 0 ? rel : rel.slice(at + 1);
}

// The corpus texts one Entry is found by: its leaf first -- so prepare() reads
// the leaf as the Entry's name, and an exact leaf match earns EXACT_WEIGHT --
// then its full relative path, so a Query naming a parent segment ("monorepo") or
// spanning two of them as one scattered subsequence ("monorepobackend") still
// matches, which the leaf alone cannot answer. Deduplicated the same way
// textsFor in lib/windows.js is: a top-level directory's leaf and relative
// path are the same string, and nothing is gained scoring it twice.
function textsFor(rel) {
    var leaf = leafOf(rel);
    return leaf !== rel ? [leaf, rel] : [rel];
}

// The tmux session name a directory's Entry runs its session under: the
// relative path slugged, "/" replaced with "-" -- "dev/monorepo/backend"
// is session "dev-monorepo-backend" -- and "home" for $HOME itself. A
// hyphen the path already contains survives, which makes the slug not
// injective: ~/dev/foo and ~/dev-foo both name session "dev-foo", and the
// first session wins. That is the ticket's rule as written, not a case
// this module defends against.
//
// "." and ":" are also replaced, with "_" -- they are the target separators
// in tmux's own grammar: a name containing one parses as window.pane, so
// `new-window -t` fails with "can't specify pane here". Found by the host
// verification on ticket 04: ~/.agents, a mirrored root, named its session
// ".agents", and that single leading dot tripped it. "_" rather than "-" so
// a dot-led relative path does not open its session name with a dash. See
// the Tmux entry in chooserApps for what this names.
function sessionNameOf(path, home) {
    var rel = relOf(path, home);
    if (rel === "~")
        return "home";
    return rel.split("/").join("-").split(".").join("_").split(":").join("_");
}

// The ssh:// URL a mirrored directory is reachable at from the devcontainer.
function sshUrlFor(path) {
    return "ssh://" + SSH_HOST + path;
}

// The primary Action's command: zed, over ssh for a directory the
// devcontainer mirrors, local otherwise -- elephant's own default
// (menus/dotfiles_dirs.lua's top-level `Actions["menus:default"]`, overridden
// per entry for a host-only path -- deleted with ticket 19).
//
// `mirrored` is taken rather than recomputed from `path` -- entryFor already
// paid for isMirrored() once, when the Entry was built, and it is carried on
// `entry.target` for exactly this call.
function defaultOpenArgv(path, mirrored, launchPrefix) {
    var target = mirrored ? sshUrlFor(path) : path;
    return (launchPrefix || []).concat(["zeditor", target]);
}

// The argv the Tmux chooser Entry runs: a ghostty window on the session
// script -- created by ticket 03 under bin/, this is the contract string
// naming it -- with the directory's session name and its path as separate
// arguments.
//
// The path is passed raw, not through shellEscape. Ghostty 1.2+ execs its
// `-e` arguments verbatim (initial-command is `direct:`, no shell
// round-trip -- ghostty commit 722d41a35), so single-quote doubling would
// reach the session script as literal text, quotes and backslashes
// included. Escaping a path only matters where a shell re-parses it, which
// is inside the session script, where it embeds the path into tmux command
// strings; the script owns that escape, the same way lib/files.js carries
// its own copy of shellEscape.
function tmuxLaunchArgv(path, home) {
    return [
        "ghostty", "-e",
        home + "/dotfiles/bin/df-tmux-session",
        sessionNameOf(path, home),
        path
    ];
}

// The secondary Action's chooser -- ported from
// menus/dotfiles_dir_opener.lua's APPS table. Files carries no remote command
// at all, so a mirrored directory still opens it locally: that table's own
// `remote = mirrored and app.remote ~= nil` is false whenever `app.remote` is
// absent, and Files is the one entry that leaves it out.
//
// Tmux is newer than the port, added by the directories-tmux-entry feature.
// It opens the window on the session script (tmuxLaunchArgv) rather than on
// the directory itself, which is why it takes `home` too -- the script path
// and the session name are both derived from it. It runs the session script
// locally even for a mirrored directory (the script owns the remote window),
// so like Files it is the same argv either way.
//
// Unlike Files it is `scoped: false`: the ticket specifies a plain local
// exec with no launch-prefix machinery. The accepted cost is what scope
// buys -- Files keeps the prefix so a `df-qs-restart launcher` does not take
// the nautilus window it opened down; an unscoped Tmux window is the
// launcher's child and dies with it. That is survivable for Tmux in a way it
// is not for an editor: the ghostty window is only a client, tmux detaches
// the client when the terminal goes and the session lives on.
function chooserApps(path, mirrored, home) {
    var target = mirrored ? sshUrlFor(path) : path;

    function pick(local, remote) {
        return mirrored && remote ? remote : local;
    }

    return [
      {
          // A tmux session in a ghostty window, run by the session script
          // (ticket 03, bin/df-tmux-session) with the directory's session
          // name and path. See tmuxLaunchArgv for why the path goes through
          // raw, and the header on this function for why this is local and
          // `scoped: false`. `target` is the session name rather than the
          // path the other five rows show: it is what the row attaches you
          // to and what appears in `tmux ls` -- the host verification's own
          // pass criterion.
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
            argv: pick(["code", path], ["code", "--remote", "ssh-remote+" + SSH_HOST, path])
        },
        {
            name: "Cursor", icon: "cursor", target: target,
            argv: pick(["cursor", path], ["cursor", "--remote", "ssh-remote+" + SSH_HOST, path])
        },
        {
            name: "Neovim", icon: "nvim", target: target,
            argv: pick(
                ["ghostty", "--working-directory=" + path, "-e", "nvim"],
                // Escaped, unlike the other four: this argument is not run
                // locally -- it is handed whole to `ssh`, which forwards it to
                // be parsed by a shell on the *other* end. Every other command
                // here passes `path` as its own argv element, safe from a
                // local shell that never sees it; this one builds a shell
                // command line as a string, so it is the one place a path
                // with a space in it would otherwise break silently.
                ["ghostty", "-e", "ssh", "-t", SSH_HOST, "cd " + shellEscape(path) + " && exec nvim"]
            )
        },
        {
            // No remote command at all -- Files is always local, even for a
            // mirrored directory. See the header on this function.
            name: "Files", icon: "folder",
            target: path,
            argv: ["nautilus", path]
        }
    ];
}

// The chooser's Entries, in the shape Directories.qml's catalog wants when a
// Chooser is open. No `key`: these do not recur the way a directory does, so
// there is nothing for Frecency to accumulate against -- the directory itself
// already recorded a choice on the secondary Action that opened this.
//
// `home` is new with the Tmux entry: chooserApps needs it to name the session
// and the script. The one app that declares `scoped: false` (Tmux) gets its
// argv whole rather than under the launch prefix -- see that function's
// header.
function chooserEntriesFor(path, mirrored, home, launchPrefix, provider) {
    var prefix = launchPrefix || [];
    return chooserApps(path, mirrored, home).map(function (app) {
        return {
            name: app.name,
            subtext: app.target,
            icon: app.icon,
            provider: provider,
            target: { argv: app.scoped === false ? app.argv : prefix.concat(app.argv) }
        };
    });
}

// The scan, as a shell script: $HOME one level deep (so plain folders --
// Downloads, Pictures -- are reachable, hidden entries skipped), then the dev
// roots six deep, pruned and deduplicated. Ported from
// menus/dotfiles_dirs.lua's BuildCacheCmd (deleted with ticket 19), which was
// itself bin/df-dir-picker's build_cache() (deleted with ticket 19). The
// cache path and format are inherited unchanged, so an existing
// ~/.cache/df-dir-picker/folders.list still reads.
//
// A root that does not exist is left to `find` itself to fail quietly on
// (the trailing `2>/dev/null`) rather than checked for first, which is the one
// place this diverges from both -- neither pure JavaScript nor this Provider
// has a synchronous way to ask, and a missing root contributing nothing is the
// same outcome either way.
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

// Guarded so refresh() can be called on every Launcher open for free: skipped
// outright while a build is already running (the tmp file is its own lock,
// the same guard menus/dotfiles_dirs.lua uses) or while the cache is younger
// than STALE_SECONDS. Missing entirely counts as stale, which is what gets a
// cache built at all on a machine that has never opened this Launcher.
function refreshScript(home) {
    var cache = cachePath(home);
    var tmp = cache + ".tmp";

    return "[ -e " + shellEscape(tmp) + " ] && exit 0; "
        + "age=$(( $(date +%s) - $(stat -c %Y " + shellEscape(cache) + " 2>/dev/null || echo 0) )); "
        + "if [ ! -s " + shellEscape(cache) + " ] || [ \"$age\" -gt " + STALE_SECONDS + " ]; then "
        + buildCacheScript(home) + "; fi";
}

// The argv refresh() hands to Quickshell.execDetached.
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
