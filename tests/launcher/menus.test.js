// Tests for the static menus' pure half -- how a declared menu entry becomes a
// command, a corpus and an Entry, and which declarations are rejected before
// anything can be activated.
//
//     node --test "tests/launcher/*.test.js"
//
// The second half of this file is the per-entry audit ticket 08 asks for. The
// four menus carry commands that were written for `sh -c` and are now run
// through execDetached, so "still works" is a different claim per entry: one
// needs a shell for command substitution, three carry a quoted argument that
// must survive as one argv element, four carry a leading `~` that nothing
// expands any more, and one already names uwsm-app itself. Each of those is an
// assertion below rather than a sentence in a comment.
//
// The audit table declares each entry the way its QML data file does, and
// declarationGuard below checks that those declarations are still literally
// present in the QML -- so a command edited in the data file and not here
// fails, rather than leaving the audit quietly describing a previous version.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const Menus = require("../../quickshell/.config/quickshell/launcher/lib/menus.js");
const CatalogCheck = require("./catalog-check.js");

const HOME = "/home/jehad";
const PREFIX = ["uwsm-app", "--"];

const MODULES = path.join(__dirname, "../../quickshell/.config/quickshell/launcher/modules");

// A minimal Provider stand-in. The QML passes its own `root`; nothing in
// menus.js reads anything off it, which is what lets these tests exist.
const provider = { label: "system" };

function menu(entries, name) {
    return { name: name || "system", subtext: "System", entries: entries };
}

// -- Commands -------------------------------------------------------------

test("argvOf runs a declared argv under the launch prefix", () => {
    const command = ["qs", "-c", "lock", "ipc", "call", "lock", "lock"];
    assert.deepStrictEqual(Menus.argvOf({ command: command, scoped: false }, HOME, PREFIX), command);
});

test("argvOf leaves an unscoped entry out of the launch prefix", () => {
    assert.deepStrictEqual(Menus.argvOf({ command: ["uwsm", "stop"], scoped: false }, HOME, PREFIX), ["uwsm", "stop"]);
});

test("argvOf expands a leading tilde and only a leading one", () => {
    const argv = Menus.argvOf({ command: ["~/dotfiles/bin/df-x", "a~b", "~"], scoped: false }, HOME, PREFIX);
    assert.deepStrictEqual(argv, ["/home/jehad/dotfiles/bin/df-x", "a~b", "/home/jehad"]);
});

test("argvOf keeps an argument with spaces and quotes as one element", () => {
    const argv = Menus.argvOf({ command: ["df-x", 'helium --profile-directory="Profile 2"'], scoped: false }, HOME, PREFIX);
    assert.strictEqual(argv.length, 2);
    assert.strictEqual(argv[1], 'helium --profile-directory="Profile 2"');
});

test("argvOf routes a shell declaration through sh -c, verbatim", () => {
    const argv = Menus.argvOf({ shell: "flatpak run X --uri $(pass env/u)" }, HOME, PREFIX);
    assert.deepStrictEqual(argv, ["uwsm-app", "--", "sh", "-c", "flatpak run X --uri $(pass env/u)"]);
});

test("argvOf does not expand a tilde inside a shell declaration", () => {
    // The shell does it, and doing it here too would break a quoted `~`.
    const argv = Menus.argvOf({ shell: "~/bin/x", scoped: false }, HOME, PREFIX);
    assert.deepStrictEqual(argv, ["sh", "-c", "~/bin/x"]);
});

// -- Malformed declarations ------------------------------------------------

// Every one of these is a declaration that would otherwise look fine in the
// list and do nothing when its key is pressed. They are reported when the
// catalog is built -- which is when the config loads -- and the entry is
// dropped rather than offered.

const malformed = [
    ["no name", { command: ["x"] }],
    ["empty name", { name: "", command: ["x"] }],
    ["neither command nor shell", { name: "A" }],
    ["both command and shell", { name: "A", command: ["x"], shell: "x" }],
    ["command as a string", { name: "A", command: "x --y" }],
    ["empty command", { name: "A", command: [] }],
    ["command holding a non-string", { name: "A", command: ["x", 3] }],
    ["empty shell", { name: "A", shell: "" }],
    ["keywords as a string", { name: "A", command: ["x"], keywords: "a b" }]
];

for (const [what, entry] of malformed) {
    test(`catalogOf rejects an entry with ${what}`, () => {
        const built = Menus.catalogOf(menu([entry]), provider, HOME, PREFIX);
        assert.strictEqual(built.entries.length, 0, "the entry should not be offered");
        assert.strictEqual(built.problems.length, 1);
        assert.match(built.problems[0], /system/);
    });
}

test("a malformed entry does not take its neighbours down with it", () => {
    const built = Menus.catalogOf(menu([{ name: "Bad" }, { name: "Lock", command: ["hyprlock"] }]), provider, HOME, PREFIX);
    assert.deepStrictEqual(built.entries.map(e => e.name), ["Lock"]);
    assert.strictEqual(built.problems.length, 1);
});

test("catalogOf reports problems rather than throwing", () => {
    // A throw inside the catalog binding would take the whole merged Entry list
    // down, applications included -- ticket 05's documented failure.
    assert.doesNotThrow(() => Menus.catalogOf(menu([{}]), provider, HOME, PREFIX));
    assert.doesNotThrow(() => Menus.catalogOf({ name: "x" }, provider, HOME, PREFIX));
});

// -- Entries and corpus ----------------------------------------------------

test("an Entry carries the menu as its sub-line and the command it will run", () => {
    const built = Menus.catalogOf(menu([{ name: "Lock", icon: "system-lock-screen", command: ["hyprlock"] }]), provider, HOME, PREFIX);
    const entry = built.entries[0];

    assert.strictEqual(entry.name, "Lock");
    assert.strictEqual(entry.subtext, "System");
    assert.strictEqual(entry.icon, "system-lock-screen");
    assert.strictEqual(entry.provider, provider);
    assert.deepStrictEqual(entry.target.argv, ["uwsm-app", "--", "hyprlock"]);
});

test("an entry declaring no icon falls back to its menu's", () => {
    // Elephant did the same (setup.go:369-372 -- deleted with ticket 19), and
    // the other menu declares no
    // entry icons at all -- so without this, porting it faithfully renders five
    // blank slots and nothing calls that a change.
    const built = Menus.catalogOf({
        name: "other",
        subtext: "Other",
        icon: "applications-other",
        entries: [{ name: "Plain", command: ["x"] }, { name: "Own", icon: "video-display", command: ["x"] }]
    }, provider, HOME, PREFIX);

    assert.deepStrictEqual(built.entries.map(e => e.icon), ["applications-other", "video-display"]);
});

test("an Entry Key is the menu plus the entry text, and is stable", () => {
    // The spec's own words for what a menu Entry's identity is. Frecency
    // accumulates against it, so a key derived from position would credit the
    // wrong entry the moment one is inserted above it.
    const built = Menus.catalogOf(menu([{ name: "Lock", command: ["hyprlock"] }, { name: "Suspend", command: ["systemctl", "suspend"] }]), provider, HOME, PREFIX);
    assert.deepStrictEqual(built.entries.map(e => e.key), ["menu:system:Lock", "menu:system:Suspend"]);
});

test("an entry is findable by its keywords as well as its name", () => {
    const built = Menus.catalogOf(menu([{ name: "Relaunch", keywords: ["logout", "exit"], command: ["uwsm", "stop"] }]), provider, HOME, PREFIX);
    const corpus = M.prepare(built.texts, built.keys, built.owners);

    // The corpus-order guard of ticket 23: an Entry's first text must be its
    // name, or a keyword would quietly earn what only the name may.
    CatalogCheck.nameFirst(built);

    for (const query of ["relaunch", "logout", "exit"]) {
        const found = M.collapse(corpus, M.rank(corpus, query)).indices;
        assert.strictEqual(found.length, 1, `"${query}" should find the entry`);
        assert.strictEqual(built.entries[found[0]].name, "Relaunch");
    }
});

test("an entry matched by two of its own texts is offered once", () => {
    const built = Menus.catalogOf(menu([{ name: "Lock", keywords: ["lock screen"], command: ["hyprlock"] }]), provider, HOME, PREFIX);
    const corpus = M.prepare(built.texts, built.keys, built.owners);
    const found = M.collapse(corpus, M.rank(corpus, "lock")).indices;
    assert.strictEqual(found.length, 1);
});

test("the corpus carries one Entry Key per text, so Frecency reaches every text", () => {
    const built = Menus.catalogOf(menu([{ name: "Lock", keywords: ["lock screen"], command: ["hyprlock"] }]), provider, HOME, PREFIX);
    assert.strictEqual(built.keys.length, built.texts.length);
    assert.ok(built.keys.every(key => key === "menu:system:Lock"));
});

// -- The audit -------------------------------------------------------------

// One row per entry the four menus have today: the declaration as its QML data
// file writes it, the file it lives in, and the argv it must produce.
//
// `elephant` records what the entry's command was in
// elephant/.config/elephant/menus/*.toml, which is what "still works" is
// measured against -- those files are deleted (ticket 19), so it is now a
// historical record rather than a live source. It is not read by the
// assertions -- it is here so that a row and the thing it claims parity with
// sit on the same screen.
//
// `icon` is part of the audit rather than a detail, because losing one is the
// quietest way this port could go wrong: an entry with a missing icon renders
// perfectly and does exactly the right thing, so nothing about running it says
// anything is gone. All five of the other menu's entries inherited theirs from
// the menu, which is what menuIcons below carries.
const menuIcons = {
    "SystemMenu.qml": "",
    "MediaMenu.qml": "",
    "DisplayMenu.qml": "",
    "OtherMenu.qml": "applications-other"
};

const audit = [
    {
        file: "SystemMenu.qml",
        menu: "system",
        elephant: "hyprlock",
        entry: { name: "Lock", icon: "system-lock-screen", command: ["qs", "-c", "lock", "ipc", "call", "lock", "lock"], scoped: false },
        argv: ["qs", "-c", "lock", "ipc", "call", "lock", "lock"]
    },
    {
        file: "SystemMenu.qml",
        menu: "system",
        elephant: "systemctl suspend",
        entry: { name: "Suspend", icon: "system-suspend", command: ["systemctl", "suspend"], scoped: false },
        argv: ["systemctl", "suspend"]
    },
    {
        file: "SystemMenu.qml",
        menu: "system",
        elephant: "systemctl reboot",
        entry: { name: "Restart", icon: "system-reboot", command: ["systemctl", "reboot"], scoped: false },
        argv: ["systemctl", "reboot"]
    },
    {
        file: "SystemMenu.qml",
        menu: "system",
        elephant: "systemctl poweroff",
        entry: { name: "Shutdown", icon: "system-shutdown", command: ["systemctl", "poweroff"], scoped: false },
        argv: ["systemctl", "poweroff"]
    },
    {
        file: "SystemMenu.qml",
        menu: "system",
        elephant: "uwsm stop",
        entry: { name: "Relaunch", icon: "system-log-out", command: ["uwsm", "stop"], scoped: false },
        argv: ["uwsm", "stop"]
    },
    {
        file: "MediaMenu.qml",
        menu: "media",
        elephant: "", // Empty, and that is the whole finding -- see below.
        entry: { name: "Multi media", icon: "multimedia-volume-control", command: ["pavucontrol"] },
        argv: ["uwsm-app", "--", "pavucontrol"]
    },
    {
        file: "DisplayMenu.qml",
        menu: "display",
        elephant: "~/dotfiles/bin/df-hypr-display-rotate toggle",
        entry: { name: "HDMI-A-1: Toggle orientation", icon: "object-rotate-right", command: ["~/dotfiles/bin/df-hypr-display-rotate", "toggle"], scoped: false },
        argv: ["/home/jehad/dotfiles/bin/df-hypr-display-rotate", "toggle"]
    },
    {
        file: "DisplayMenu.qml",
        menu: "display",
        elephant: "~/dotfiles/bin/df-hypr-display-rotate horizontal",
        entry: { name: "HDMI-A-1: Horizontal", icon: "video-display", command: ["~/dotfiles/bin/df-hypr-display-rotate", "horizontal"], scoped: false },
        argv: ["/home/jehad/dotfiles/bin/df-hypr-display-rotate", "horizontal"]
    },
    {
        file: "DisplayMenu.qml",
        menu: "display",
        elephant: "~/dotfiles/bin/df-hypr-display-rotate vertical",
        entry: { name: "HDMI-A-1: Vertical", icon: "video-display", command: ["~/dotfiles/bin/df-hypr-display-rotate", "vertical"], scoped: false },
        argv: ["/home/jehad/dotfiles/bin/df-hypr-display-rotate", "vertical"]
    },
    {
        file: "DisplayMenu.qml",
        menu: "display",
        elephant: "~/dotfiles/bin/df-hypr-display-layout apply",
        entry: { name: "Layout: Restore saved", icon: "video-display", command: ["~/dotfiles/bin/df-hypr-display-layout", "apply"], scoped: false },
        argv: ["/home/jehad/dotfiles/bin/df-hypr-display-layout", "apply"]
    },
    {
        file: "OtherMenu.qml",
        menu: "other",
        // Already named uwsm-app itself, because elephant's `sh -c` gave it no
        // prefix. Scoping is the Provider's job here, so the data must not.
        elephant: "uwsm-app -- flatpak run app.zen_browser.zen -P 008",
        entry: { name: "Zen Browser profile 008", command: ["flatpak", "run", "app.zen_browser.zen", "-P", "008"] },
        argv: ["uwsm-app", "--", "flatpak", "run", "app.zen_browser.zen", "-P", "008"]
    },
    {
        file: "OtherMenu.qml",
        menu: "other",
        elephant: "",
        entry: { name: "Zen Browser profile webdev", command: ["flatpak", "run", "app.zen_browser.zen", "-P", "webdev"] },
        argv: ["uwsm-app", "--", "flatpak", "run", "app.zen_browser.zen", "-P", "webdev"]
    },
    {
        file: "OtherMenu.qml",
        menu: "other",
        // The one command substitution in the four menus.
        elephant: "flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)",
        entry: { name: "MongoDB Compass env", shell: "flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)" },
        argv: ["uwsm-app", "--", "sh", "-c", "flatpak run com.mongodb.Compass --trustedConnectionString $(pass env/mongodb_uri)"]
    },
    {
        file: "OtherMenu.qml",
        menu: "other",
        elephant: "~/dotfiles/bin/df-launch-special-app 'helium-work' 'helium-browser --profile-directory=\"Profile 2\"' 'work'",
        entry: {
            name: "Helium - work profile",
            command: ["~/dotfiles/bin/df-launch-special-workspace", "helium", "work", "helium-browser", "--profile-directory=Profile 2"],
            scoped: false
        },
        argv: ["/home/jehad/dotfiles/bin/df-launch-special-workspace", "helium", "work", "helium-browser", "--profile-directory=Profile 2"]
    }
];

for (const row of audit) {
    test(`audit: ${row.menu} / ${row.entry.name}`, () => {
        assert.deepStrictEqual(Menus.argvOf(row.entry, HOME, PREFIX), row.argv);
    });
}

test("audit: every one of the fourteen entries renders an icon", () => {
    for (const row of audit) {
        const built = Menus.catalogOf({
            name: row.menu,
            subtext: "x",
            icon: menuIcons[row.file],
            entries: [row.entry]
        }, provider, HOME, PREFIX);

        const expected = row.entry.icon || menuIcons[row.file];
        assert.notStrictEqual(expected, "", `${row.entry.name} would render no icon`);
        assert.strictEqual(built.entries[0].icon, expected);
    }
});

test("audit: no entry carries uwsm-app in its own declaration", () => {
    // Scoping is the Provider's, so an entry naming it would be scoped twice --
    // `uwsm-app -- uwsm-app -- flatpak run …`, which is what the zen entry was
    // ported from.
    for (const row of audit)
        assert.ok(!JSON.stringify(row.entry).includes("uwsm-app"), `${row.entry.name} names uwsm-app`);
});

test("audit: only the entries needing a shell get one", () => {
    const shells = audit.filter(row => row.entry.shell).map(row => row.entry.name);
    assert.deepStrictEqual(shells, ["MongoDB Compass env"]);
});

test("audit: every declared argv command survives without a shell", () => {
    // The constructs execDetached does not provide. A `~` is handled by
    // argvOf and is checked per row above; these are the ones nothing handles,
    // so an entry needing them must be a shell declaration instead.
    for (const row of audit) {
        if (row.entry.shell)
            continue;
        for (const part of row.entry.command)
            assert.ok(!/[$`*]|&&|\|\||;/.test(part), `${row.entry.name} relies on the shell for: ${part}`);
    }
});

test("audit: the table describes the QML the Launcher actually loads", () => {
    // A substring check rather than a parse: cheap, and enough to fail when a
    // command is edited in the data file without the audit following it.
    for (const row of audit) {
        const source = fs.readFileSync(path.join(MODULES, row.file), "utf8");
        assert.ok(source.includes(`name: ${JSON.stringify(row.entry.name)}`), `${row.file} no longer declares ${row.entry.name}`);

        const icon = row.entry.icon ? `icon: ${JSON.stringify(row.entry.icon)}` : `icon: ${JSON.stringify(menuIcons[row.file])}`;
        assert.ok(source.includes(icon), `${row.file}: the icon for ${row.entry.name} has drifted from the audit`);

        if (row.entry.shell) {
            assert.ok(source.includes(JSON.stringify(row.entry.shell)), `${row.file}: shell command for ${row.entry.name} has drifted from the audit`);
            continue;
        }

        for (const part of row.entry.command)
            assert.ok(source.includes(JSON.stringify(part)), `${row.file}: ${row.entry.name} no longer runs ${part}`);
    }
});

test("audit: the four menus declare exactly the entries the table covers", () => {
    const files = ["SystemMenu.qml", "MediaMenu.qml", "DisplayMenu.qml", "OtherMenu.qml"];
    for (const file of files) {
        const source = fs.readFileSync(path.join(MODULES, file), "utf8");
        const declared = (source.match(/^\s+name: "/gm) || []).length;
        const covered = audit.filter(row => row.file === file).length;
        assert.strictEqual(declared, covered, `${file} declares ${declared} entries, the audit covers ${covered}`);
    }
});
