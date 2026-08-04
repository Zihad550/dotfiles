// Tests for the systemd Provider's pure half -- parsing `systemctl list-units`
// output, Entries that carry their scope, and the privilege handling in the
// restart argv.
//
//     node --test "tests/launcher/*.test.js"
//
// The restart argv is the ticket's own named risk: a system unit must be
// authorized and a user unit must not, and an Entry that lost which scope it
// came from would make that difference invisible until the key was pressed.

const test = require("node:test");
const assert = require("node:assert");

const M = require("../../quickshell/.config/quickshell/launcher/lib/matching.js");
const C = require("../../quickshell/.config/quickshell/launcher/lib/catalog.js");
const S = require("../../quickshell/.config/quickshell/launcher/lib/systemd.js");
const CatalogCheck = require("./catalog-check.js");

// One scope's catalog, composed exactly as Systemd.qml composes each of its
// two scopes -- keylessCatalog handed this Provider's own entryFor (the
// scope bound in, the same way the QML binds it) and textsFor.
const catalogOf = (units, scope, provider) => C.keylessCatalog(units,
    unit => S.entryFor(unit, scope, provider), S.textsFor);

const LISTING_SAMPLE = [
    "UNIT LOAD ACTIVE SUB DESCRIPTION",
    "ssh.service loaded active running OpenBSD Secure Shell server",
    "docker.service loaded active running Docker Application Container Engine",
    "systemd-logind.service loaded active running Login Service",
    ""
].join("\n");

test("a list-units line becomes a unit with its description", () => {
    assert.deepStrictEqual(S.parseLine("ssh.service loaded active running OpenBSD Secure Shell server"), {
        unit: "ssh.service",
        description: "OpenBSD Secure Shell server"
    });
});

test("a padded line parses rather than being dropped", () => {
    assert.strictEqual(S.parseLine("  ssh.service loaded active running OpenBSD Secure Shell server").unit,
        "ssh.service", "the same leading-padding defense the processes parser needed");
});

test("the header and non-service lines are not units", () => {
    assert.strictEqual(S.parseLine("UNIT LOAD ACTIVE SUB DESCRIPTION"), null);
    assert.strictEqual(S.parseLine(""), null);
    assert.strictEqual(S.parseLine("dev-tty2.device loaded active active"), null, "a device is not a service");
});

test("the whole listing parses", () => {
    const units = S.parseListing(LISTING_SAMPLE);
    assert.strictEqual(units.length, 3);
    assert.strictEqual(units[1].unit, "docker.service");
});

test("an entry carries its scope in the sub-line and on the target", () => {
    const built = catalogOf(S.parseListing(LISTING_SAMPLE), "system", null);
    assert.strictEqual(built.entries[0].name, "ssh.service");
    assert.strictEqual(built.entries[0].subtext, "system · OpenBSD Secure Shell server");
    assert.deepStrictEqual(built.entries[0].target, { unit: "ssh.service", scope: "system" });
    assert.strictEqual(built.entries[0].key, undefined, "no Entry Key -- units are not a habit to promote");
});

test("a unit is found by its name, its stem, and its description", () => {
    const built = catalogOf(S.parseListing(LISTING_SAMPLE), "system", null);
    const corpus = M.prepare(built.texts, null, built.owners);

    // The corpus-order guard of ticket 23: each Entry's first text must be
    // its name, or an alias would quietly earn what only a name may.
    CatalogCheck.nameFirst(built);

    const names = query => M.collapse(corpus, M.rank(corpus, query)).indices.map(index => built.entries[index].name);
    assert.deepStrictEqual(names("ssh"), ["ssh.service"], "the stem is matchable");
    assert.deepStrictEqual(names("docker engine"), ["docker.service"], "the description is matchable");
});

test("the user and system scopes restart differently", () => {
    assert.deepStrictEqual(S.restartArgv("user", "ssh.service"), ["systemctl", "--user", "restart", "ssh.service"]);
    assert.deepStrictEqual(S.restartArgv("system", "ssh.service"), ["systemctl", "restart", "ssh.service"],
        "a system unit is authorized by polkit, which prompts without a terminal -- deliberately not the script's sudo, which cannot");
});

test("a successful restart notifies plainly", () => {
    assert.deepStrictEqual(S.notifyArgv("ssh.service", 0, ""), [
        "notify-send", "Service restarted", "ssh.service"
    ]);
    assert.deepStrictEqual(S.notifyArgv("ssh.service", 0, "some warning"), [
        "notify-send", "Service restarted", "ssh.service"
    ], "exit 0 is the whole signal -- systemctl exits 0 only when the unit is back up");
});

test("a failed restart is critical and carries systemctl's own reason", () => {
    // The dismissed-dialog case, which is the one a user will actually hit.
    assert.deepStrictEqual(
        S.notifyArgv("ssh.service", 1, "Failed to restart ssh.service: Interactive authentication required.\n"), [
            "notify-send", "--urgency=critical", "Restart failed: ssh.service",
            "Failed to restart ssh.service: Interactive authentication required."
        ]);
});

test("a failure with nothing on stderr still says something", () => {
    assert.deepStrictEqual(S.notifyArgv("ssh.service", 4, ""), [
        "notify-send", "--urgency=critical", "Restart failed: ssh.service", "exit 4"
    ], "a bare code beats an empty notification body");
    assert.deepStrictEqual(S.notifyArgv("ssh.service", 4, "   \n  "), [
        "notify-send", "--urgency=critical", "Restart failed: ssh.service", "exit 4"
    ], "whitespace-only stderr is nothing");
    assert.deepStrictEqual(S.notifyArgv("ssh.service", 4, undefined), [
        "notify-send", "--urgency=critical", "Restart failed: ssh.service", "exit 4"
    ], "an absent collector reads as undefined, not as a string");
});

test("the listing commands differ only by --user", () => {
    assert.deepStrictEqual(S.listCommand("user"), ["systemctl", "--user", "list-units", "--type=service", "--state=running", "--no-legend", "--no-pager"]);
    assert.deepStrictEqual(S.listCommand("system"), ["systemctl", "list-units", "--type=service", "--state=running", "--no-legend", "--no-pager"]);
});
