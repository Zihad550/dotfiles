const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const path = require("node:path");

const monitorsConfig = path.resolve("hypr/.config/hypr/lua/monitors.lua");

function workspaceRulesFor(chassisType) {
    const harness = String.raw`
local config = os.getenv("TEST_MONITORS_CONFIG")
local chassis = os.getenv("TEST_CHASSIS_TYPE")
local real_open = io.open

io.open = function(path, mode)
    if path == "/sys/class/dmi/id/chassis_type" then
        return {
            read = function() return chassis end,
            close = function() end,
        }
    end
    if string.find(path, "internal-monitor-clamshell.lua", 1, true) then
        return nil
    end
    return real_open(path, mode)
end

hl = {
    monitor = function() end,
    workspace_rule = function(rule)
        print(table.concat({
            rule.workspace,
            rule.monitor or "",
            tostring(rule.default == true),
        }, "|"))
    end,
}

dofile(config)
`;
    const result = childProcess.spawnSync("lua", ["-e", harness], {
        encoding: "utf8",
        env: {
            ...process.env,
            TEST_MONITORS_CONFIG: monitorsConfig,
            TEST_CHASSIS_TYPE: String(chassisType),
        },
    });

    assert.strictEqual(result.status, 0, result.stderr);
    return result.stdout.trim().split("\n").filter(Boolean).map(line => {
        const [workspace, monitor, isDefault] = line.split("|");
        return { workspace, monitor, default: isDefault === "true" };
    });
}

test("a desktop with only DP-1 starts on workspace 1", () => {
    const rules = workspaceRulesFor(3);
    const dpRules = rules.filter(rule => rule.monitor === "DP-1");

    assert.deepStrictEqual(dpRules.map(rule => rule.workspace),
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    assert.deepStrictEqual(dpRules.filter(rule => rule.default), [{
        workspace: "1",
        monitor: "DP-1",
        default: true,
    }]);
});

test("a laptop keeps its split workspace assignment", () => {
    const rules = workspaceRulesFor(9);

    assert.deepStrictEqual(rules.filter(rule => rule.monitor === "eDP-1"), [
        { workspace: "1", monitor: "eDP-1", default: true },
        { workspace: "2", monitor: "eDP-1", default: false },
    ]);
    assert.deepStrictEqual(rules.filter(rule => rule.monitor === "HDMI-A-1"), [
        { workspace: "3", monitor: "HDMI-A-1", default: true },
        { workspace: "4", monitor: "HDMI-A-1", default: false },
        { workspace: "5", monitor: "HDMI-A-1", default: false },
        { workspace: "6", monitor: "HDMI-A-1", default: false },
        { workspace: "7", monitor: "HDMI-A-1", default: false },
        { workspace: "8", monitor: "HDMI-A-1", default: false },
        { workspace: "9", monitor: "HDMI-A-1", default: false },
        { workspace: "10", monitor: "HDMI-A-1", default: false },
    ]);
});
