// The files Provider's pure half: a folder-scoped file listing -- type a
// folder name and get the folders matching it, each followed by its immediate
// contents -- plus the commands a file can be opened with.
//
// Ported from menus/dotfiles_files.lua and menus/dotfiles_file_opener.lua --
// elephant's own files Provider (deleted with ticket 19) -- the same way
// lib/directories.js ported dotfiles_dirs.lua. The shape exists for the reason
// the lua's own design note gives: an earlier design cached every file under
// the dev roots and measured
// 1.2s per keystroke at 340k files. Nothing is listed until a folder name is
// typed, and then only one directory level of each matching folder is read, so
// cost no longer scales with how many files exist.
//
// **Shares the directories Provider's cache rather than building a second
// index.** The cache file this reads is directories.js's own
// (~/.cache/df-dir-picker/folders.list); Files.qml takes cachePath/parseCache
// from Dirs, and the background scan that keeps it fresh is Directories.qml's
// refresh(). dotfiles_files.lua shared the file the same way.
//
// The duplication that sharing entails -- relOf, isMirrored and the rest
// appear again here rather than being imported -- is forced, not preferred: a
// JavaScript file imports a sibling with `.import`, which like `.pragma
// library` is a syntax error under node (see the note at the top of
// lib/matching.js), and every file in this lib/ has to load under both QML and
// node for its tests to run. The sync chain is anchored here; the note on
// SSH_HOST below names directories.js and both lua files.
//
// **The listing is deliberately not scored by lib/matching.js.** Every other
// ranked Provider prepares a corpus and lets rank() order its Entries; this
// one's listing orders itself. The order is structural -- each folder's
// children must sit directly beneath it -- and score() ranks every Entry
// independently, so a child that happens to match the Query well would be
// pulled out from under its parent. So the folder selection and the four ranks
// below are dotfiles_files.lua's own, and Files.qml's listing catalog carries
// `ordered: true`, which tells Launcher.qml to skip rank() for it. The chooser
// is an ordinary scored corpus; only the listing is ordered.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/files.test.js) -- the same arrangement as directories.js.

// How many matched folders are listed at most, and how many of those get
// their contents expanded. Expanding costs one directory read each -- the
// only real knob in this design, ported from dotfiles_files.lua's own
// MAX_DIRS and MAX_EXPAND.
var MAX_DIRS = 40;
var MAX_EXPAND = 10;

// How many children one expanded folder contributes. No equivalent in the lua,
// which needed none: elephant re-ranks what GetEntries returns, so a folder row
// could never be pushed off the list by another folder's contents. Here the
// listing *is* the order, and Launcher.qml's merge() keeps only its first
// DEFAULT_LIMIT (200) Entries -- so without a cap one folder holding 200 files
// would take the whole budget and hide every folder matched after it. At 16 the
// worst case is exactly the budget: MAX_DIRS + MAX_EXPAND * MAX_CHILDREN
// = 40 + 160 = 200, so every matched folder always survives.
var MAX_CHILDREN = 16;

// The devpod devcontainer bind-mounts these at the same absolute path (see
// setup/devcontainer/.devcontainer/devcontainer.json), so a remote location is
// just the scheme + host + the local path. Kept in sync with directories.js
// and the two lua files; directories.js and the luas bind themselves the same
// way, pair-wise.
var SSH_HOST = "devcontainer.devpod";
var MIRRORED = ["/dev", "/dotfiles", "/.agents"];

// Kept in sync with directories.js -- see the header.
function shellEscape(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// The fuzzy-matched text: "~" for $HOME itself, the path relative to it
// otherwise. Same contract as directories.js's own relOf, and duplicated for
// the reason the header names.
function relOf(path, home) {
    if (path === home)
        return "~";
    if (home && path.indexOf(home + "/") === 0)
        return path.slice(home.length + 1);
    return path;
}

// The leaf of a relative path -- "backend" from "dev/monorepo/backend", the
// whole thing when there is no "/" to split on ("~", or a top-level
// directory). Same as directories.js's own leafOf, duplicated for the same
// reason relOf is.
function leafOf(rel) {
    var at = rel.lastIndexOf("/");
    return at < 0 ? rel : rel.slice(at + 1);
}

// Whether a path is one the devcontainer also has, at the same absolute path
// -- the condition that makes an ssh:// URL meaningful for it. Same as
// directories.js's own isMirrored, duplicated for the same reason relOf is.
function isMirrored(path, home) {
    for (var i = 0; i < MIRRORED.length; i++) {
        var root = home + MIRRORED[i];
        if (path === root || path.indexOf(root + "/") === 0)
            return true;
    }
    return false;
}

// The parent directory of a path -- "/home/jehad/dev/backend" gives
// "/home/jehad/dev", and "." for a path with no "/" at all. This is the
// opener menu's %DIR%: the file openers assume their argument is a file, so
// nvim needs the directory to cd into and nautilus needs the directory to
// reveal the file in, and both would misbehave if handed the file itself.
function parentOf(path) {
    var at = String(path).lastIndexOf("/");
    return at < 0 ? "." : path.slice(0, at);
}

// The matched folders for a Query, best first -- the whole of the lua's
// selection and ranking, ported from dotfiles_files.lua's GetEntries.
//
// Membership is a plain substring test, deliberately not lib/matching.js's
// fuzzy subsequence: the lua's is a plain find too, and the point of this
// port is that the lua's *selection* survives -- the fuzzy scorer is skipped
// because it could not preserve the folder-then-contents order anyway (see
// the header). Matched on the folder NAME, not the whole path: a Query of
// "backend" must not also select dev/api/backend/src just because an ancestor
// matched -- those are already listed as that folder's contents, and matching
// them here would produce the same directory twice. A Query containing "/" is
// by definition about the path, so it falls back to matching the whole
// relative path instead -- the lua's `spanning` rule.
//
// Order is the lua's own four ranks: exact leaf name first, then leaf
// prefix, then leaf substring, then a match somewhere further up the path
// (only reachable by a spanning Query). Shallower wins ties -- the lua's
// "#a.rel ~= #b.rel" -- then lexicographic.
//
// Returns [] for an empty Query, which is checkbox 2's whole rule: an empty
// Query lists nothing, deliberately -- see Files.qml.
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

        // Cheap plain find over the whole path first: if q is absent from the
        // whole path it cannot be in the leaf either, so the leaf test --
        // which would otherwise run over every path -- only runs on
        // candidates. The lua's own two-step, ported as two steps.
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

// The absolute paths of the top MAX_EXPAND matched folders -- the ones whose
// contents get read for the current Query. What Files.qml hands its finder
// Process; the read itself is one `find` over all of them, so listing ten
// folders costs one fork no matter how many matched. Mirrors the lua's
// `expand = math.min(#matches, MAX_EXPAND)`.
function expandPaths(paths, home, query) {
    var matched = matchFolders(paths, home, query);
    var expand = Math.min(matched.length, MAX_EXPAND);
    var out = [];
    for (var i = 0; i < expand; i++)
        out.push(matched[i].path);
    return out;
}

// The argv for reading one level of several folders at once. `-printf '%y %p
// \n'` prefixes each path with its type (d/f/l), which is how a child is
// known to be a folder without a second stat -- the lua's own single find,
// ported from a shell command line into argv. Passing the folders as
// individual arguments rather than escaping them into a shell string is what
// makes a path containing a space safe here, where the lua had to ShellEscape
// the same arguments by hand.
function childrenCommand(paths) {
    return ["find"].concat(paths, ["-mindepth", "1", "-maxdepth", "1", "-printf", "%y %p\n"]);
}

// "%y %p\n" output into a map of absolute parent path -> children, each
// child { kind, path }. One line per child; a blank or malformed line is
// dropped. `kind` is find's %y -- "d" for a directory, "f" for a file, "l"
// for a symlink -- and it is what entriesFor uses to decide the icon and the
// trailing "/", the same as the lua's own `c.kind == "d"`.
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

// The ssh:// URL a mirrored path is reachable at from the devcontainer.
function sshUrlFor(path) {
    return "ssh://" + SSH_HOST + path;
}

// The primary Action's command: zed, over ssh for a path the devcontainer
// mirrors, local otherwise -- dotfiles_files.lua's own default action
// (the menu-level ssh default, overridden per entry for a host-only path).
// Same shape as directories.js's own defaultOpenArgv, duplicated for the
// reason the header names.
function defaultOpenArgv(path, mirrored, launchPrefix) {
    var target = mirrored ? sshUrlFor(path) : path;
    return (launchPrefix || []).concat(["zeditor", target]);
}

// The secondary Action's chooser -- ported from dotfiles_file_opener.lua's
// APPS table. The same five-command shape as the directories chooser, with
// the two differences that table itself carries:
//
// - **%DIR% is the file's parent, not the file itself.** The dirs-menu forms
//   of these commands assume their argument is a directory; a file would have
//   nvim trying to cd into it and nautilus handing it to the default handler
//   -- exactly the xdg-open behaviour this menu exists to avoid.
// - **The last entry is "Reveal in Files", not "Files".** `nautilus --select`
//   reveals the file in its folder instead of opening it, and it is the one
//   entry with no remote command at all -- dotfiles_file_opener.lua leaves
//   its `remote` field out, so a mirrored path still reveals locally.
//
// `mirrored` is taken rather than recomputed from `path`: entriesFor already
// paid for isMirrored() once and carries it on `entry.target` for this call.
function chooserApps(path, mirrored) {
    var target = mirrored ? sshUrlFor(path) : path;
    var dir = parentOf(path);

    function pick(local, remote) {
        return mirrored && remote ? remote : local;
    }

    return [
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
                ["ghostty", "--working-directory=" + dir, "-e", "nvim", path],
                // Escaped, unlike the other four: this argument is not run
                // locally -- it is handed whole to `ssh`, which forwards it to
                // be parsed by a shell on the *other* end. Every other command
                // here passes its paths as their own argv elements, safe from
                // a local shell that never sees them; this one builds a shell
                // command line as a string, so it is the one place a path
                // with a space in it would otherwise break silently. Both the
                // directory to cd into and the file to open are escaped, the
                // same way dotfiles_file_opener.lua escapes %DIR% and %PATH%
                // before substituting them into the same string.
                ["ghostty", "-e", "ssh", "-t", SSH_HOST,
                    "cd " + shellEscape(dir) + " && exec nvim " + shellEscape(path)]
            )
        },
        {
            // No remote command at all -- revealing is always local, even for
            // a mirrored path. See the header on this function.
            name: "Reveal in Files", icon: "folder",
            target: path,
            argv: ["nautilus", "--select", path]
        }
    ];
}

// The chooser's Entries, in the shape Files.qml's catalog wants when a
// sub-menu is open. No `key`: these do not recur the way a path does, so
// there is nothing for Frecency to accumulate against -- the path itself
// already recorded a choice on the secondary Action that opened this.
function chooserEntriesFor(path, mirrored, launchPrefix, provider) {
    var prefix = launchPrefix || [];
    return chooserApps(path, mirrored).map(function (app) {
        return {
            name: app.name,
            subtext: app.target,
            icon: app.icon,
            provider: provider,
            target: { argv: prefix.concat(app.argv) }
        };
    });
}

// The Entries for one Query, in display order -- the lua's GetEntries output,
// in the shape Files.qml's catalog wants.
//
// Folders best first, each immediately followed by its own children sorted by
// path. Children come from `childrenMap`, the parseChildren of whatever the
// finder Process has read; a folder whose contents have not been read yet
// contributes none, which is how folders render instantly and their contents a
// moment later. The map is keyed by absolute parent path and only parents in
// the current match set are consulted, which is what makes a *stale* listing
// harmless -- see the note on `childrenText` in Files.qml.
//
// Deduplicated on absolute path, first occurrence wins -- the lua's own `seen`
// table. A nested folder can be both a match and a parent's child (searching
// "backend" with dev/backend-utils containing dev/backend-utils/backend), and
// whichever copy sorts higher in the match set keeps the listing.
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
            // A folder's own Entry carries a trailing "/" so a directory and
            // a file of the same name read differently at a glance -- the
            // lua's `Text = isdir and (rel .. "/") or rel`.
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
