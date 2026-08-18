const test = require("node:test");
const assert = require("node:assert");

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

test("publishing changed paths increments the revision while identical paths keep the snapshot", () => {
    const initial = { paths: [HOME, `${HOME}/dev`], revision: 4 };
    assert.strictEqual(Index.publish(initial, `${HOME}\n${HOME}/dev\n`, HOME), initial);

    const changed = Index.publish(initial, `${HOME}\n${HOME}/dev\n${HOME}/dotfiles\n`, HOME);
    assert.deepStrictEqual(changed, {
        paths: [HOME, `${HOME}/dev`, `${HOME}/dotfiles`],
        revision: 5
    });
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
    assert.strictEqual(Index.publish(initial, "", HOME), initial);
    assert.strictEqual(Index.publish(initial, `${HOME}\nrelative/path\n`, HOME), initial);
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

test("a settled access does not suppress the next access", () => {
    const first = Index.request(Index.idleSchedule());
    const settled = Index.settle(first.schedule);
    const second = Index.request(settled.schedule);

    assert.strictEqual(first.scan, true);
    assert.strictEqual(second.scan, true);
});
