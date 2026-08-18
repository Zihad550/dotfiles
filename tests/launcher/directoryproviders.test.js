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
