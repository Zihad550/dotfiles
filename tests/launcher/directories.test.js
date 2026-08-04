// Tests for the directories Provider's pure half: parsing the cache, the
// Entry shape, which command opens a directory and which apps the chooser
// offers, and the guard around the background refresh script.
//
//     node --test "tests/launcher/*.test.js"
//
// The refresh script itself runs `find` and `stat`, which nothing here can
// exercise -- these tests check its *shape*, the same limit windows.test.js
// has for anything naming a Hyprland type. Whether it actually populates the
// cache on the real corpus is a host claim, in the ticket's own Manual
// verification.

const test = require("node:test");
const assert = require("node:assert");

const D = require("../../quickshell/.config/quickshell/launcher/lib/directories.js");
const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const CatalogCheck = require("./catalog-check.js");

const HOME = "/home/jehad";

// The catalog build lives in lib/catalog.js, wired to this Provider's own
// entryFor/textsFor by Directories.qml -- see the same note in themes.test.js.
const catalogOf = (paths, home, provider) => C.ownedCatalog(paths,
    path => D.entryFor(path, home, provider),
    (path, entry) => D.textsFor(entry.name));

test("parseCache splits on newlines and drops blank lines", () => {
    assert.deepStrictEqual(D.parseCache(`${HOME}\n${HOME}/dev\n\n${HOME}/dotfiles\n`), [
        HOME, `${HOME}/dev`, `${HOME}/dotfiles`
    ]);
    assert.deepStrictEqual(D.parseCache(""), [], "an empty cache is no directories, not a fault");
    assert.deepStrictEqual(D.parseCache(undefined), [], "a cache that has not loaded yet is the same as an empty one");
});

test("relOf names $HOME itself \"~\" and everything else relative to it", () => {
    assert.strictEqual(D.relOf(HOME, HOME), "~");
    assert.strictEqual(D.relOf(`${HOME}/dev/project`, HOME), "dev/project");
    assert.strictEqual(D.relOf("/mnt/data", HOME), "/mnt/data", "a path outside $HOME is left whole rather than mangled");
});

test("isMirrored matches the devcontainer's own bind-mounted roots", () => {
    assert.ok(D.isMirrored(`${HOME}/dotfiles`, HOME));
    assert.ok(D.isMirrored(`${HOME}/dotfiles/quickshell`, HOME), "a descendant of a mirrored root is mirrored too");
    assert.ok(D.isMirrored(`${HOME}/dev/some-project`, HOME));
    assert.ok(D.isMirrored(`${HOME}/.agents/notes`, HOME));
    assert.ok(!D.isMirrored(`${HOME}/Downloads`, HOME));
    assert.ok(!D.isMirrored(`${HOME}/dotfiles-backup`, HOME), "a name merely prefixed by a mirrored root's is not a descendant of it");
});

test("entryFor carries the absolute path as both the Entry Key and the subtext", () => {
    const provider = {};
    const entry = D.entryFor(`${HOME}/dev/backend`, HOME, provider);
    assert.strictEqual(entry.name, "dev/backend");
    assert.strictEqual(entry.subtext, `${HOME}/dev/backend`);
    assert.strictEqual(entry.key, `${HOME}/dev/backend`);
    assert.strictEqual(entry.icon, "folder");
    assert.strictEqual(entry.provider, provider);
    assert.strictEqual(entry.target.path, `${HOME}/dev/backend`);
    assert.strictEqual(entry.target.mirrored, true);
});

test("an Entry's own target.mirrored is what the primary and secondary Actions read, not a second isMirrored call", () => {
    const entry = D.entryFor(`${HOME}/dotfiles`, HOME, null);
    assert.deepStrictEqual(
        D.defaultOpenArgv(entry.target.path, entry.target.mirrored, []),
        ["zeditor", `ssh://${D.SSH_HOST}${HOME}/dotfiles`]
    );
});

test("leafOf takes the last path segment, and the whole string when there is only one", () => {
    assert.strictEqual(D.leafOf("dev/monorepo/backend"), "backend");
    assert.strictEqual(D.leafOf("dotfiles"), "dotfiles");
    assert.strictEqual(D.leafOf("~"), "~");
});

test("textsFor scores the leaf and the full path separately, deduplicated for a top-level directory", () => {
    assert.deepStrictEqual(D.textsFor("dev/monorepo/backend"), ["backend", "dev/monorepo/backend"]);
    assert.deepStrictEqual(D.textsFor("dotfiles"), ["dotfiles"], "a top-level directory's leaf is its whole relative path");
    assert.deepStrictEqual(D.textsFor("~"), ["~"]);
});

test("sessionNameOf slugs the relative path into a session name, with \"~\" as \"home\"", () => {
    assert.strictEqual(D.sessionNameOf(`${HOME}/dev/monorepo/backend`, HOME), "dev-monorepo-backend");
    assert.strictEqual(D.sessionNameOf(`${HOME}/dev`, HOME), "dev", "a top-level directory has no separator to replace");
    assert.strictEqual(D.sessionNameOf(`${HOME}/dev/back-ends`, HOME), "dev-back-ends", "a hyphen the path already contains survives the slug");
    assert.strictEqual(D.sessionNameOf(HOME, HOME), "home");
});

test("catalogOf builds one Entry per path, in order, with the texts/keys/owners prepare() and collapse() want", () => {
    const paths = [HOME, `${HOME}/dev/a`, `${HOME}/dev/b`];
    const built = catalogOf(paths, HOME, null);

    // The corpus-order guard of ticket 23. This Provider is the one
    // deliberate exception: its Entries are *called* by their leaf -- "a"
    // from "dev/a" -- while the row displays the whole relative path, so the
    // name the corpus must lead with is the leaf. Argued in lib/directories.js.
    CatalogCheck.nameFirst(built, entry => D.leafOf(entry.name));

    assert.deepStrictEqual(built.entries.map(e => e.name), ["~", "dev/a", "dev/b"]);

    // "~" has one text; "dev/a" and "dev/b" have two each (leaf + full path).
    assert.strictEqual(built.texts.length, 5);
    assert.strictEqual(built.keys.length, 5);
    assert.strictEqual(built.owners.length, 5);
    assert.deepStrictEqual(built.owners, [0, 1, 1, 2, 2]);
    assert.deepStrictEqual(built.keys, built.owners.map(i => built.entries[i].key));
});

test("a directory is matchable by its full relative path, not only by its leaf", () => {
    const paths = [`${HOME}/dev/monorepo/backend`, `${HOME}/dev/monorepo/frontend`, `${HOME}/dotfiles`];
    const built = catalogOf(paths, HOME, null);
    const corpus = M.prepare(built.texts, built.keys, built.owners);

    // "monorepo" is in neither leaf ("backend", "frontend") -- only the full
    // relative path text carries it, which is what checkbox 1's "across the
    // whole cache" is actually asking for.
    const ranked = M.collapse(corpus, M.rank(corpus, "monorepo"));
    assert.strictEqual(ranked.indices.length, 2, "both directories under monorepo match; dotfiles does not");
    const names = ranked.indices.map(i => built.entries[i].name).sort();
    assert.deepStrictEqual(names, ["dev/monorepo/backend", "dev/monorepo/frontend"]);
});

test("an exact leaf match outranks a directory that merely contains the same letters -- the regression this ticket exists to close", () => {
    // Found in code review: scoring one text per directory (the full relative
    // path alone) ranked "dev/backend.old" above the directory actually named
    // "backend", because both match "backend" as one contiguous run right
    // after a "/" and score() then ties on quality and decides by length --
    // shorter wins, and "dev/backend.old" is shorter. This is exactly the
    // misranking dotfiles_dirs.lua's own comment names as the reason it scores
    // the leaf separately.
    const paths = [
        `${HOME}/dev/backend.old`,
        `${HOME}/dev/monorepo/services/api/backend`
    ];
    const built = catalogOf(paths, HOME, null);
    const corpus = M.prepare(built.texts, built.keys, built.owners);

    const ranked = M.collapse(corpus, M.rank(corpus, "backend"));
    const first = built.entries[ranked.indices[0]];
    assert.strictEqual(first.name, "dev/monorepo/services/api/backend",
        "the directory actually named \"backend\" should win, not the one merely containing the word");
});

test("sessionNameOf neutralizes dot and colon, tmux's target separators", () => {
    // tmux's -t target grammar splits on "." and ":" -- a session name
    // containing either parses as window.pane, so `new-window -t` dies with
    // "can't specify pane here". Found by the host verification: ~/.agents,
    // a mirrored root, names its session `.agents`, and that first char trips
    // it. The slug neutralizes both the way it does "/".
    assert.strictEqual(D.sessionNameOf(`${HOME}/.agents/notes`, HOME), "_agents-notes", "a leading dot, as every path under ~/.agents has");
    assert.strictEqual(D.sessionNameOf(`${HOME}/.agents`, HOME), "_agents", "the root itself");
    assert.strictEqual(D.sessionNameOf(`${HOME}/dev/foo.bar`, HOME), "dev-foo_bar", "a dot inside a directory name");
    assert.strictEqual(D.sessionNameOf(`${HOME}/dev/a:b`, HOME), "dev-a_b", "a colon, tmux's other target separator");
});

test("tmuxLaunchArgv runs the session script in ghostty, with the session name and path as separate arguments", () => {
    const argv = D.tmuxLaunchArgv(`${HOME}/dev/monorepo/backend`, HOME);
    assert.deepStrictEqual(argv, [
        "ghostty", "-e",
        `${HOME}/dotfiles/bin/df-tmux-session`,
        "dev-monorepo-backend",
        `${HOME}/dev/monorepo/backend`
    ]);
    assert.strictEqual(D.tmuxLaunchArgv(HOME, HOME)[3], "home", "the ~ entry's session is named home");
});

test("tmuxLaunchArgv passes a hostile path through as one argument, unescaped", () => {
    const path = `${HOME}/dev/it's "fine"`;
    const argv = D.tmuxLaunchArgv(path, HOME);
    assert.strictEqual(argv.length, 5);
    assert.strictEqual(argv[4], path,
        "the path is one argv element -- ghostty 1.2+ execs its -e arguments verbatim, so single-quote doubling would arrive at the script as literal text");
    assert.strictEqual(argv[3], `dev-it's "fine"`);
});

test("defaultOpenArgv opens a mirrored directory over ssh and everything else locally", () => {
    const prefix = ["uwsm-app", "--"];
    assert.deepStrictEqual(
        D.defaultOpenArgv(`${HOME}/dotfiles`, true, prefix),
        ["uwsm-app", "--", "zeditor", `ssh://${D.SSH_HOST}${HOME}/dotfiles`]
    );
    assert.deepStrictEqual(
        D.defaultOpenArgv(`${HOME}/Downloads`, false, prefix),
        ["uwsm-app", "--", "zeditor", `${HOME}/Downloads`]
    );
});

test("chooserApps offers Tmux alongside the same five apps, mirrored or not", () => {
    const local = D.chooserApps(`${HOME}/Downloads`, false, HOME).map(a => a.name);
    const mirrored = D.chooserApps(`${HOME}/dotfiles`, true, HOME).map(a => a.name);
    assert.deepStrictEqual(local, ["Zed", "VSCode", "Cursor", "Neovim", "Tmux", "Files"]);
    assert.deepStrictEqual(mirrored, ["Zed", "VSCode", "Cursor", "Neovim", "Tmux", "Files"],
        "Tmux is offered for every directory, with no mirror condition");
});

test("chooserApps sends every app but Files and Tmux over ssh for a mirrored directory", () => {
    const apps = D.chooserApps(`${HOME}/dotfiles`, true, HOME);
    const byName = Object.fromEntries(apps.map(a => [a.name, a]));

    assert.ok(byName.Zed.argv.join(" ").includes("ssh://"));
    assert.ok(byName.VSCode.argv.includes("--remote"));
    assert.ok(byName.Cursor.argv.includes("--remote"));
    assert.ok(byName.Neovim.argv.includes("ssh"));

    // Files has no remote command at all -- ported from
    // dotfiles_dir_opener.lua's APPS table, where it is the one entry with no
    // `remote` field.
    assert.deepStrictEqual(byName.Files.argv, ["nautilus", `${HOME}/dotfiles`]);
    assert.strictEqual(byName.Files.target, `${HOME}/dotfiles`);

    // Tmux runs the session script locally even for a mirrored directory --
    // the script does the remote work itself, this launcher just opens the
    // window on it.
    assert.strictEqual(byName.Tmux.argv[0], "ghostty");
    assert.ok(!byName.Tmux.argv.join(" ").includes("ssh"));
});

test("chooserApps stays local for every app when the directory is not mirrored", () => {
    const apps = D.chooserApps(`${HOME}/Downloads`, false, HOME);
    for (const app of apps) {
        assert.ok(!app.argv.join(" ").includes("ssh"), `${app.name} should not go over ssh for a host-only directory`);
        if (app.name !== "Tmux")
            assert.strictEqual(app.target, `${HOME}/Downloads`);
        else
            assert.strictEqual(app.target, "Downloads", "Tmux's subtext is the session it joins, not a URL");
    }
});

test("chooserApps builds Tmux's argv from the directory's session name and path", () => {
    const apps = D.chooserApps(`${HOME}/dev/monorepo/backend`, true, HOME);
    const tmux = apps.find(a => a.name === "Tmux");
    assert.deepStrictEqual(tmux.argv, [
        "ghostty", "-e",
        `${HOME}/dotfiles/bin/df-tmux-session`,
        "dev-monorepo-backend",
        `${HOME}/dev/monorepo/backend`
    ]);
});

test("chooserEntriesFor applies the launch prefix to every Entry but Tmux, and carries no Entry Key", () => {
    const provider = {};
    const entries = D.chooserEntriesFor(`${HOME}/dotfiles`, true, HOME, ["uwsm-app", "--"], provider);

    assert.strictEqual(entries.length, 6);
    for (const entry of entries) {
        assert.strictEqual(entry.key, undefined, "a chooser Entry accumulates no Frecency of its own");
        assert.strictEqual(entry.provider, provider);
    }

    for (const entry of entries.filter(e => e.name !== "Tmux"))
        assert.deepStrictEqual(entry.target.argv.slice(0, 2), ["uwsm-app", "--"]);

    // Tmux is a plain local exec: no launch-prefix machinery, exactly what
    // its argv would be run as if it were the only app.
    const tmux = entries.find(e => e.name === "Tmux");
    assert.deepStrictEqual(tmux.target.argv.slice(0, 2), ["ghostty", "-e"]);

    const zed = entries.find(e => e.name === "Zed");
    assert.ok(zed.target.argv.join(" ").includes("ssh://"));
});

test("the Tmux chooser Entry passes a hostile path through as one argument with no prefix", () => {
    const path = `${HOME}/dev/it's "fine"`;
    const entries = D.chooserEntriesFor(path, false, HOME, ["uwsm-app", "--"], null);
    const tmux = entries.find(e => e.name === "Tmux");
    assert.deepStrictEqual(tmux.target.argv, [
        "ghostty", "-e", `${HOME}/dotfiles/bin/df-tmux-session`, `dev-it's "fine"`, path
    ]);
});

test("chooserEntriesFor defaults to no prefix when none is given", () => {
    const entries = D.chooserEntriesFor(`${HOME}/Downloads`, false, HOME, null, null);
    assert.deepStrictEqual(entries[0].target.argv, ["zeditor", `${HOME}/Downloads`]);
});

test("refreshScript skips the scan while a build is already running", () => {
    const script = D.refreshScript(HOME);
    assert.ok(script.startsWith(`[ -e '${D.cachePath(HOME)}.tmp' ] && exit 0;`),
        "the tmp file is the lock, checked before anything else runs");
});

test("refreshScript rebuilds an empty or stale cache and names STALE_SECONDS", () => {
    const script = D.refreshScript(HOME);
    assert.ok(script.includes(`-gt ${D.STALE_SECONDS}`));
    assert.ok(script.includes(`[ ! -s '${D.cachePath(HOME)}' ]`), "a missing or empty cache counts as stale");
    assert.ok(script.includes("mkdir -p"));
    assert.ok(script.includes("sort -u"));
});

test("buildCacheScript prunes every configured name and scans both roots", () => {
    const script = D.buildCacheScript(HOME);
    for (const name of D.PRUNE_NAMES)
        assert.ok(script.includes(`-name '${name}'`), `${name} should be pruned`);
    for (const root of D.ROOTS)
        assert.ok(script.includes(`'${HOME}/${root}'`), `${root} should be scanned`);
});

test("refreshCommand is a plain sh -c argv, safe for Quickshell.execDetached", () => {
    const command = D.refreshCommand(HOME);
    assert.strictEqual(command[0], "sh");
    assert.strictEqual(command[1], "-c");
    assert.strictEqual(command.length, 3);
    assert.strictEqual(typeof command[2], "string");
});
