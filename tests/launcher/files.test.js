// Tests for the files Provider's pure half: the folder-scoped listing (which
// folders a Query selects, how they are ordered, and how their contents are
// attached), the children read, and the commands a file can be opened with.
//
//     node --test "tests/launcher/*.test.js"
//
// The children read itself runs `find`, which nothing here can exercise --
// these tests check its *shape* as argv, the same limit directories.test.js
// has for the refresh script. Whether the listing matches on the real corpus
// is a host claim, in the ticket's own Manual verification.

const test = require("node:test");
const assert = require("node:assert");

const F = require("../../quickshell/.config/quickshell/launcher/lib/files.js");

const HOME = "/home/jehad";
const PATHS = [
    `${HOME}`,
    `${HOME}/dev/backend`,
    `${HOME}/dev/backend.old`,
    `${HOME}/dev/backend/backend-utils`,
    `${HOME}/dev/monorepo/services/api/backend`,
    `${HOME}/dotfiles`,
    `${HOME}/Downloads`
];

test("an empty Query matches nothing, deliberately", () => {
    assert.deepStrictEqual(F.matchFolders(PATHS, HOME, ""), []);
    assert.deepStrictEqual(F.matchFolders(PATHS, HOME, undefined), []);
    assert.deepStrictEqual(F.matchFolders(PATHS, HOME, null), []);
});

test("folders are matched on their NAME, not on their whole path", () => {
    // The lua's own anti-bug rule: a Query of "backend" must not also select
    // dev/api/backend/src just because an ancestor matched -- those are
    // already listed as that folder's contents, and matching them here would
    // produce the same directory twice. dev/monorepo/services/api/backend
    // matches because it is *named* backend; dev/backend.old and
    // dev/backend/backend-utils match because their names contain the Query.
    // Exact-name matches rank first, then the substring ones, shallowest
    // first.
    const names = F.matchFolders(PATHS, HOME, "backend").map(m => m.rel);
    assert.deepStrictEqual(names, [
        "dev/backend",
        "dev/monorepo/services/api/backend",
        "dev/backend.old",
        "dev/backend/backend-utils"
    ]);
});

test("an exact leaf match outranks a prefix, which outranks a substring", () => {
    const paths = [
        `${HOME}/dev/backend-staging`,
        `${HOME}/dev/xbackend`,
        `${HOME}/dev/backend`
    ];
    const rels = F.matchFolders(paths, HOME, "backend").map(m => m.rel);
    assert.deepStrictEqual(rels, ["dev/backend", "dev/backend-staging", "dev/xbackend"]);
});

test("a Query containing a slash matches the whole path instead of the leaf", () => {
    const rels = F.matchFolders(PATHS, HOME, "api/back").map(m => m.rel);
    assert.deepStrictEqual(rels, ["dev/monorepo/services/api/backend"]);

    // Non-spanning, the same folder does not match: its leaf ("backend")
    // contains no slash for the path rule, and its name does not contain
    // "api/back".
    assert.deepStrictEqual(F.matchFolders(PATHS, HOME, "api/back".replace("/", "")), []);
});

test("a spanning Query ranks every match alike, shallowest first", () => {
    // A Query containing "/" can only match on the path -- no leaf contains a
    // slash, so the leaf ranks are unreachable and every match is the lua's
    // rank 3, tied and decided by shallowness.
    const paths = [
        `${HOME}/dev/backend/src`,
        `${HOME}/dev/backend`
    ];
    const rels = F.matchFolders(paths, HOME, "dev/backend").map(m => m.rel);
    assert.deepStrictEqual(rels, ["dev/backend", "dev/backend/src"]);
});

test("shallower folders win ties", () => {
    const paths = [
        `${HOME}/dev/monorepo/backend`,
        `${HOME}/dev/backend`
    ];
    const rels = F.matchFolders(paths, HOME, "backend").map(m => m.rel);
    assert.deepStrictEqual(rels, ["dev/backend", "dev/monorepo/backend"]);
});

test("$HOME itself is \"~\" and matches by that name", () => {
    const rels = F.matchFolders([HOME], HOME, "~").map(m => m.rel);
    assert.deepStrictEqual(rels, ["~"]);
});

test("matchFolders lowercases both sides", () => {
    const rels = F.matchFolders([`${HOME}/dev/BackEnd`], HOME, "backend").map(m => m.rel);
    assert.deepStrictEqual(rels, ["dev/BackEnd"]);
    assert.deepStrictEqual(F.matchFolders([`${HOME}/dev/backend`], HOME, "BACKEND"), [{ path: `${HOME}/dev/backend`, rel: "dev/backend", rank: 0 }]);
});

test("expandPaths names only the top MAX_EXPAND matched folders", () => {
    const paths = [];
    for (let i = 0; i < 20; i++)
        paths.push(`${HOME}/dev/folder-${i}`);
    const expanded = F.expandPaths(paths, HOME, "folder");
    assert.strictEqual(expanded.length, F.MAX_EXPAND);
    assert.deepStrictEqual(expanded, paths.slice(0, F.MAX_EXPAND));

    assert.deepStrictEqual(F.expandPaths(PATHS, HOME, "nomatch"), []);
    assert.deepStrictEqual(F.expandPaths(PATHS, HOME, ""), []);
});

test("childrenCommand is a single find over every folder, as argv", () => {
    const command = F.childrenCommand([`${HOME}/dev/backend`, `${HOME}/dotfiles`]);
    assert.strictEqual(command[0], "find");
    assert.deepStrictEqual(command.slice(1, 3), [`${HOME}/dev/backend`, `${HOME}/dotfiles`]);
    assert.ok(command.includes("-maxdepth"));
    assert.ok(command.includes("-printf"));
    assert.ok(command.includes("%y %p\n"));
});

test("parseChildren groups lines by parent and keeps the kind", () => {
    const text = [
        `d ${HOME}/dev/backend/src`,
        `f ${HOME}/dev/backend/index.ts`,
        `l ${HOME}/dev/backend/link`,
        `f ${HOME}/dotfiles/README.md`,
        ""
    ].join("\n");

    const map = F.parseChildren(text);
    assert.deepStrictEqual(map[`${HOME}/dev/backend`], [
        { kind: "d", path: `${HOME}/dev/backend/src` },
        { kind: "f", path: `${HOME}/dev/backend/index.ts` },
        { kind: "l", path: `${HOME}/dev/backend/link` }
    ]);
    assert.deepStrictEqual(map[`${HOME}/dotfiles`], [{ kind: "f", path: `${HOME}/dotfiles/README.md` }]);

    assert.deepStrictEqual(F.parseChildren(""), {});
    assert.deepStrictEqual(F.parseChildren("not a listing line"), {});
    assert.deepStrictEqual(F.parseChildren(undefined), {});
});

test("entriesFor lists each matched folder followed by its own contents", () => {
    const children = {
        [`${HOME}/dev/backend`]: [
            { kind: "f", path: `${HOME}/dev/backend/index.ts` },
            { kind: "d", path: `${HOME}/dev/backend/src` }
        ],
        [`${HOME}/dotfiles`]: [
            { kind: "f", path: `${HOME}/dotfiles/README.md` }
        ]
    };

    // Rank first, shallowness second -- the lua's own order: both
    // dev/backend and dev/monorepo/services/api/backend are exact leaf
    // matches (rank 0), so the shallower one comes first; the substring
    // matches rank below both no matter how shallow.
    const entries = F.entriesFor(PATHS, HOME, "backend", children, null);
    assert.deepStrictEqual(entries.map(e => e.name), [
        "dev/backend/",
        "dev/backend/index.ts",
        "dev/backend/src/",
        "dev/monorepo/services/api/backend/",
        "dev/backend.old/",
        "dev/backend/backend-utils/"
    ]);
});

test("children are sorted by path within their parent", () => {
    const children = {
        [`${HOME}/dev/backend`]: [
            { kind: "f", path: `${HOME}/dev/backend/zebra.txt` },
            { kind: "f", path: `${HOME}/dev/backend/apple.txt` }
        ]
    };

    const entries = F.entriesFor([`${HOME}/dev/backend`], HOME, "backend", children, null);
    assert.deepStrictEqual(entries.map(e => e.name), [
        "dev/backend/",
        "dev/backend/apple.txt",
        "dev/backend/zebra.txt"
    ]);
});

test("a child that is itself a matched folder appears once, as its parent's child", () => {
    // Searching "backend" matches dev/backend (exact) and
    // dev/backend/backend-utils (substring). The parent is shallower, so it
    // comes first, its children are added, and the standalone match for
    // backend-utils is a no-op -- the lua's `seen` table.
    const children = {
        [`${HOME}/dev/backend`]: [
            { kind: "d", path: `${HOME}/dev/backend/backend-utils` }
        ]
    };

    const entries = F.entriesFor(PATHS, HOME, "backend", children, null);
    const names = entries.map(e => e.name);
    assert.strictEqual(names.filter(n => n === "dev/backend/backend-utils/").length, 1);
    assert.strictEqual(entries.filter(e => e.name === "dev/backend/backend-utils/")[0].subtext, `${HOME}/dev/backend/backend-utils`);
});

test("an exact-named child outranks its substring-matched parent and lists alone", () => {
    // The reverse of the case above, same `seen` table: searching "backend"
    // matches dev/backend-utils (substring, rank 2) and its own child
    // dev/backend-utils/backend (exact, rank 0). Rank beats shallowness, so
    // the child's standalone row sorts above its parent's, wins the dedupe,
    // and the parent lists without it -- there is no "the parent always comes
    // first" rule.
    const children = {
        [`${HOME}/dev/backend-utils`]: [
            { kind: "d", path: `${HOME}/dev/backend-utils/backend` }
        ]
    };

    const entries = F.entriesFor(
        [`${HOME}/dev/backend-utils`, `${HOME}/dev/backend-utils/backend`],
        HOME, "backend", children, null);
    assert.deepStrictEqual(entries.map(e => e.name), [
        "dev/backend-utils/backend/",
        "dev/backend-utils/"
    ]);
});

test("entriesFor caps listed folders at MAX_DIRS and expanded ones at MAX_EXPAND", () => {
    const paths = [];
    const children = {};
    for (let i = 0; i < F.MAX_DIRS + 5; i++) {
        paths.push(`${HOME}/dev/folder-${i}`);
        children[`${HOME}/dev/folder-${i}`] = [{ kind: "f", path: `${HOME}/dev/folder-${i}/file.txt` }];
    }

    const entries = F.entriesFor(paths, HOME, "folder", children, null);
    assert.strictEqual(entries.length, F.MAX_DIRS + F.MAX_EXPAND,
        "every listed folder plus the expanded ones' children");

    for (let i = F.MAX_EXPAND; i < F.MAX_DIRS; i++)
        assert.ok(!entries.some(e => e.name === `dev/folder-${i}/file.txt`),
            `folder ${i} is listed but must not be expanded`);
    for (let i = 0; i < F.MAX_EXPAND; i++)
        assert.ok(entries.some(e => e.name === `dev/folder-${i}/file.txt`));
});

// The cap exists so one crowded folder cannot push every folder matched after
// it past merge()'s DEFAULT_LIMIT -- an ordered catalog has no scores to fall
// back on, so anything past that limit is simply lost. See MAX_CHILDREN.
test("entriesFor caps one folder's contents at MAX_CHILDREN, keeping every folder listed", () => {
    const paths = [];
    const children = {};
    for (let i = 0; i < F.MAX_DIRS; i++) {
        const folder = `${HOME}/dev/folder-${i}`;
        paths.push(folder);
        children[folder] = [];
        for (let k = 0; k < F.MAX_CHILDREN + 20; k++)
            children[folder].push({ kind: "f", path: `${folder}/file-${String(k).padStart(3, "0")}` });
    }

    const entries = F.entriesFor(paths, HOME, "folder", children, null);
    assert.strictEqual(entries.length, F.MAX_DIRS + F.MAX_EXPAND * F.MAX_CHILDREN);
    assert.ok(entries.length <= 200, "fits inside merge()'s DEFAULT_LIMIT");

    for (let i = 0; i < F.MAX_DIRS; i++)
        assert.ok(entries.some(e => e.name === `dev/folder-${i}/`),
            `folder ${i} must still be listed`);

    const kept = entries.filter(e => e.subtext.startsWith(`${HOME}/dev/folder-0/`));
    assert.strictEqual(kept.length, F.MAX_CHILDREN);
    assert.strictEqual(kept[0].name, "dev/folder-0/file-000", "the first by path, not an arbitrary slice");
});

test("an Entry carries the absolute path as subtext, no Key, and its own mirrored target", () => {
    const children = {
        [`${HOME}/dotfiles`]: [{ kind: "f", path: `${HOME}/dotfiles/README.md` }]
    };

    const entries = F.entriesFor(PATHS, HOME, "dotfiles", children, null);
    const folder = entries[0];
    assert.strictEqual(folder.name, "dotfiles/");
    assert.strictEqual(folder.subtext, `${HOME}/dotfiles`);
    assert.strictEqual(folder.icon, "folder");
    assert.strictEqual(folder.key, undefined, "files accumulate no Frecency -- no checkbox asks for it");
    assert.deepStrictEqual(folder.target, { path: `${HOME}/dotfiles`, mirrored: true });

    const file = entries[1];
    // A child's name is its full relative path, not its leaf -- the lua's
    // `Text = rel` with rel = c.path:sub(#home + 2) -- so a file is never
    // ambiguous with another of the same name elsewhere.
    assert.strictEqual(file.name, "dotfiles/README.md");
    assert.strictEqual(file.icon, "text-x-generic");
    assert.strictEqual(file.subtext, `${HOME}/dotfiles/README.md`);
    assert.deepStrictEqual(file.target, { path: `${HOME}/dotfiles/README.md`, mirrored: true });
});

test("a non-mirrored path carries mirrored: false down to its Entries", () => {
    const children = {
        [`${HOME}/Downloads`]: [{ kind: "f", path: `${HOME}/Downloads/file.pdf` }]
    };
    const entries = F.entriesFor(PATHS, HOME, "Download", children, null);
    assert.deepStrictEqual(entries[1].target, { path: `${HOME}/Downloads/file.pdf`, mirrored: false });
});

test("defaultOpenArgv opens a mirrored path over ssh and everything else locally", () => {
    const prefix = ["uwsm-app", "--"];
    assert.deepStrictEqual(
        F.defaultOpenArgv(`${HOME}/dotfiles/README.md`, true, prefix),
        ["uwsm-app", "--", "zeditor", `ssh://${F.SSH_HOST}${HOME}/dotfiles/README.md`]
    );
    assert.deepStrictEqual(
        F.defaultOpenArgv(`${HOME}/Downloads/file.pdf`, false, prefix),
        ["uwsm-app", "--", "zeditor", `${HOME}/Downloads/file.pdf`]
    );
});

test("chooserApps offers the same five apps regardless of mirroring", () => {
    const local = F.chooserApps(`${HOME}/Downloads/file.pdf`, false).map(a => a.name);
    const mirrored = F.chooserApps(`${HOME}/dotfiles/README.md`, true).map(a => a.name);
    assert.deepStrictEqual(local, ["Zed", "VSCode", "Cursor", "Neovim", "Reveal in Files"]);
    assert.deepStrictEqual(mirrored, ["Zed", "VSCode", "Cursor", "Neovim", "Reveal in Files"]);
});

test("chooserApps sends every app but Reveal over ssh for a mirrored path", () => {
    const apps = F.chooserApps(`${HOME}/dotfiles/README.md`, true);
    const byName = Object.fromEntries(apps.map(a => [a.name, a]));

    assert.ok(byName.Zed.argv.join(" ").includes("ssh://"));
    assert.ok(byName.VSCode.argv.includes("--remote"));
    assert.ok(byName.Cursor.argv.includes("--remote"));
    assert.ok(byName.Neovim.argv.includes("ssh"));

    // Reveal has no remote command at all -- ported from
    // dotfiles_file_opener.lua's APPS table, where it is the one entry with
    // no `remote` field.
    assert.deepStrictEqual(byName["Reveal in Files"].argv, ["nautilus", "--select", `${HOME}/dotfiles/README.md`]);
    assert.strictEqual(byName["Reveal in Files"].target, `${HOME}/dotfiles/README.md`);
});

test("chooserApps stays local for every app when the path is not mirrored", () => {
    const apps = F.chooserApps(`${HOME}/Downloads/file.pdf`, false);
    for (const app of apps) {
        assert.ok(!app.argv.join(" ").includes("ssh"), `${app.name} should not go over ssh for a host-only path`);
        assert.strictEqual(app.target, `${HOME}/Downloads/file.pdf`);
    }
});

test("chooserApps opens the file's parent with the file, not the file alone", () => {
    const apps = F.chooserApps(`${HOME}/dev/backend/index.ts`, false);
    const byName = Object.fromEntries(apps.map(a => [a.name, a]));

    assert.deepStrictEqual(byName.Neovim.argv, ["ghostty", `--working-directory=${HOME}/dev/backend`, "-e", "nvim", `${HOME}/dev/backend/index.ts`]);
    assert.deepStrictEqual(byName["Reveal in Files"].argv, ["nautilus", "--select", `${HOME}/dev/backend/index.ts`]);
});

test("the remote nvim command escapes both the directory and the file for the remote shell", () => {
    const apps = F.chooserApps(`${HOME}/dev/my folder/index.ts`, true);
    const nvim = apps.find(a => a.name === "Neovim");
    assert.ok(nvim.argv.join(" ").includes("cd '/home/jehad/dev/my folder' && exec nvim '/home/jehad/dev/my folder/index.ts'"));
});

test("chooserEntriesFor applies the launch prefix and carries no Entry Key", () => {
    const provider = {};
    const entries = F.chooserEntriesFor(`${HOME}/dotfiles/README.md`, true, ["uwsm-app", "--"], provider);

    assert.strictEqual(entries.length, 5);
    for (const entry of entries) {
        assert.strictEqual(entry.key, undefined, "a chooser Entry accumulates no Frecency of its own");
        assert.strictEqual(entry.provider, provider);
        assert.deepStrictEqual(entry.target.argv.slice(0, 2), ["uwsm-app", "--"]);
    }

    const zed = entries.find(e => e.name === "Zed");
    assert.ok(zed.target.argv.join(" ").includes("ssh://"));
    assert.strictEqual(zed.subtext, `ssh://${F.SSH_HOST}${HOME}/dotfiles/README.md`);
});

test("chooserEntriesFor defaults to no prefix when none is given", () => {
    const entries = F.chooserEntriesFor(`${HOME}/Downloads/file.pdf`, false, null, null);
    assert.deepStrictEqual(entries[0].target.argv, ["zeditor", `${HOME}/Downloads/file.pdf`]);
});

// The devcontainer routing toggle (docs/adr/0002, ticket 01): `routed` is the
// caller's already-resolved decision (isMirrored && the toggle), not
// isMirrored's raw answer, and `host` is the resolved custom host or falsy
// for "use SSH_HOST".

test("routing disabled sends a mirrored file local, overriding entriesFor's own mirrored:true", () => {
    const children = {
        [`${HOME}/dotfiles`]: [{ kind: "f", path: `${HOME}/dotfiles/README.md` }]
    };
    const file = F.entriesFor(PATHS, HOME, "dotfiles", children, null)[1];
    assert.strictEqual(file.target.mirrored, true, "entriesFor's own isMirrored answer is untouched by routing state");

    const prefix = ["uwsm-app", "--"];
    assert.deepStrictEqual(F.defaultOpenArgv(file.target.path, false, prefix),
        ["uwsm-app", "--", "zeditor", file.target.path],
        "routed=false wins over the Entry's own mirrored:true -- the toggle overrides, it doesn't layer");

    for (const app of F.chooserApps(file.target.path, false))
        assert.ok(!app.argv.join(" ").includes("ssh"), `${app.name} must stay local when routing is off`);
});

test("routing enabled with no custom host matches today's hardcoded SSH_HOST behavior byte-for-byte", () => {
    const path = `${HOME}/dotfiles/README.md`;
    const prefix = ["uwsm-app", "--"];

    assert.deepStrictEqual(F.defaultOpenArgv(path, true, prefix),
        ["uwsm-app", "--", "zeditor", `ssh://${F.SSH_HOST}${path}`]);
    assert.deepStrictEqual(F.defaultOpenArgv(path, true, prefix, ""), F.defaultOpenArgv(path, true, prefix),
        "a blank host string falls back the same as an omitted one");

    const byName = Object.fromEntries(F.chooserApps(path, true).map(a => [a.name, a]));
    assert.deepStrictEqual(byName.VSCode.argv, ["code", "--remote", `ssh-remote+${F.SSH_HOST}`, path]);
});

test("routing enabled with a custom host reaches every ssh surface", () => {
    const path = `${HOME}/dotfiles/README.md`;
    const host = "my-other-box";
    const byName = Object.fromEntries(F.chooserApps(path, true, host).map(a => [a.name, a]));

    assert.deepStrictEqual(F.defaultOpenArgv(path, true, [], host), ["zeditor", `ssh://${host}${path}`]);
    assert.deepStrictEqual(byName.Zed.argv, ["zeditor", `ssh://${host}${path}`]);
    assert.deepStrictEqual(byName.VSCode.argv, ["code", "--remote", `ssh-remote+${host}`, path]);
    assert.deepStrictEqual(byName.Cursor.argv, ["cursor", "--remote", `ssh-remote+${host}`, path]);
    assert.strictEqual(byName.Neovim.argv[4], host, "the ssh -t target is the custom host, not the default");
});

test("chooserEntriesFor threads the resolved host through to the mapped Entries", () => {
    const entries = F.chooserEntriesFor(`${HOME}/dotfiles/README.md`, true, ["uwsm-app", "--"], null, "my-other-box");
    const zed = entries.find(e => e.name === "Zed");
    assert.ok(zed.target.argv.join(" ").includes("ssh://my-other-box"));
});
