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

test("herdrLaunchArgv runs the session script in ghostty, titled with the session name, and passes the name and path as separate arguments", () => {
    const argv = D.herdrLaunchArgv(`${HOME}/dev/monorepo/backend`, HOME);
    assert.deepStrictEqual(argv, [
        "ghostty", "--title=dev-monorepo-backend", "-e",
        `${HOME}/dotfiles/bin/df-herdr-session`,
        "dev-monorepo-backend",
        `${HOME}/dev/monorepo/backend`
    ]);
    assert.strictEqual(D.herdrLaunchArgv(HOME, HOME)[4], "home", "the ~ entry's session is named home");
});

test("herdrLaunchArgv passes a hostile path through as one argument, unescaped", () => {
    const path = `${HOME}/dev/it's "fine"`;
    const argv = D.herdrLaunchArgv(path, HOME);
    assert.strictEqual(argv.length, 6);
    assert.strictEqual(argv[5], path,
        "the path is one argv element -- ghostty 1.2+ execs its -e arguments verbatim, so single-quote doubling would arrive at the script as literal text");
    assert.strictEqual(argv[4], `dev-it's "fine"`);
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

test("chooserApps offers Herdr alongside the same five apps, mirrored or not", () => {
    const local = D.chooserApps(`${HOME}/Downloads`, false, HOME).map(a => a.name);
    const mirrored = D.chooserApps(`${HOME}/dotfiles`, true, HOME).map(a => a.name);
    assert.deepStrictEqual(local, ["Herdr", "Zed", "VSCode", "Cursor", "Neovim", "Files"]);
    assert.deepStrictEqual(mirrored, ["Herdr", "Zed", "VSCode", "Cursor", "Neovim", "Files"],
        "Herdr is offered for every directory, with no mirror condition");
});

test("chooserApps sends every app but Files and Herdr over ssh for a mirrored directory", () => {
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

    // Herdr's own argv stays local; the session script resolves routing itself.
    assert.strictEqual(byName.Herdr.argv[0], "ghostty");
    assert.ok(!byName.Herdr.argv.join(" ").includes("ssh"));
});

test("chooserApps stays local for every app when the directory is not mirrored", () => {
    const apps = D.chooserApps(`${HOME}/Downloads`, false, HOME);
    for (const app of apps) {
        assert.ok(!app.argv.join(" ").includes("ssh"), `${app.name} should not go over ssh for a host-only directory`);
        if (app.name !== "Herdr")
            assert.strictEqual(app.target, `${HOME}/Downloads`);
        else
            assert.strictEqual(app.target, "Downloads", "Herdr's subtext is the session it joins, not a URL");
    }
});

test("chooserApps builds Herdr's argv from the directory's session name and path", () => {
    const apps = D.chooserApps(`${HOME}/dev/monorepo/backend`, true, HOME);
    const herdr = apps.find(a => a.name === "Herdr");
    assert.deepStrictEqual(herdr.argv, [
        "ghostty", "--title=dev-monorepo-backend", "-e",
        `${HOME}/dotfiles/bin/df-herdr-session`,
        "dev-monorepo-backend",
        `${HOME}/dev/monorepo/backend`
    ]);
});

test("chooserEntriesFor applies the launch prefix to every Entry but Herdr, and carries no Entry Key", () => {
    const provider = {};
    const entries = D.chooserEntriesFor(`${HOME}/dotfiles`, true, HOME, ["uwsm-app", "--"], provider);

    assert.strictEqual(entries.length, 6);
    for (const entry of entries) {
        assert.strictEqual(entry.key, undefined, "a chooser Entry accumulates no Frecency of its own");
        assert.strictEqual(entry.provider, provider);
    }

    for (const entry of entries.filter(e => e.name !== "Herdr"))
        assert.deepStrictEqual(entry.target.argv.slice(0, 2), ["uwsm-app", "--"]);

    // Herdr is a plain local exec: no launch-prefix machinery, exactly what
    // its argv would be run as if it were the only app.
    const herdr = entries.find(e => e.name === "Herdr");
    assert.strictEqual(herdr.target.argv[0], "ghostty");
    assert.strictEqual(herdr.target.argv[2], "-e");

    const zed = entries.find(e => e.name === "Zed");
    assert.ok(zed.target.argv.join(" ").includes("ssh://"));
});

test("the Herdr chooser Entry passes a hostile path through as one argument with no prefix", () => {
    const path = `${HOME}/dev/it's "fine"`;
    const entries = D.chooserEntriesFor(path, false, HOME, ["uwsm-app", "--"], null);
    const herdr = entries.find(e => e.name === "Herdr");
    assert.deepStrictEqual(herdr.target.argv, [
        "ghostty", `--title=dev-it's "fine"`, "-e",
        `${HOME}/dotfiles/bin/df-herdr-session`, `dev-it's "fine"`, path
    ]);
});

test("chooserEntriesFor defaults to no prefix when none is given", () => {
    const entries = D.chooserEntriesFor(`${HOME}/Downloads`, false, HOME, null, null);
    const zed = entries.find(e => e.name === "Zed");
    assert.deepStrictEqual(zed.target.argv, ["zeditor", `${HOME}/Downloads`]);
});

// The devcontainer routing toggle (docs/adr/0002, ticket 01): `routed` is the
// caller's already-resolved decision (isMirrored && the toggle), not
// isMirrored's raw answer, and `host` is the resolved custom host or falsy
// for "use SSH_HOST".

test("routing disabled sends a mirrored directory local, overriding isMirrored's own true answer", () => {
    const path = `${HOME}/dotfiles`;
    const prefix = ["uwsm-app", "--"];
    assert.ok(D.isMirrored(path, HOME), "isMirrored itself still says mirrored -- untouched by routing state");

    assert.deepStrictEqual(D.defaultOpenArgv(path, false, prefix), ["uwsm-app", "--", "zeditor", path],
        "routed=false wins over isMirrored's own true answer -- the toggle overrides, it doesn't layer");

    for (const app of D.chooserApps(path, false, HOME))
        assert.ok(!app.argv.join(" ").includes("ssh"), `${app.name} must stay local when routing is off`);
});

test("routing enabled with no custom host matches today's hardcoded SSH_HOST behavior byte-for-byte", () => {
    const path = `${HOME}/dotfiles`;
    const prefix = ["uwsm-app", "--"];

    assert.deepStrictEqual(D.defaultOpenArgv(path, true, prefix),
        ["uwsm-app", "--", "zeditor", `ssh://${D.SSH_HOST}${path}`]);
    assert.deepStrictEqual(D.defaultOpenArgv(path, true, prefix, ""), D.defaultOpenArgv(path, true, prefix),
        "a blank host string falls back the same as an omitted one");

    const byName = Object.fromEntries(D.chooserApps(path, true, HOME).map(a => [a.name, a]));
    assert.deepStrictEqual(byName.VSCode.argv, ["code", "--remote", `ssh-remote+${D.SSH_HOST}`, path]);
});

test("routing enabled with a custom host reaches every ssh surface but not Herdr", () => {
    const path = `${HOME}/dotfiles`;
    const host = "my-other-box";
    const byName = Object.fromEntries(D.chooserApps(path, true, HOME, host).map(a => [a.name, a]));

    assert.strictEqual(D.sshUrlFor(path, host), `ssh://${host}${path}`);
    assert.deepStrictEqual(D.defaultOpenArgv(path, true, [], host), ["zeditor", `ssh://${host}${path}`]);
    assert.deepStrictEqual(byName.Zed.argv, ["zeditor", `ssh://${host}${path}`]);
    assert.deepStrictEqual(byName.VSCode.argv, ["code", "--remote", `ssh-remote+${host}`, path]);
    assert.deepStrictEqual(byName.Cursor.argv, ["cursor", "--remote", `ssh-remote+${host}`, path]);
    assert.strictEqual(byName.Neovim.argv[4], host, "the ssh -t target is the custom host, not the default");

    // Herdr re-resolves routing itself (ticket 02) rather than trusting this
    // argv -- neither host name should appear in it.
    assert.ok(!byName.Herdr.argv.some(arg => arg.includes(host)));
    assert.ok(!byName.Herdr.argv.some(arg => arg.includes(D.SSH_HOST)));
});

test("chooserEntriesFor threads the resolved host through to the mapped Entries", () => {
    const entries = D.chooserEntriesFor(`${HOME}/dotfiles`, true, HOME, ["uwsm-app", "--"], null, "my-other-box");
    const zed = entries.find(e => e.name === "Zed");
    assert.ok(zed.target.argv.join(" ").includes("ssh://my-other-box"));
});
