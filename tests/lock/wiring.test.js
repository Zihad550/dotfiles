// The Session Lock's wiring, asserted against source text.
//
//     node --test "tests/lock/*.test.js"
//
// This seam is brittle and is used only where the subject genuinely is
// structure: a PAM service name that has to match in two files, a probe that
// must never take a real lock, and symlinks that would rot silently. The lock's
// behaviour is tested in lockstate.test.js, not here.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function source(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const lockRoot = "quickshell/.config/quickshell/lock";
const probeRoot = "quickshell/.config/quickshell/lock-probe";

test("the surface and the setup script name the same PAM service", () => {
    assert.match(source(`${lockRoot}/LockSurface.qml`), /config:\s*"df-lock"/);
    assert.match(source("setup/arch-hyprland/setup-packages/setup-lock-pam"), /\/etc\/pam\.d\/df-lock/,
        "a service name that disagrees is a lock that rejects every correct password");
});

test("the lock's lockout policy is its own, tallied separately from sudo's", () => {
    const setup = source("setup/arch-hyprland/setup-packages/setup-lock-pam");

    assert.match(setup, /FAILLOCK_DIR=(?!\/run\/faillock\b)\S+/,
        "sharing /run/faillock is what lets a mistyped lock password eat sudo's tries");
    assert.match(setup, /pam_faillock\.so preauth[^\n]*deny=\d+[^\n]*dir=\$FAILLOCK_DIR/);
    assert.match(setup, /pam_faillock\.so authfail[^\n]*deny=\d+[^\n]*dir=\$FAILLOCK_DIR/);
    assert.match(setup, /install -d[^\n]*"\$FAILLOCK_DIR"/,
        "pam_faillock refuses to authenticate at all when its tally directory is missing");
    assert.match(setup, /install -o "\$name"[^\n]*"\$FAILLOCK_DIR\/\$name"/,
        "the lock authenticates as the user, so a root-owned tally file fails the authsucc "
        + "line on a correct password -- and every account needs one, not just the one "
        + "that happened to run setup");
});

// The service file the script writes, without the script's own prose about it.
function pamService() {
    const setup = source("setup/arch-hyprland/setup-packages/setup-lock-pam");
    const body = setup.match(/<<PAM\n([\s\S]*?)\nPAM\n/);
    assert.ok(body, "the script no longer writes the service as a PAM heredoc");
    return body[1];
}

test("unlocking does not re-run the login-time account policy", () => {
    const setup = pamService();

    assert.doesNotMatch(setup, /include\s+system-local-login/,
        "that stack pulls in pam_nologin, which rejects a correct password for as long as "
        + "/run/nologin exists -- systemd writes it during a scheduled shutdown");
    assert.match(setup, /^account\s+required\s+pam_unix\.so$/m);
    assert.doesNotMatch(setup, /nullok/,
        "the field refuses to submit an empty password, so nullok can only ever be the thing "
        + "that lets one through");
});

test("the field keeps focus while PAM is in flight", () => {
    const surface = source(`${lockRoot}/LockSurface.qml`);

    assert.match(surface, /readOnly:\s*!LockState\.acceptsInput/);
    assert.doesNotMatch(surface, /enabled:[^\n]*LockState\.acceptsInput/,
        "a disabled TextInput drops active focus, and with nothing focused the probe's Escape "
        + "never arrives -- a hung PAM would hold the keyboard with no way out");
});

test("the sudo-tries setup no longer claims to cover the locker", () => {
    const sudoTries = source("setup/arch-hyprland/setup-packages/setup-sudo-tries");

    assert.doesNotMatch(sudoTries, /hyprlock/i);
    assert.match(sudoTries, /does\s*\n?#?\s*NOT cover the Session Lock/i);
});

test("the lock reads the active theme's Quickshell data and nothing lock-specific", () => {
    const theme = source(`${lockRoot}/Theme.qml`);

    const paths = theme.match(/path:\s*[^\n]+/g) || [];
    assert.deepStrictEqual(paths.length, 1, "the theme reads exactly one file");
    assert.match(paths[0], /\.config\/theme\/quickshell\.json/,
        "the generated per-theme hyprlock.conf is what this replaces -- reading one back would "
        + "reinstate the pipeline the lock exists to delete");
    assert.match(theme, /readonly property string fontFamily:/,
        "df-font-set rewrites this line in every Quickshell config's Theme.qml");
});

test("df-font-set patches every Quickshell Theme.qml, not just the bar's", () => {
    const fontSet = source("bin/df-font-set");

    assert.match(fontSet, /quickshell\/\.config\/quickshell\/\*\/Theme\.qml/);
    assert.match(fontSet, /! -L \$theme/,
        "sed -i would turn the probe's symlinked Theme.qml into a regular copy");
});

test("the probe takes no session lock", () => {
    const probe = source(`${probeRoot}/shell.qml`);

    assert.doesNotMatch(probe, /WlSessionLock/,
        "the probe exists so the lock can be iterated on with no possibility of lockout");
    assert.match(probe, /PanelWindow/);
});

test("the probe's symlinks still point at the lock's files", () => {
    ["LockSurface.qml", "Theme.qml", "lib"].forEach(entry => {
        const link = path.join(repoRoot, probeRoot, entry);
        assert.strictEqual(fs.lstatSync(link).isSymbolicLink(), true,
            `${entry} must stay a symlink -- a copy is a surface that can drift from the lock's`);
        assert.strictEqual(fs.readlinkSync(link), `../lock/${entry}`);
        assert.ok(fs.existsSync(link), `${entry} points at nothing`);
    });
});

test("every top-level entry of the lock config is reachable from the probe", () => {
    const lockEntries = fs.readdirSync(path.join(repoRoot, lockRoot))
        .filter(entry => entry !== "shell.qml");
    const probeEntries = fs.readdirSync(path.join(repoRoot, probeRoot));

    lockEntries.forEach(entry => {
        assert.ok(probeEntries.includes(entry),
            `${entry} was added to the lock but not symlinked into the probe, which now fails to build`);
    });
});

test("the lock starts as its own instance, and cannot be run as a scratch config", () => {
    assert.match(source("hypr/.config/hypr/lua/autostart.lua"), /quickshell -c lock -n/);
    assert.match(source("bin/df-qs-test"), /dotfiles \| launcher \| lock\)/,
        "a foreground lock instance dies with its terminal, which is a dropped lock");
    assert.match(source("bin/df-qs-restart"), /dotfiles \| launcher \| lock/);
});
