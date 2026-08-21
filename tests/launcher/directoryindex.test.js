const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const Index = require("../../quickshell/.config/quickshell/launcher/lib/directoryindex.js");

const HOME = "/home/jehad";

test("one-path-per-line indexes round-trip without changing the existing representation", () => {
    const text = `${HOME}\n${HOME}/dev\n${HOME}/dev/project\n`;
    assert.deepStrictEqual(Index.parse(text), [HOME, `${HOME}/dev`, `${HOME}/dev/project`]);
    assert.strictEqual(Index.serialize(Index.parse(text)), text);
});

test("missing and empty persisted indexes are not publishable", () => {
    assert.strictEqual(Index.validateCandidate(undefined, HOME).ok, false);
    assert.strictEqual(Index.validateCandidate("", HOME).ok, false);
    assert.strictEqual(Index.validateCandidate("\n", HOME).ok, false);
});

test("partial and malformed one-path-per-line candidates are not publishable", () => {
    assert.match(Index.validateCandidate(HOME, HOME).error, /complete/);
    assert.match(Index.validateCandidate(`\n${HOME}\n`, HOME).error, /parse/);
    assert.match(Index.validateCandidate(`${HOME}\n\n${HOME}/dev\n`, HOME).error, /parse/);
    assert.match(Index.validateCandidate(`${HOME}\0/dev\n`, HOME).error, /parse/);
});

test("a candidate must contain home and only paths admitted by the existing scope", () => {
    assert.strictEqual(Index.validateCandidate(`${HOME}/dev\n`, HOME).ok, false, "home is the completeness sentinel");
    assert.strictEqual(Index.validateCandidate(`${HOME}\n/etc\n`, HOME).ok, false);
    assert.strictEqual(Index.validateCandidate(`${HOME}\n${HOME}/.hidden\n`, HOME).ok, false);
    assert.strictEqual(Index.validateCandidate(`${HOME}\n${HOME}/dev/a/b/c/d/e/f\n`, HOME).ok, true);
    assert.strictEqual(Index.validateCandidate(`${HOME}\n${HOME}/dev/a/b/c/d/e/f/g\n`, HOME).ok, false);
});

test("a dot-prefixed root is in scope; a dot-directory not on the whitelist is not", () => {
    assert.strictEqual(Index.inScope(`${HOME}/.agents`, HOME), true);
    assert.strictEqual(Index.inScope(`${HOME}/.notaroot`, HOME), false);
});

test("a candidate accepts the persisted order produced under a different locale", () => {
    const text = `${HOME}\n${HOME}/backgrounds\n${HOME}/Desktop\n`;
    assert.deepStrictEqual(Index.validateCandidate(text, HOME), {
        ok: true,
        paths: [HOME, `${HOME}/backgrounds`, `${HOME}/Desktop`],
        error: ""
    });
});

test("a candidate rejects duplicate paths regardless of persisted locale order", () => {
    const text = `${HOME}\n${HOME}/backgrounds\n${HOME}/Desktop\n${HOME}/backgrounds\n`;
    assert.match(Index.validateCandidate(text, HOME).error, /duplicate/);
});

test("changed paths publish only after that exact content is persisted", () => {
    const initial = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const text = `${HOME}\n${HOME}/dev\n${HOME}/dotfiles\n`;
    const prepared = Index.preparePublication(initial, text, HOME);

    assert.strictEqual(prepared.text, text);
    assert.strictEqual(Index.committedSnapshot(initial, prepared, false), initial);
    assert.deepStrictEqual(Index.committedSnapshot(initial, prepared, true), {
        paths: [HOME, `${HOME}/dev`, `${HOME}/dotfiles`],
        revision: 5
    });
});

test("identical paths request no persistence and keep the snapshot", () => {
    const initial = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const prepared = Index.preparePublication(initial, `${HOME}\n${HOME}/dev\n`, HOME);

    assert.strictEqual(prepared.changed, false);
    assert.strictEqual(Index.committedSnapshot(initial, prepared, true), initial);
});

test("valid startup data is published without requesting a scan", () => {
    assert.deepStrictEqual(Index.loadSnapshot(`${HOME}\n${HOME}/dev\n`, HOME), {
        snapshot: { paths: [HOME, `${HOME}/dev`], revision: 1 },
        scan: false,
        error: ""
    });
});

test("access before startup load coalesces into the first post-load scan", () => {
    const text = `${HOME}\n${HOME}/dev\n`;

    assert.strictEqual(Index.loadSnapshot(text, HOME, true).scan, true);
    assert.strictEqual(Index.loadSnapshot("", HOME, true).scan, true);
});

test("missing, empty, and invalid startup data expose an empty snapshot and request one scan", () => {
    const duplicate = `${HOME}\n${HOME}/dev\n${HOME}/dev\n`;
    for (const text of [undefined, "", "\n", `${HOME}/dev\n`, `${HOME}\n/etc\n`, duplicate]) {
        const started = Index.loadSnapshot(text, HOME);
        assert.deepStrictEqual(started.snapshot, { paths: [], revision: 0 });
        assert.strictEqual(started.scan, true);
        assert.notStrictEqual(started.error, "");
    }
});

test("access starts immediately when idle without changing the published snapshot", () => {
    const snapshot = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const requested = Index.requestScan(Index.idleSchedule());

    assert.strictEqual(requested.scan, true);
    assert.deepStrictEqual(snapshot, { paths: [HOME, `${HOME}/dev`], revision: 4 });
});

test("accesses during a scan coalesce into one follow-up scan", () => {
    const first = Index.requestScan(Index.idleSchedule());
    const second = Index.requestScan(first.schedule);
    const third = Index.requestScan(second.schedule);

    assert.strictEqual(second.scan, false);
    assert.strictEqual(third.scan, false);

    const settled = Index.settleScan(third.schedule);
    assert.strictEqual(settled.scan, true);
    assert.strictEqual(Index.settleScan(settled.schedule).scan, false);
});

test("settling an attempt always drains its queued retry", () => {
    const queued = { running: true, pending: true };
    assert.strictEqual(Index.settleScan(queued).scan, true);
});

test("attempt settlement keeps the snapshot on failure and drains one queued retry", () => {
    const snapshot = { paths: [HOME], revision: 2 };
    const schedule = { running: true, pending: true };
    const invalid = Index.preparePublication(snapshot, "", HOME);
    const unpersisted = Index.preparePublication(snapshot, `${HOME}\n${HOME}/dev\n`, HOME);

    for (const prepared of [null, invalid, unpersisted]) {
        assert.deepStrictEqual(Index.finishAttempt(schedule, snapshot, prepared, false), {
            snapshot,
            schedule: { running: true, pending: false },
            scan: true
        });
    }
});

test("attempt settlement publishes a persisted candidate before becoming idle", () => {
    const snapshot = { paths: [HOME], revision: 2 };
    const prepared = Index.preparePublication(snapshot, `${HOME}\n${HOME}/dev\n`, HOME);

    assert.deepStrictEqual(
        Index.finishAttempt({ running: true, pending: false }, snapshot, prepared, true),
        {
            snapshot: { paths: [HOME, `${HOME}/dev`], revision: 3 },
            schedule: { running: false, pending: false },
            scan: false
        }
    );
});

test("invalid candidates retain the last published snapshot", () => {
    const initial = { paths: [HOME], revision: 2 };
    for (const text of ["", `${HOME}\nrelative/path\n`]) {
        const prepared = Index.preparePublication(initial, text, HOME);
        assert.strictEqual(prepared.ok, false);
        assert.strictEqual(Index.committedSnapshot(initial, prepared, true), initial);
    }
});

test("scan construction preserves roots, depth, hidden, exclusions, sorting, and deduplication", () => {
    const script = Index.buildScanScript(HOME);
    for (const name of Index.PRUNE_NAMES)
        assert.ok(script.includes(`-name '${name}'`), `${name} should be pruned`);
    for (const root of Index.ROOTS)
        assert.ok(script.includes(`'${HOME}/${root}'`), `${root} should be scanned`);
    assert.ok(script.includes("-mindepth 1 -maxdepth 1"));
    assert.ok(script.includes("-name '.*'"));
    assert.ok(script.includes("-maxdepth 6"));
    assert.ok(script.includes("sort -u"));
});

test("remoteAccessCommand wraps the same scan script in ssh, same roots and prunes as the local script", () => {
    const command = Index.remoteAccessCommand(HOME, "arch-devbox");
    assert.deepStrictEqual(command.slice(0, 2), ["ssh", "arch-devbox"]);
    assert.strictEqual(command.length, 3, "the whole script is one argument -- ssh hands it whole to the remote login shell to re-parse");

    const script = command[2];
    for (const name of Index.PRUNE_NAMES)
        assert.ok(script.includes(`-name '${name}'`), `${name} should be pruned`);
    for (const root of Index.ROOTS)
        assert.ok(script.includes(`'${HOME}/${root}'`), `${root} should be scanned`);
    assert.ok(script.startsWith(Index.buildScanScript(HOME)), "reuses buildScanScript verbatim rather than re-deriving it");
});

test("remoteAccessCommand tails the scan file to stdout, unlike the local script which only writes it", () => {
    const local = Index.buildScanScript(HOME);
    assert.ok(!local.includes("cat "), "the local script has no reader -- DirectoryIndex.qml reads the file back itself");

    const command = Index.remoteAccessCommand(HOME, "arch-devbox");
    assert.ok(command[2].endsWith(" && cat '" + Index.scanPath(HOME) + "'"),
        "this machine can't reach the remote box's ~/.cache, so the command must print the scan result itself");
});

test("remoteIndexPath is host-scoped and distinct from the local index's own file", () => {
    const local = Index.indexPath(HOME);
    const archbox = Index.remoteIndexPath(HOME, "arch-devbox");
    const ubuntubox = Index.remoteIndexPath(HOME, "ubuntu-devbox");

    assert.notStrictEqual(archbox, local, "a remote cache must never collide with the local index's file");
    assert.notStrictEqual(archbox, ubuntubox, "switching custom hosts must never collide caches (ticket 91, story 20)");
    assert.ok(archbox.startsWith(HOME + "/.cache/df-dir-picker/"), "lives alongside the local index, not a second cache root");
    assert.ok(archbox.endsWith("remote-arch-devbox.list"));
});

test("slugHost neutralizes characters unsafe in a filename, same acceptance as sessionNameOf", () => {
    assert.strictEqual(Index.slugHost("arch-devbox"), "arch-devbox", "a plain alias round-trips unchanged");
    assert.strictEqual(Index.slugHost("my box"), "my_box");
    assert.strictEqual(Index.slugHost("box/../etc"), "box_.._etc", "a path separator can never escape the cache directory");
});

test("the real scan contract replaces an isolated home snapshot losslessly", t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "directory-index-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const mkdir = relative => fs.mkdirSync(path.join(home, relative), { recursive: true });
    const scan = () => {
        const [file, ...args] = Index.accessCommand(home);
        childProcess.execFileSync(file, args);
        return fs.readFileSync(Index.scanPath(home), "utf8");
    };

    mkdir("Desktop");
    mkdir(".hidden");
    mkdir(".agents/skills");
    mkdir("dev/project/src");
    mkdir("dev/project/.generated");
    mkdir("dev/a/b/c/d/e/f");
    mkdir("dev/a/b/c/d/e/f/too-deep");
    mkdir("dotfiles/config");
    for (const excluded of Index.PRUNE_NAMES)
        mkdir(`dev/${excluded}/ignored`);

    const first = Index.validateCandidate(scan(), home);
    assert.strictEqual(first.ok, true);
    assert.deepStrictEqual(first.paths, [...new Set(first.paths)].sort());
    assert.ok(first.paths.includes(home));
    assert.ok(first.paths.includes(path.join(home, "Desktop")));
    assert.ok(first.paths.includes(path.join(home, "dev/project/.generated")));
    assert.ok(first.paths.includes(path.join(home, ".agents")), "a whitelisted dot-root is a leaf entry, not just its contents");
    assert.ok(first.paths.includes(path.join(home, ".agents/skills")));
    assert.ok(!first.paths.includes(path.join(home, ".hidden")), "a dot-directory off the whitelist stays excluded");
    assert.ok(!first.paths.includes(path.join(home, "dev/a/b/c/d/e/f/too-deep")));
    for (const excluded of Index.PRUNE_NAMES)
        assert.ok(!first.paths.includes(path.join(home, "dev", excluded)));

    fs.renameSync(path.join(home, "dev/project"), path.join(home, "dev/renamed"));
    fs.rmSync(path.join(home, "Desktop"), { recursive: true });
    mkdir("Downloads");

    const second = Index.validateCandidate(scan(), home);
    assert.strictEqual(second.ok, true);
    assert.ok(second.paths.includes(path.join(home, "dev/renamed")));
    assert.ok(second.paths.includes(path.join(home, "Downloads")));
    assert.ok(!second.paths.includes(path.join(home, "dev/project")));
    assert.ok(!second.paths.includes(path.join(home, "Desktop")));
});

test("a settled access does not suppress the next access", () => {
    const first = Index.requestScan(Index.idleSchedule());
    const settled = Index.settleScan(first.schedule);
    const second = Index.requestScan(settled.schedule);

    assert.strictEqual(first.scan, true);
    assert.strictEqual(second.scan, true);
});
