// Tests for the webapps Provider's pure half: identifying webapp Desktop
// Entries, displaying their URL, and the exact removal/notification argv.
//
//     node --test "tests/launcher/*.test.js"

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const W = require("../../quickshell/.config/quickshell/launcher/lib/webapps.js");
const CatalogCheck = require("./catalog-check.js");

const HOME = "/home/jehad";

function application(name, id, command, icon) {
    return { name, id, command, icon: icon || "applications-internet" };
}

test("the webapp predicate accepts each repo launcher, including absolute paths", () => {
    assert.ok(W.isWebapp(application("ChatGPT", "ChatGPT", [
        `${HOME}/dotfiles/bin/df-launch-webapp`, "https://chatgpt.com/"
    ])));
    assert.ok(W.isWebapp(application("Focused", "Focused", [
        `${HOME}/dotfiles/bin/df-launch-or-focus-webapp`, "ChatGPT", "https://chatgpt.com/"
    ])));
    assert.ok(W.isWebapp(application("Special", "Special", [
        `${HOME}/dotfiles/bin/df-launch-special-webapp`, "chatgpt", "https://chatgpt.com/", "special"
    ])));
});

test("packaged applications are not Webapps", () => {
    assert.strictEqual(W.isWebapp(application("Firefox", "firefox", ["/usr/bin/firefox", "%U"])), false);
    assert.strictEqual(W.isWebapp(application("Lookalike", "lookalike", ["/usr/bin/tool", "df-launch-webapp"])), false);
    assert.strictEqual(W.isWebapp(null), false);
});

test("URL extraction ignores an absolute launcher path and supports launcher variants", () => {
    assert.strictEqual(W.urlFor(application("ChatGPT", "ChatGPT", [
        `${HOME}/dotfiles/bin/df-launch-webapp`, "https://chatgpt.com/"
    ])), "https://chatgpt.com/");
    assert.strictEqual(W.urlFor(application("Focused", "Focused", [
        `${HOME}/dotfiles/bin/df-launch-or-focus-webapp`, "ChatGPT", "https://chatgpt.com/"
    ])), "https://chatgpt.com/");
    assert.strictEqual(W.urlFor(application("Special", "Special", [
        `${HOME}/dotfiles/bin/df-launch-special-webapp`, "chatgpt", "https://chatgpt.com/", "special"
    ])), "https://chatgpt.com/");
});

test("an Entry carries the Desktop Entry name, URL, icon, and no Frecency key", () => {
    const app = application("Spec Check", "Spec Check", [
        `${HOME}/dotfiles/bin/df-launch-webapp`, "https://example.com"
    ], "spec-check");
    const provider = { label: "webapps" };
    const entry = W.entryFor(app, provider);

    assert.deepStrictEqual(entry, {
        name: "Spec Check",
        subtext: "https://example.com",
        icon: "spec-check",
        provider,
        target: app
    });
});

test("catalogOf excludes ordinary applications and keeps one keyless row per Webapp", () => {
    const apps = [
        application("Firefox", "firefox", ["/usr/bin/firefox"]),
        application("Spec Check", "Spec Check", [
            `${HOME}/dotfiles/bin/df-launch-webapp`, "https://example.com"
        ]),
        application("ChatGPT", "ChatGPT", [
            `${HOME}/dotfiles/bin/df-launch-webapp`, "https://chatgpt.com/"
        ])
    ];
    const built = W.catalogOf(apps, null);

    assert.deepStrictEqual(built.entries.map(entry => entry.name), ["Spec Check", "ChatGPT"]);
    assert.deepStrictEqual(built.texts, ["Spec Check", "ChatGPT"]);
    assert.ok(built.entries.every(entry => entry.key === undefined));

    const corpus = M.prepare(built.texts, null);
    CatalogCheck.nameFirst(built);
    assert.deepStrictEqual(M.collapse(corpus, M.rank(corpus, "ChatGPT")).indices, [1]);
});

test("removal addresses the Desktop Entry basename and never forgets the manifest", () => {
    assert.deepStrictEqual(W.removeArgv(HOME, "Spec Check "), [
        `${HOME}/dotfiles/bin/df-webapp-remove`, "Spec Check ", "--force"
    ]);
});

test("successful removal is silent, while failure preserves stderr", () => {
    assert.strictEqual(W.notifyArgv("Spec Check", 0, ""), null);
    assert.deepStrictEqual(W.notifyArgv("Spec Check", 1, "Error: no desktop entry\n"), [
        "notify-send", "--urgency=critical", "Remove failed: Spec Check",
        "Error: no desktop entry"
    ]);
    assert.deepStrictEqual(W.notifyArgv("Spec Check", 1, ""), [
        "notify-send", "--urgency=critical", "Remove failed: Spec Check", "exit 1"
    ]);
});
