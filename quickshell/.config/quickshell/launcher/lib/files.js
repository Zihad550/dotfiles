// The files Provider's pure half: a folder-scoped file listing -- type a
// folder name and get the folders matching it, each followed by its
// immediate contents -- plus the commands a file can be opened with.
//
// Nothing is listed until a folder name is typed, and then only one
// directory level of each matching folder is read, so cost doesn't scale
// with how many files exist (an earlier design that cached every file under
// the dev roots measured 1.2s per keystroke at 340k files).
//
// Shares the directories Provider's cache rather than building a second
// index (~/.cache/df-dir-picker/folders.list, kept fresh by
// Directories.qml's refresh()). The duplication that sharing entails (relOf,
// isMirrored etc. appear again here rather than being imported) is forced:
// a JS file importing a sibling is a syntax error under node, and every file
// here has to load under both QML and node for its tests to run.
//
// The listing is deliberately not scored by lib/matching.js: the order is
// structural (each folder's children must sit directly beneath it), and
// score() ranks every Entry independently, which would pull a well-matching
// child out from under its parent. So the folder selection and ranking below
// are self-contained, and Files.qml's listing catalog carries `ordered:
// true`, telling Launcher.qml to skip rank() for it. The chooser is an
// ordinary scored corpus; only the listing is ordered.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/files.test.js).

// How many matched folders are listed at most, and how many of those get
// their contents expanded (each expansion costs one directory read).
var MAX_DIRS = 40;
var MAX_EXPAND = 10;

// How many children one expanded folder contributes. Needed because the
// listing *is* the display order and Launcher.qml's merge() keeps only its
// first 200 Entries -- without a cap, one folder holding 200 files would
// take the whole budget and hide every folder matched after it. At 16 the
// worst case exactly fits the budget: MAX_DIRS + MAX_EXPAND * MAX_CHILDREN
// = 40 + 160 = 200, so every matched folder always survives.
var MAX_CHILDREN = 16;

// The devpod devcontainer bind-mounts these at the same absolute path, so a
// remote location is just the scheme + host + local path. Kept in sync with directories.js.
var SSH_HOST = "devcontainer.devpod";
var MIRRORED = ["/dev", "/dotfiles", "/.agents"];

function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// "~" for $HOME itself, path relative to it otherwise. Same contract as
// directories.js's own relOf -- duplicated, see the header.
function relOf(path, home) {
    if (path === home)
        return "~";
    if (home && path.indexOf(home + "/") === 0)
        return path.slice(home.length + 1);
    return path;
}

function leafOf(rel) {
    var at = rel.lastIndexOf("/");
    return at < 0 ? rel : rel.slice(at + 1);
}

function isMirrored(path, home) {
    for (var i = 0; i < MIRRORED.length; i++) {
        var root = home + MIRRORED[i];
        if (path === root || path.indexOf(root + "/") === 0)
            return true;
    }
    return false;
}

// The parent directory of a path, "." for a path with no "/" at all. File
// openers assume their argument is a directory (nvim needs it to cd into,
// nautilus to reveal the file in), and both would misbehave handed the file itself.
function parentOf(path) {
    var at = String(path).lastIndexOf("/");
    return at < 0 ? "." : path.slice(0, at);
}

// The matched folders for a Query, best first.
//
// Plain substring test, not lib/matching.js's fuzzy subsequence -- the fuzzy
// scorer can't preserve the folder-then-contents order anyway (see the
// header). Matched on the folder NAME, not the whole path: a Query of
// "backend" mustn't also select dev/api/backend/src just because an
// ancestor matched (that's already listed as that folder's contents). A
// Query containing "/" falls back to matching the whole relative path instead.
//
// Order: exact leaf name, then leaf prefix, then leaf substring, then a
// match further up the path (only reachable by a "/"-spanning Query).
// Shallower wins ties, then lexicographic.
//
// Returns [] for an empty Query, deliberately -- an empty Query lists nothing.
function matchFolders(paths, home, query) {
    if (typeof query !== "string" || query === "")
        return [];

    var q = query.toLowerCase();
    var spanning = q.indexOf("/") !== -1;
    var out = [];

    for (var i = 0; i < paths.length; i++) {
        var path = paths[i];
        if (path === "")
            continue;

        var rel = relOf(path, home);
        var lrel = rel.toLowerCase();

        // Cheap plain find over the whole path first: if q is absent there
        // it can't be in the leaf either, so the leaf test only runs on
        // candidates rather than every path.
        if (lrel.indexOf(q) === -1)
            continue;

        var leaf = leafOf(lrel);
        if (!spanning && leaf.indexOf(q) === -1)
            continue;

        var rank;
        if (leaf === q)
            rank = 0;
        else if (leaf.indexOf(q) === 0)
            rank = 1;
        else if (leaf.indexOf(q) !== -1)
            rank = 2;
        else
            rank = 3;

        out.push({ path: path, rel: rel, rank: rank });
    }

    out.sort(function (a, b) {
        if (a.rank !== b.rank)
            return a.rank - b.rank;
        if (a.rel.length !== b.rel.length)
            return a.rel.length - b.rel.length;
        return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
    });

    return out;
}

// The absolute paths of the top MAX_EXPAND matched folders -- the read
// itself is one `find` over all of them, so listing ten folders costs one
// fork no matter how many matched.
function expandPaths(paths, home, query) {
    var matched = matchFolders(paths, home, query);
    var expand = Math.min(matched.length, MAX_EXPAND);
    var out = [];
    for (var i = 0; i < expand; i++)
        out.push(matched[i].path);
    return out;
}

// One level of several folders at once. `-printf '%y %p\n'` prefixes each
// path with its type (d/f/l), so a child is known to be a folder without a
// second stat. Folders passed as individual argv elements, not escaped into
// a shell string, so a path containing a space is safe.
function childrenCommand(paths) {
    return ["find"].concat(paths, ["-mindepth", "1", "-maxdepth", "1", "-printf", "%y %p\n"]);
}

// "%y %p\n" output into a map of absolute parent path -> children, each
// child { kind, path }. `kind` is find's %y ("d"/"f"/"l"), used to decide
// icon and trailing "/".
function parseChildren(text) {
    var out = {};
    if (typeof text !== "string")
        return out;

    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var found = /^([a-zA-Z]) (.*)$/.exec(lines[i]);
        if (!found)
            continue;

        var parent = parentOf(found[2]);
        if (parent === "." || parent === "")
            continue;

        var kids = out[parent];
        if (!kids) {
            kids = [];
            out[parent] = kids;
        }
        kids.push({ kind: found[1], path: found[2] });
    }

    return out;
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

// The secondary Action's chooser. Two differences from the directories
// chooser:
// - %DIR% is the file's parent, not the file itself -- these commands
//   assume a directory argument; a file would have nvim trying to cd into
//   it and nautilus falling back to the default handler (the xdg-open
//   behaviour this menu exists to avoid).
// - The last entry is "Reveal in Files": `nautilus --select` reveals the
//   file in its folder rather than opening it, and has no remote command at
//   all, so a mirrored path still reveals locally.
function chooserApps(path, routed, host) {
    var target = routed ? sshUrlFor(path, host) : path;
    var dir = parentOf(path);
    var sshHost = host || SSH_HOST;

    function pick(local, remote) {
        return routed && remote ? remote : local;
    }

    return [
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
                ["ghostty", "--working-directory=" + dir, "-e", "nvim", path],
                // Escaped, unlike the other four: this argument isn't run
                // locally -- it's handed whole to `ssh`, parsed by a shell on
                // the *other* end, so a path with a space would otherwise
                // break silently. Both the cd directory and the file are escaped.
                ["ghostty", "-e", "ssh", "-t", sshHost,
                    "cd " + shellEscape(dir) + " && exec nvim " + shellEscape(path)]
            )
        },
        {
            // No remote command at all -- revealing is always local.
            name: "Reveal in Files", icon: "folder",
            target: path,
            argv: ["nautilus", "--select", path]
        }
    ];
}

// No `key`: these don't recur the way a path does -- the path itself already
// recorded a choice on the secondary Action that opened this.
function chooserEntriesFor(path, routed, launchPrefix, provider, host) {
    var prefix = launchPrefix || [];
    return chooserApps(path, routed, host).map(function (app) {
        return {
            name: app.name,
            subtext: app.target,
            icon: app.icon,
            provider: provider,
            target: { argv: prefix.concat(app.argv) }
        };
    });
}

// The Entries for one Query, in display order: folders best first, each
// immediately followed by its own children sorted by path.
//
// Children come from `childrenMap` (parseChildren of whatever the finder
// Process has read so far); a folder whose contents haven't been read yet
// contributes none, which is how folders render instantly and their
// contents a moment later. Only parents in the current match set are
// consulted, which is what makes a *stale* listing harmless -- see the note
// on `childrenText` in Files.qml.
//
// Deduplicated on absolute path, first occurrence wins: a nested folder can
// be both a match and a parent's child, and whichever copy sorts higher in
// the match set keeps the listing.
function entriesFor(paths, home, query, childrenMap, provider) {
    var matches = matchFolders(paths, home, query);
    var listed = Math.min(matches.length, MAX_DIRS);
    var expand = Math.min(matches.length, MAX_EXPAND);
    var entries = [];
    var seen = {};

    function add(path, isdir) {
        if (seen[path])
            return;
        seen[path] = true;

        var rel = relOf(path, home);
        entries.push({
            // Trailing "/" on a folder's own Entry so a directory and a file
            // of the same name read differently at a glance.
            name: isdir ? rel + "/" : rel,
            subtext: path,
            icon: isdir ? "folder" : "text-x-generic",
            provider: provider,
            target: {
                path: path,
                mirrored: isMirrored(path, home)
            }
        });
    }

    for (var i = 0; i < listed; i++) {
        var match = matches[i];
        add(match.path, true);

        if (i >= expand)
            continue;

        var kids = childrenMap[match.path];
        if (!kids)
            continue;

        var sorted = kids.slice().sort(function (a, b) {
            return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
        });
        var shown = Math.min(sorted.length, MAX_CHILDREN);
        for (var k = 0; k < shown; k++)
            add(sorted[k].path, sorted[k].kind === "d");
    }

    return entries;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        MAX_DIRS: MAX_DIRS,
        MAX_EXPAND: MAX_EXPAND,
        MAX_CHILDREN: MAX_CHILDREN,
        SSH_HOST: SSH_HOST,
        matchFolders: matchFolders,
        expandPaths: expandPaths,
        childrenCommand: childrenCommand,
        parseChildren: parseChildren,
        defaultOpenArgv: defaultOpenArgv,
        chooserApps: chooserApps,
        chooserEntriesFor: chooserEntriesFor,
        entriesFor: entriesFor
    };
}
