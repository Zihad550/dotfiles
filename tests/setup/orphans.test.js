// The live dotfile and theme inventories, asserted against source structure.
//
//     node --test tests/setup/orphans.test.js
//
// These checks inspect repository paths and source text. Stowing and theme
// switching need a host session, but missing wiring does not.

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function liveStowScriptLines() {
    const stowRoot = path.join(repoRoot, "scripts/stow");

    return fs.readdirSync(stowRoot, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .flatMap(entry => fs.readFileSync(path.join(stowRoot, entry.name), "utf8").split("\n"))
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"));
}

function rootDotfilePackages() {
    return [...new Set(trackedFiles()
        .map(file => file.split("/"))
        .filter(([root, firstSegment]) => root && !root.startsWith(".")
            && firstSegment?.startsWith("."))
        .map(([root]) => root))]
        .sort();
}

function trackedFiles() {
    // Read the index so untracked experiments cannot change the inventory.
    return childProcess.execFileSync("git", ["ls-files", "-z"], {
        cwd: repoRoot,
        encoding: "utf8",
    }).split("\0").filter(Boolean);
}

function lineMentionsPackage(line, packageName) {
    const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[/\\s"'])${escapedName}(?:[/\\s"']|$)`).test(line);
}

test("every root dotfile package is named by live stow wiring", () => {
    const packages = rootDotfilePackages();
    const stowLines = liveStowScriptLines();
    const unstowed = packages.filter(packageName =>
        !stowLines.some(line => lineMentionsPackage(line, packageName)));

    assert.ok(packages.length > 0, "dotfile package scan is now asserting nothing");
    assert.deepStrictEqual(unstowed, [],
        `these dotfile packages are not wired in scripts/stow: ${unstowed.join(", ")}`);
});

test("every theme template has a live consumer", () => {
    const templateRoot = path.join(repoRoot, "themes/templates");
    const templates = fs.readdirSync(templateRoot)
        .filter(name => name.endsWith(".tpl"))
        .sort();
    const consumerRoots = ["bin", "quickshell", "zsh", "hypr", "ghostty"];
    const consumerText = consumerRoots.flatMap(root => filesUnder(path.join(repoRoot, root)))
        .map(file => fs.readFileSync(file, "utf8"))
        .join("\n");
    const orphaned = templates.filter(template => {
        const renderedName = template.slice(0, -4);
        return !consumerText.includes(renderedName);
    });

    assert.ok(templates.length > 0, "theme template scan is now asserting nothing");
    assert.deepStrictEqual(orphaned, [],
        `these theme templates have no consumer: ${orphaned.join(", ")}`);
});

function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(absolutePath);
        if (entry.isFile()) return [absolutePath];
        if (entry.isSymbolicLink()) {
            try {
                return fs.statSync(absolutePath).isFile() ? [absolutePath] : [];
            } catch {
                return [];
            }
        }
        return [];
    });
}
