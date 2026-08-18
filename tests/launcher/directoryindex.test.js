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
    assert.strictEqual(Index.candidate(undefined, HOME).ok, false);
    assert.strictEqual(Index.candidate("", HOME).ok, false);
    assert.strictEqual(Index.candidate("\n", HOME).ok, false);
});

test("partial and malformed one-path-per-line candidates are not publishable", () => {
    assert.match(Index.candidate(HOME, HOME).error, /complete/);
    assert.match(Index.candidate(`\n${HOME}\n`, HOME).error, /parse/);
    assert.match(Index.candidate(`${HOME}\n\n${HOME}/dev\n`, HOME).error, /parse/);
    assert.match(Index.candidate(`${HOME}\0/dev\n`, HOME).error, /parse/);
});

test("a candidate must contain home and only paths admitted by the existing scope", () => {
    assert.strictEqual(Index.candidate(`${HOME}/dev\n`, HOME).ok, false, "home is the completeness sentinel");
    assert.strictEqual(Index.candidate(`${HOME}\n/etc\n`, HOME).ok, false);
    assert.strictEqual(Index.candidate(`${HOME}\n${HOME}/.hidden\n`, HOME).ok, false);
    assert.strictEqual(Index.candidate(`${HOME}\n${HOME}/dev/a/b/c/d/e/f\n`, HOME).ok, true);
    assert.strictEqual(Index.candidate(`${HOME}\n${HOME}/dev/a/b/c/d/e/f/g\n`, HOME).ok, false);
});

test("a candidate accepts the persisted order produced under a different locale", () => {
    const text = `${HOME}\n${HOME}/backgrounds\n${HOME}/Desktop\n`;
    assert.deepStrictEqual(Index.candidate(text, HOME), {
        ok: true,
        paths: [HOME, `${HOME}/backgrounds`, `${HOME}/Desktop`],
        error: ""
    });
});

test("changed paths publish only after that exact content is persisted", () => {
    const initial = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const text = `${HOME}\n${HOME}/dev\n${HOME}/dotfiles\n`;
    const prepared = Index.prepare(initial, text, HOME);

    assert.strictEqual(prepared.text, text);
    assert.strictEqual(Index.settlePublication(initial, prepared, false), initial);
    assert.deepStrictEqual(Index.settlePublication(initial, prepared, true), {
        paths: [HOME, `${HOME}/dev`, `${HOME}/dotfiles`],
        revision: 5
    });
});

test("identical paths request no persistence and keep the snapshot", () => {
    const initial = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const prepared = Index.prepare(initial, `${HOME}\n${HOME}/dev\n`, HOME);

    assert.strictEqual(prepared.changed, false);
    assert.strictEqual(Index.settlePublication(initial, prepared, true), initial);
});

test("valid startup data is published without requesting a scan", () => {
    assert.deepStrictEqual(Index.startup(`${HOME}\n${HOME}/dev\n`, HOME), {
        snapshot: { paths: [HOME, `${HOME}/dev`], revision: 1 },
        scan: false,
        error: ""
    });
});

test("missing, empty, and invalid startup data expose an empty snapshot and request one scan", () => {
    for (const text of [undefined, "", "\n", `${HOME}/dev\n`, `${HOME}\n/etc\n`]) {
        const started = Index.startup(text, HOME);
        assert.deepStrictEqual(started.snapshot, { paths: [], revision: 0 });
        assert.strictEqual(started.scan, true);
        assert.notStrictEqual(started.error, "");
    }
});

test("access starts immediately when idle without changing the published snapshot", () => {
    const snapshot = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    const requested = Index.request(Index.idleSchedule());

    assert.strictEqual(requested.scan, true);
    assert.deepStrictEqual(snapshot, { paths: [HOME, `${HOME}/dev`], revision: 4 });
});

test("accesses during a scan coalesce into one follow-up scan", () => {
    const first = Index.request(Index.idleSchedule());
    const second = Index.request(first.schedule);
    const third = Index.request(second.schedule);

    assert.strictEqual(second.scan, false);
    assert.strictEqual(third.scan, false);

    const settled = Index.settle(third.schedule);
    assert.strictEqual(settled.scan, true);
    assert.strictEqual(Index.settle(settled.schedule).scan, false);
});

test("a queued access is retried after either a successful or failed scan", () => {
    const queued = { running: true, pending: true };
    assert.strictEqual(Index.settle(queued, true).scan, true);
    assert.strictEqual(Index.settle(queued, false).scan, true);
});

test("invalid candidates retain the last published snapshot", () => {
    const initial = { paths: [HOME], revision: 2 };
    for (const text of ["", `${HOME}\nrelative/path\n`]) {
        const prepared = Index.prepare(initial, text, HOME);
        assert.strictEqual(prepared.ok, false);
        assert.strictEqual(Index.settlePublication(initial, prepared, true), initial);
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
    mkdir("dev/project/src");
    mkdir("dev/project/.generated");
    mkdir("dev/a/b/c/d/e/f");
    mkdir("dev/a/b/c/d/e/f/too-deep");
    mkdir("dotfiles/config");
    for (const excluded of Index.PRUNE_NAMES)
        mkdir(`dev/${excluded}/ignored`);

    const first = Index.candidate(scan(), home);
    assert.strictEqual(first.ok, true);
    assert.deepStrictEqual(first.paths, [...new Set(first.paths)].sort());
    assert.ok(first.paths.includes(home));
    assert.ok(first.paths.includes(path.join(home, "Desktop")));
    assert.ok(first.paths.includes(path.join(home, "dev/project/.generated")));
    assert.ok(!first.paths.includes(path.join(home, ".hidden")));
    assert.ok(!first.paths.includes(path.join(home, "dev/a/b/c/d/e/f/too-deep")));
    for (const excluded of Index.PRUNE_NAMES)
        assert.ok(!first.paths.includes(path.join(home, "dev", excluded)));

    fs.renameSync(path.join(home, "dev/project"), path.join(home, "dev/renamed"));
    fs.rmSync(path.join(home, "Desktop"), { recursive: true });
    mkdir("Downloads");

    const second = Index.candidate(scan(), home);
    assert.strictEqual(second.ok, true);
    assert.ok(second.paths.includes(path.join(home, "dev/renamed")));
    assert.ok(second.paths.includes(path.join(home, "Downloads")));
    assert.ok(!second.paths.includes(path.join(home, "dev/project")));
    assert.ok(!second.paths.includes(path.join(home, "Desktop")));
});

test("a settled access does not suppress the next access", () => {
    const first = Index.request(Index.idleSchedule());
    const settled = Index.settle(first.schedule);
    const second = Index.request(settled.schedule);

    assert.strictEqual(first.scan, true);
    assert.strictEqual(second.scan, true);
});
