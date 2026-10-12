const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname,
    "../../quickshell/.config/quickshell/dotfiles/modules/Workspaces.qml"), "utf8");
const binding = source.match(/readonly property var normals: (.+)/)[1];

function numberedWorkspaces(values, monitor) {
    return Array.from(vm.runInNewContext(binding, {
        Hyprland: { workspaces: { values } },
        root: {
            monitor,
            isSpecial: workspace => workspace.name === "special" || workspace.name.startsWith("special:"),
        },
    }));
}

for (const ids of [[2, 3, 4, 5, 10, 1], [3, 2, 4, 5, 10, 1]]) {
    test(`numbered workspaces sort the model order ${ids.join(", ")}`, () => {
        const monitor = {};
        const values = ids.map(id => ({ id, name: `${id}-zed`, monitor }));
        const original = values.slice();

        const result = numberedWorkspaces(values, monitor);

        assert.deepEqual(result.map(workspace => workspace.id), [1, 2, 3, 4, 5, 10]);
        assert.equal(result[0], values[5]);
        assert.deepEqual(values, original);
    });
}

test("ordering preserves the monitor and special-workspace filters", () => {
    const monitor = {};
    const otherMonitor = {};
    const values = [
        { id: 10, name: "10", monitor },
        { id: -1, name: "special:herdr-work", monitor },
        { id: 1, name: "1", monitor: otherMonitor },
        { id: 2, name: "2", monitor },
        { id: -2, name: "special", monitor },
    ];

    assert.deepEqual(numberedWorkspaces(values, monitor).map(workspace => workspace.id), [2, 10]);
    assert.deepEqual(numberedWorkspaces(values, null).map(workspace => workspace.id), [1, 2, 10]);
});
