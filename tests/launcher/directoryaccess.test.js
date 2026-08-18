const test = require("node:test");
const assert = require("node:assert");

const Access = require("../../quickshell/.config/quickshell/launcher/lib/directoryaccess.js");

const directories = { label: "directories" };
const files = { label: "files" };
const applications = { label: "applications" };

function transition(previous, visible, activePool) {
    return Access.transition(previous, {
        visible,
        activePool,
        affectedProviders: [directories, files]
    });
}

test("Directories becoming active requests Directory Index access", () => {
    assert.deepStrictEqual(transition(null, true, [directories]), {
        provider: directories,
        access: true
    });
});

test("Files becoming active requests Directory Index access", () => {
    assert.deepStrictEqual(transition(null, true, [files]), {
        provider: files,
        access: true
    });
});

test("switching directly between Directories and Files requests another access", () => {
    assert.deepStrictEqual(transition(directories, true, [files]), {
        provider: files,
        access: true
    });
    assert.deepStrictEqual(transition(files, true, [directories]), {
        provider: directories,
        access: true
    });
});

test("entering or leaving a Chooser in the active Provider does not request another access", () => {
    assert.deepStrictEqual(transition(directories, true, [directories]), {
        provider: directories,
        access: false
    });
    assert.deepStrictEqual(transition(files, true, [files]), {
        provider: files,
        access: false
    });
});

test("unrelated Providers and closed Launcher sessions do not request access", () => {
    assert.deepStrictEqual(transition(null, true, [applications]), {
        provider: null,
        access: false
    });
    assert.deepStrictEqual(transition(directories, false, [directories]), {
        provider: null,
        access: false
    });
});
