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

test("the conversation and the setup script name the same PAM service", () => {
    assert.match(source(`${lockRoot}/LockAuth.qml`), /config:\s*"df-lock"/);
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

test("one conversation for the whole lock, not one per screen", () => {
    const surface = source(`${lockRoot}/LockSurface.qml`);
    const shell = source(`${lockRoot}/shell.qml`);

    assert.doesNotMatch(surface, /PamContext/,
        "a conversation per surface is a failure count per screen, while faillock counts them "
        + "all -- so the number you were shown would be the only untrue one");
    assert.match(surface, /property LockAuth auth\b/,
        "the host supplies it, which is what lets the lock share one across screens");
    assert.match(shell, /LockAuth \{\s*\n\s*id: lockAuth/,
        "created beside the WlSessionLock, so it outlives surfaces the protocol destroys");
    assert.match(shell, /auth: lockAuth/);
});

test("a surface writing the shared password back into its field cannot echo", () => {
    const surface = source(`${lockRoot}/LockSurface.qml`);

    assert.match(surface, /onTextChanged:\s*if \(!root\.syncingField\)/,
        "syncField assigns field.text, which raises onTextChanged -- unguarded, one screen's "
        + "keystroke comes back round as an edit from the other");
});

test("re-locking does not show the previous lock's failures", () => {
    assert.match(source(`${lockRoot}/shell.qml`), /lockAuth\.reset\(\);/,
        "the conversation outlives the surfaces now, so nothing else clears it");
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

test("the lock takes the compositor's session lock, one surface per screen", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /WlSessionLock\s*\{/);
    assert.match(shell, /WlSessionLockSurface\s*\{/,
        "the surface component is what the protocol instantiates per screen -- an overlay "
        + "window would leave a newly attached monitor showing the session");
});

test("the surface takes keystrokes only once the compositor calls it Secure", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /inputEnabled:\s*sessionLock\.secure/,
        "keystrokes before Secure are not guaranteed to be exclusive to the lock, and the "
        + "first one would be the start of a password");
});

// The IpcHandler body, without the rest of shell.qml.
function lockIpcHandler() {
    const shell = source(`${lockRoot}/shell.qml`);
    const block = shell.match(/IpcHandler \{\s*\n\s*target: "lock"\n([\s\S]*?)\n    \}/);
    assert.ok(block, "the lock no longer exposes an IpcHandler targeting `lock`");
    return block[1];
}

test("the IPC surface carries commands and nothing that answers a question", () => {
    const handler = lockIpcHandler();
    const returnTypes = [...handler.matchAll(/function\s+\w+\([^)]*\):\s*(\w+)/g)].map(m => m[1]);

    assert.ok(returnTypes.length > 0, "the extraction stopped matching -- this test is now asserting nothing");
    returnTypes.forEach(type => {
        assert.strictEqual(type, "void",
            "`qs ipc call` exits zero against a target that does not exist, so a question asked "
            + "here has a wrong answer indistinguishable from a right one -- ADR 0017");
    });
});

test("the state file is runtime, blocking and atomic", () => {
    const shell = source(`${lockRoot}/shell.qml`);
    const session = source(`${lockRoot}/lib/session.js`);

    assert.match(session, /XDG_RUNTIME_DIR|runtimeDir/,
        "a state file that survives the boot is a stale answer waiting to be read");
    assert.match(shell, /path:\s*Session\.statePath\(Quickshell\.env\("XDG_RUNTIME_DIR"\)/);
    assert.match(shell, /blockWrites:\s*true/,
        "an async write is a transition that has not happened yet as far as df-power is concerned");
    assert.match(shell, /atomicWrites:\s*true/,
        "df-power reads this from a keybind at the lock screen; a half-written file there is a "
        + "shutdown that silently does nothing");
});

test("every transition publishes", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /onSessionChanged:[\s\S]*?stateFile\.setText\(text\)/,
        "publishing anywhere but on the state changing is a transition waiting to be missed");
});

test("a fresh instance does not claim unlocked over a lock it inherited", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /Component\.onCompleted:[\s\S]*?Session\.startupText\(stateFile\.text\(\)\)/,
        "a previous instance can die still holding a lock the compositor keeps up, and "
        + "`unlocked` over covered screens is the one direction this file must never be wrong in");
    assert.match(shell, /blockLoading:\s*true/,
        "an async read answers after the decision it informs");
    assert.match(shell, /if \(!root\.publishing\)\s*\n\s*return;/,
        "`session`'s own initialiser fires onSessionChanged before Component.onCompleted, so "
        + "an unguarded publish writes `unlocked` over the inherited answer before it is read");
});

test("logind's hint is set on lock and cleared on unlock", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /SetLockedHint/);
    assert.match(shell, /hint \? "true" : "false"/,
        "set on lock and cleared on unlock -- a hint that is only ever set is worse than none");
    assert.match(shell, /execDetached/,
        "the hint is for outside consumers only, so a logind that refuses it must not hold up "
        + "a lock");
});

test("the lock starts as its own instance, and cannot be run as a scratch config", () => {
    assert.match(source("hypr/.config/hypr/lua/autostart.lua"), /quickshell -c lock -n/);
    assert.match(source("bin/df-qs-test"), /dotfiles \| launcher \| lock\)/,
        "a foreground lock instance dies with its terminal, which is a dropped lock");
    assert.match(source("bin/df-qs-restart"), /dotfiles \| launcher \| lock/);
});

// --- The Break-glass runbook -------------------------------------------------
//
// The runbook is read at a TTY by someone who has just lost their session, so
// the failure that matters is silent rot: a path that moved, a symptom the
// design grew, an ADR that no longer points at it. All four are checkable here.

const runbookPath = "docs/session-lock-break-glass.md";

// The ADRs that decide this work. A reader who lands on any of them has to be
// able to reach the escape hatch from there.
const lockAdrs = [
    "docs/adr/0015-power-keybinds-reachable-while-locked.md",
    "docs/adr/0016-lock-holds-its-own-sleep-inhibitor.md",
    "docs/adr/0017-lock-state-is-a-file-not-a-process-probe.md",
    "docs/adr/0018-lock-probe-shares-the-surface-by-symlink.md",
];

test("the runbook names the three symptoms that should send you to it", () => {
    const runbook = source(runbookPath);

    assert.match(runbook, /never locks on idle/i);
    assert.match(runbook, /suspends without locking/i);
    assert.match(runbook, /refuses a correct password/i);
});

test("the runbook states the TTY escape", () => {
    const runbook = source(runbookPath);

    assert.match(runbook, /Ctrl\+Alt\+F3/,
        "the runbook is useless if it does not say how to get a shell in front of a lock");
    assert.doesNotMatch(runbook, /\*\*`Ctrl\+Alt\+F2`\*\*/,
        "F2 is the graphical session's own console under SDDM -- switching to it is the lock again");
});

test("the runbook names the unit to re-enable and the daemons to reinstall", () => {
    const runbook = source(runbookPath);

    assert.match(runbook, /systemctl --user enable --now hypridle\.service/);
    assert.match(runbook, /pacman -S[^\n]*\bhyprlock\b[^\n]*\bhypridle\b/);
});

test("every lock ADR points at the runbook", () => {
    lockAdrs.forEach(adr => {
        assert.match(source(adr), new RegExp(runbookPath.replace(/[.]/g, "\\.")),
            `${adr} decides part of the lock; the escape hatch has to be findable from it`);
    });
});

test("every repo path the runbook names still exists", () => {
    const runbook = source(runbookPath);

    // Backticked paths that look repo-relative: a leading directory segment
    // this repo actually has at its root.
    const roots = fs.readdirSync(repoRoot).filter(entry => !entry.startsWith("."));
    const cited = new Set(
        (runbook.match(/`[A-Za-z0-9_./-]+`/g) || [])
            .map(match => match.slice(1, -1))
            .filter(candidate => roots.includes(candidate.split("/")[0]))
            .filter(candidate => candidate.includes("/")),
    );

    assert.ok(cited.size > 0, "the extraction stopped matching -- this test is now asserting nothing");
    cited.forEach(candidate => {
        assert.ok(fs.existsSync(path.join(repoRoot, candidate)),
            `the runbook sends a reader at a TTY to ${candidate}, which does not exist`);
    });
});
