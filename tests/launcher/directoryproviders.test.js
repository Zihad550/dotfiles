const test = require("node:test");
const assert = require("node:assert");

const Catalog = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const Directories = require("../../quickshell/.config/quickshell/launcher/lib/directories.js");
const Files = require("../../quickshell/.config/quickshell/launcher/lib/files.js");
const Index = require("../../quickshell/.config/quickshell/launcher/lib/directoryindex.js");

const HOME = "/home/jehad";

function directoryEntries(snapshot, provider) {
    return Catalog.ownedCatalog(snapshot.paths,
        path => Directories.entryFor(path, HOME, provider),
        (path, entry) => Directories.textsFor(entry.name)).entries;
}

function fileEntries(snapshot, provider) {
    return Files.entriesFor(snapshot.paths, HOME, "project", {}, provider);
}

test("Directories and Files derive their paths from one published snapshot", () => {
    const snapshot = {
        paths: [HOME, `${HOME}/dev/project`],
        revision: 3
    };

    assert.deepStrictEqual(directoryEntries(snapshot, {}).map(entry => entry.target.path),
        [HOME, `${HOME}/dev/project`]);
    assert.deepStrictEqual(fileEntries(snapshot, {}).map(entry => entry.target.path),
        [`${HOME}/dev/project`]);
});

test("Providers retain the snapshot boundary until changed paths publish", () => {
    const snapshot = {
        paths: [HOME, `${HOME}/dev/project`],
        revision: 3
    };
    const unchanged = Index.preparePublication(snapshot, Index.serialize(snapshot.paths), HOME);
    const settled = Index.finishAttempt(Index.requestScan(Index.idleSchedule()).schedule,
        snapshot, unchanged, true);

    assert.strictEqual(settled.snapshot, snapshot);

    const changed = Index.preparePublication(snapshot,
        Index.serialize(snapshot.paths.concat(`${HOME}/dev/new-project`)), HOME);
    const published = Index.finishAttempt(Index.requestScan(Index.idleSchedule()).schedule,
        snapshot, changed, true);

    assert.notStrictEqual(published.snapshot, snapshot);
    assert.ok(directoryEntries(published.snapshot, {}).some(entry => entry.target.path.endsWith("new-project")));
    assert.ok(fileEntries(published.snapshot, {}).some(entry => entry.target.path.endsWith("new-project")));
});

// The local+remote merge Directories.qml's `catalog` performs (ticket 91):
// two published snapshots in, one pool out, no key collisions between a
// local and a remote Entry sharing a relative path.
function mergedDirectoryEntries(localSnapshot, remoteSnapshot, host, provider) {
    const items = localSnapshot.paths.map(path => ({ path: path, host: undefined }))
        .concat(remoteSnapshot.paths.map(path => ({ path: path, host: host })));
    return Catalog.ownedCatalog(items,
        item => Directories.entryFor(item.path, HOME, provider, item.host),
        (item, entry) => Directories.textsFor(entry.name)).entries;
}

test("Directories merges the local snapshot with a remote one, keying by host so a shared relative path shows both", () => {
    const local = { paths: [HOME, `${HOME}/dev/project`], revision: 1 };
    const remote = { paths: [`${HOME}/dev/project`, `${HOME}/dev/remote-only`], revision: 1 };

    const entries = mergedDirectoryEntries(local, remote, "arch-devbox", {});
    assert.strictEqual(entries.length, 4, "the shared relative path appears once for local, once for remote -- no collision");

    const keys = entries.map(entry => entry.key);
    assert.deepStrictEqual(new Set(keys).size, keys.length, "every key is distinct");
    assert.ok(keys.includes(`${HOME}/dev/project`), "the local entry keeps its bare-path key");
    assert.ok(keys.includes(`arch-devbox:${HOME}/dev/project`), "the remote entry is keyed by host, distinct from the local one");

    const remoteOnly = entries.find(entry => entry.target.path === `${HOME}/dev/remote-only`);
    assert.strictEqual(remoteOnly.target.host, "arch-devbox");
    assert.strictEqual(remoteOnly.target.mirrored, undefined);
});

test("Directories drops the remote snapshot from the merge entirely when it's empty -- the gated-off and no-host cases", () => {
    const local = { paths: [HOME, `${HOME}/dev/project`], revision: 1 };
    const empty = { paths: [], revision: 0 };

    const entries = mergedDirectoryEntries(local, empty, "arch-devbox", {});
    assert.deepStrictEqual(entries.map(entry => entry.key), [HOME, `${HOME}/dev/project`],
        "byte-identical to the local-only pool -- Directories.qml passes an empty remote snapshot whenever routing is off or no host is set");
});
