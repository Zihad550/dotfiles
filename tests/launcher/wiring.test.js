// The zellij retirement, asserted against source text.
//
//     node --test "tests/launcher/*.test.js"
//
// This is a structure test: the claim is that no live part of the retired
// Provider or its config survives, which behaviour tests cannot establish.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const retiredPaths = [
    "bin/df-zellij-f",
    "quickshell/.config/quickshell/launcher/lib/zellij.js",
    "quickshell/.config/quickshell/launcher/modules/Zellij.qml",
    "tests/launcher/zellij.test.js",
    "zellij"
];

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function filesUnder(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath))
        return [];

    const stat = fs.statSync(absolutePath);
    if (stat.isFile())
        return [relativePath];

    return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap(entry =>
        filesUnder(path.join(relativePath, entry.name)));
}

test("zellij leaves no live Provider, shell, menu, or config surface", () => {
    for (const relativePath of retiredPaths)
        assert.strictEqual(fs.existsSync(path.join(repoRoot, relativePath)), false,
            `${relativePath} is still present`);

    const files = ["README.md", "bin", "docs", "hypr", "quickshell", "scripts", "setup", "tests", "zsh"]
        .flatMap(filesUnder)
        .filter(relativePath => path.resolve(repoRoot, relativePath) !== __filename);
    assert.ok(files.length > 0, "the source scan found no files and is asserting nothing");

    const remaining = files.filter(relativePath =>
        /\bzellij\b/i.test(source(relativePath)));
    assert.deepStrictEqual(remaining, [],
        `zellij-shaped references remain in: ${remaining.join(", ")}`);

    assert.doesNotMatch(source("zsh/.config/zsh/aliasrc"), /\bzj\s*=/,
        "the retired short alias still exposes a dead command");
});

test("webapps is routable from the provider list but absent from the default pool", () => {
    const launcher = source("quickshell/.config/quickshell/launcher/modules/Launcher.qml");
    const pool = launcher.match(/readonly property var pool: \[[^\n]+\]/)[0];
    const routable = launcher.match(/readonly property var rankedRoutable:[^\n]+/)[0];

    assert.doesNotMatch(pool, /\bwebapps\b/);
    assert.match(routable, /\bwebapps\b/);
    assert.match(launcher, /Webapps\s*\{\s*id: webapps/);
});

test("webapps keeps one removal in flight and stays open after Return", () => {
    const webapps = source("quickshell/.config/quickshell/launcher/modules/Webapps.qml");

    assert.match(webapps, /after: "stay"/);
    assert.match(webapps, /if \(remover\.running\)/);
    assert.match(webapps, /Web\.notifyArgv\(root\.removingName, exitCode/);
});
