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

test("access remains an asynchronous stale-gated command for the prefactor", () => {
    const command = Index.accessCommand(HOME);
    assert.deepStrictEqual(command.slice(0, 2), ["sh", "-c"]);
    assert.ok(command[2].startsWith(`[ -e '${Index.cachePath(HOME)}.tmp' ] && exit 0;`));
    assert.ok(command[2].includes(`-gt ${Index.STALE_SECONDS}`));
    assert.ok(command[2].includes(`[ ! -s '${Index.cachePath(HOME)}' ]`));
});
