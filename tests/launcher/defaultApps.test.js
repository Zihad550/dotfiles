// Tests for the pure half of the Default Apps Provider.
//
//     node --test tests/launcher/defaultApps.test.js

const test = require("node:test");
const assert = require("node:assert");

const D = require("../../quickshell/.config/quickshell/launcher/lib/defaultapps.js");

const listing = {
    roles: [
        {
            key: "browser",
            name: "System Browser",
            description: "Open web links and SUPER+B",
            selection: "zen",
            resolved: "zen",
            stale: false,
            candidate: { key: "zen", name: "Zen Browser" },
            candidates: [{ key: "zen", name: "Zen Browser", icon: "zen-icon" }]
        },
        {
            key: "file-manager",
            name: "Preferred File Manager",
            description: "Browse a directory with SUPER+F",
            selection: "missing",
            resolved: "nautilus",
            stale: true,
            candidate: { key: "nautilus", name: "Nautilus" },
            candidates: [{ key: "nautilus", name: "Nautilus" }, { key: "yazi", name: "Yazi" }]
        }
    ]
};

test("malformed list output becomes an empty listing", () => {
    assert.deepStrictEqual(D.parseListing("not json"), { roles: [] });
    assert.deepStrictEqual(D.parseListing(undefined), { roles: [] });
});

test("role entries show the selected candidate and preserve the role key", () => {
    const provider = {};
    const entry = D.roleEntry(listing.roles[0], provider);

    assert.strictEqual(entry.name, "System Browser");
    assert.strictEqual(entry.subtext, "Current: Zen Browser");
    assert.strictEqual(entry.key, "default-app-role:browser");
    assert.strictEqual(entry.provider, provider);
    assert.deepStrictEqual(entry.target, { role: "browser" });
});

test("stale role entries say which saved selection disappeared", () => {
    assert.strictEqual(D.roleSubtext(listing.roles[1]), "Stale selection: missing");
});

test("candidate entries mark the resolved fallback without changing its key", () => {
    const provider = {};
    const candidates = D.candidatesFor(listing.roles[1], provider);

    assert.deepStrictEqual(candidates.map(entry => entry.name), ["Nautilus", "Yazi"]);
    assert.strictEqual(candidates[0].subtext, "Current");
    assert.strictEqual(candidates[1].subtext, "");
    assert.deepStrictEqual(candidates[1].target, { role: "file-manager", candidate: "yazi" });
});

test("the provider action calls the shared setter by absolute path", () => {
    assert.deepStrictEqual(D.actionArgv("/home/jehad", "browser", "chromium"), [
        "/home/jehad/dotfiles/bin/df-default-app", "set", "browser", "chromium"
    ]);
    assert.deepStrictEqual(D.listArgv("/home/jehad"), [
        "/home/jehad/dotfiles/bin/df-default-app", "list"
    ]);
});
