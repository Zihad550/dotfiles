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

// The devpod devcontainer bind-mounts these at the same absolute path, so a
// remote location is just the scheme, host, and same local path.
var SSH_HOST = "devcontainer.devpod";
var MIRRORED = ["/dev", "/dotfiles", "/.agents"];

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
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

// The herdr session name a directory's Entry runs its session under: the
// relative path slugged ("/" -> "-", "." and ":" -> "_" -- tmux's old target
// grammar tripped on both, kept as a safe default here too -- "home" for
// $HOME itself). Not injective -- accepted, not defended against.
function sessionNameOf(path, home) {
    var rel = relOf(path, home);
    if (rel === "~")
        return "home";
    return rel.split("/").join("-").split(".").join("_").split(":").join("_");
}

// `host` is the resolved custom host, or falsy to mean "use the default" --
// the fallback the devcontainer-host state file's contract promises (blank
// or missing = default). SSH_HOST is that shared default; bin/df-herdr-session
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

// A ghostty window on the session script (bin/df-herdr-session), with the
// directory's session name and its path as separate arguments.
//
// `--title` is the session name -- required so this window's title never
// collides with SUPER+U's bare "herdr" one. See hypr/.../bindings/apps.lua
// and docs/adr/0003-tmux-to-herdr.md.
//
// The path is passed raw, not through shellEscape: ghostty 1.2+ execs its
// `-e` arguments verbatim (no shell round-trip), so single-quote doubling
// would reach the session script as literal text. Escaping only matters
// where a shell re-parses the argument, which is inside the session script
// itself -- it owns that escape.
function herdrLaunchArgv(path, home) {
    var sessionName = sessionNameOf(path, home);
    return [
        "ghostty", "--title=" + sessionName, "-e",
        home + "/dotfiles/bin/df-herdr-session",
        sessionName,
        path
    ];
}

// The secondary Action's chooser. Files carries no remote command at all, so
// a mirrored directory still opens it locally.
//
// Herdr's argv is the same regardless of `routed`/`host` -- the script
// re-resolves routing itself and opens a separate remote session instead of
// a local one when it applies (ticket 02, docs/adr/0003-tmux-to-herdr.md).
//
// Herdr is `scoped: false`, unlike Files: the ghostty window is only a
// client, so it can die with the launcher without taking the (server-side,
// persistent) session down with it -- not true for an editor, which is why
// Files keeps the launch prefix instead.
function chooserApps(path, routed, home, host) {
    var target = routed ? sshUrlFor(path, host) : path;
    var sshHost = host || SSH_HOST;

    function pick(local, remote) {
        return routed && remote ? remote : local;
    }

    return [
        {
            // `target` is the session name, not the path the other rows show
            // -- it's what the row attaches you to and what appears in
            // `herdr session list`.
            name: "Herdr", icon: "utilities-terminal",
            target: sessionNameOf(path, home),
            scoped: false,
            argv: herdrLaunchArgv(path, home)
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

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        SSH_HOST: SSH_HOST,
        MIRRORED: MIRRORED,
        relOf: relOf,
        isMirrored: isMirrored,
        entryFor: entryFor,
        leafOf: leafOf,
        textsFor: textsFor,
        sessionNameOf: sessionNameOf,
        sshUrlFor: sshUrlFor,
        defaultOpenArgv: defaultOpenArgv,
        herdrLaunchArgv: herdrLaunchArgv,
        chooserApps: chooserApps,
        chooserEntriesFor: chooserEntriesFor
    };
}
