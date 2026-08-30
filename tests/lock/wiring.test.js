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

test("a lock waits for a real screen and retries when screens change", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /Session\.shouldAcquire\(root\.session, Quickshell\.screens\)/);
    assert.match(shell, /id:\s*sessionLockStabilizeTimer[\s\S]*interval:\s*500/,
        "a newly visible screen must settle before the lock is acquired");
    assert.match(shell, /id:\s*pendingSessionLockTimer[\s\S]*repeat:\s*true[\s\S]*root\.requestSessionLock\(\)/);
    assert.match(shell, /target:\s*Quickshell[\s\S]*onScreensChanged\(\)[\s\S]*root\.queueSessionLock\(\)/,
        "screen attachment must retry a request that arrived while every screen was absent");
});

test("a monitor attached while locked gets a protocol lock surface", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /WlSessionLock\s*\{[\s\S]*WlSessionLockSurface\s*\{/,
        "the compositor creates a surface for each monitor, including monitors attached later");
});

test("startup recovers only a compositor-reported Stranded Lock", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /command:\s*\["hyprctl",\s*"-j",\s*"monitors"\]/);
    assert.match(shell, /Session\.compositorLockReport\(stdout\.text\)/);
    assert.match(shell, /Session\.isStranded\(root\.session, report\)/);
    assert.match(shell, /id:\s*strandedLockRetryTimer[\s\S]*repeat:\s*true/);
    assert.match(shell, /function rearm\(\): void \{[\s\S]*remaining = 20;[\s\S]*start\(\);/,
        "screen attachment must restart an exhausted unresolved check");
});

test("Hyprland permits a fresh client to recover its failsafe lock", () => {
    const lookAndFeel = source("hypr/.config/hypr/lua/looknfeel.lua");

    assert.match(lookAndFeel, /misc\s*=\s*\{[\s\S]*allow_session_lock_restore\s*=\s*true/,
        "without this, Hyprland closes the replacement client's Wayland connection");
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

test("every external lock call site uses the lock IPC command vector", () => {
    const argv = /"qs",\s*"-c",\s*"lock",\s*"ipc",\s*"call",\s*"lock",\s*"lock"/;

    assert.match(source("hypr/.config/hypr/lua/bindings/system.lua"), /launcher:confirm-lock/,
        "the lock keybind must keep the Launcher's confirmation flow");
    assert.match(source(`${lockRoot}/shell.qml`), /root\.lock\(\)/,
        "the Idle Ladder must call the in-process Session Lock");
    assert.match(source("quickshell/.config/quickshell/launcher/lib/power.js"), argv);
    assert.match(source("quickshell/.config/quickshell/launcher/modules/SystemMenu.qml"), argv);
    assert.match(source("quickshell/.config/quickshell/dotfiles/modules/QuickSettings.qml"), argv);
});

test("df-power reads lock state without running a process", () => {
    const power = source("bin/df-power");

    assert.match(power, /\$\{XDG_RUNTIME_DIR:-\$\{TMPDIR:-\/tmp\}\}\/df-lock-state/);
    assert.match(power, /read\s+-r\s+lock_state\s*</);
    assert.doesNotMatch(power, /pidof|pgrep|qs\s+.*ipc|loginctl/,
        "the locked keybind path cannot wait for another process to answer");
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
    assert.match(shell, /Quickshell\.env\("XDG_SESSION_ID"\)/,
        "the detached busctl process is not in the graphical session, so session/self targets "
        + "the wrong session");
    assert.doesNotMatch(shell, /login1\/session\/self/);
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

test("df-qs-restart survives a lock instance that will not exit on request", () => {
    const restart = source("bin/df-qs-restart");
    const running = restart.match(/^RUNNING="(.*)"$/m);

    assert.ok(running, "the instance pattern must remain extractable");

    // What pgrep -f matches it against: whole command lines, this one's own
    // `kill` call among them. `\$` is bash's escape, not part of the pattern.
    const pattern = new RegExp(
        running[1].replaceAll("$CONFIG", "lock").replaceAll("\\$", "$"));

    assert.match("quickshell -c lock -n -d", pattern);
    assert.match("/usr/bin/quickshell -c lock -n", pattern);
    assert.doesNotMatch("quickshell -c lock kill", pattern,
        "a pattern that matches this script's own kill call never sees the count reach zero");
    assert.doesNotMatch("/bin/zsh -c pgrep -f 'quickshell -c lock'", pattern,
        "and one that matches a shell mentioning the config kills the wrong process");

    assert.match(restart, /timeout \d+ quickshell -c "\$CONFIG" kill/,
        "the IPC kill blocks until the instance exits, and one stuck in shutdown never does");
    assert.match(restart, /pkill -f "\$RUNNING"/,
        "SIGTERM is what moves an instance that accepted the exit request and stalled");
});

test("the Idle Ladder reads box timings and respects compositor inhibitors", () => {
    const shell = source(`${lockRoot}/shell.qml`);
    const stageMonitor = shell.match(/component StageMonitor: IdleMonitor \{([\s\S]*?)\n    \}/);
    const idleFileView = shell.match(/FileView \{\s*\n\s*id: idleConfigFile([\s\S]*?)\n\s*JsonAdapter \{/);

    assert.ok(stageMonitor, "the shared Stage monitor component must remain extractable");
    assert.ok(idleFileView, "the timing FileView must remain extractable");
    assert.match(shell, /path:\s*[^\n]*\.config\/df\/idle\.json/);
    assert.match(idleFileView[1], /watchChanges:\s*false/,
        "live timing reload can fire a newly enabled Stage from old compositor idle time");
    assert.match(shell, /onLoaded:[\s\S]*root\.idleState\s*=\s*Idle\.initial\(root\.idleTimings\)[\s\S]*root\.idleConfigReady\s*=\s*true/,
        "the ladder state and monitors must use loaded box timings");
    assert.match(shell, /Loader\s*\{[\s\S]*active:\s*root\.idleConfigReady\s*&&/,
        "no compositor idle monitor may exist before asynchronous timing data is loaded");
    assert.doesNotMatch(idleFileView[1], /onFileChanged|reload\(\)/);
    assert.match(shell, /IdleMonitor\s*\{[\s\S]*respectInhibitors:\s*true/);
    assert.match(shell, /property bool armed:\s*false[\s\S]*if \(!isIdle\)[\s\S]*armTimer\.restart\(\)[\s\S]*else if \(armed\)/,
        "startup while already idle must wait for activity before firing old timeouts");
    assert.match(shell, /required property var armTimer/);
    assert.match(shell, /onTriggered: if \(dimMonitor\.item && !dimMonitor\.item\.isIdle\) dimMonitor\.item\.armed = true/);
    assert.doesNotMatch(stageMonitor[1], /Timer\s*\{/,
        "IdleMonitor has no default property, so an owned Timer makes the whole lock config fail to load");
    assert.match(shell, /Idle\.advance\(/);
    assert.match(shell, /Idle\.resetOnActivity\(/);
    assert.match(shell, /timeout:\s*seconds/,
        "the data file and IdleMonitor.timeout both use seconds");
    assert.doesNotMatch(stageMonitor[1], /timeout:[^\n]*:\s*1/,
        "a one-second placeholder can survive asynchronous config loading");
});

test("the Idle Ladder restores exact brightness and refreshes the Bar cache", () => {
    const shell = source(`${lockRoot}/shell.qml`);
    const bar = source("quickshell/.config/quickshell/dotfiles/shell.qml");

    assert.match(shell, /"brightnessctl",\s*"--class=backlight",\s*"-s",\s*"set",\s*"10"/);
    assert.match(shell, /"brightnessctl",\s*"--class=backlight",\s*"-r"/);
    assert.match(shell, /brightnessRestorePending[\s\S]*onExited[\s\S]*root\.restoreBrightness\(\)/,
        "activity during the dim write must restore after it, not race it");
    assert.match(shell, /command\.indexOf\("-r"\)[\s\S]*refreshBarBrightness\(\)/,
        "the Bar must refresh after hardware restoration finishes");
    assert.match(shell, /qs[^\n]*-c[^\n]*dotfiles[^\n]*brightness[^\n]*refresh/);
    assert.match(bar, /target:\s*"brightness"[\s\S]*function refresh\(\): void[\s\S]*BacklightService\.refresh\(\)/);
});

test("the Idle Ladder uses Hyprland's Lua dispatcher API for display blanking", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /hl\.dsp\.dpms\(\{action = \\"off\\"\}\)/);
    assert.match(shell, /hl\.dsp\.dpms\(\{action = \\"on\\"\}\)/);
    assert.doesNotMatch(shell, /"dispatch",\s*"dpms",\s*"(?:off|on)"/,
        "current Hyprland parses the old dpms arguments as invalid Lua");
    assert.match(shell, /Component\.onCompleted:\s*\{\s*root\.setDpms\("on"\)/,
        "a replacement process must recover a display blanked by its predecessor");
});

test("box timing data replaces hypridle and its devbox override machinery", () => {
    const laptop = JSON.parse(source(`${lockRoot}/idle.json`));
    const devbox = JSON.parse(source("setup/arch-devbox/idle.json"));
    const packages = source("setup/arch-hyprland/setup-packages/setup-hyprland");
    const autostart = source("hypr/.config/hypr/lua/autostart.lua");
    const setup = source("setup/common/setup-idle-ladder");
    const laptopInit = source("setup/arch-hyprland/init");
    const devboxInit = source("setup/arch-devbox/init");

    assert.deepStrictEqual(laptop, { dim: 120, lock: 1800, blank: 1830, suspend: 1860 });
    assert.deepStrictEqual(devbox, { dim: null, lock: 1800, blank: 1830, suspend: null });
    assert.match(setup, /SOURCE=.*realpath/,
        "a relative source must not become a broken link relative to ~/.config/df");
    assert.match(setup, /mkdir -p "\$HOME\/\.config\/df"/);
    assert.match(setup, /ln -snf "\$SOURCE" "\$HOME\/\.config\/df\/idle\.json"/);
    assert.match(laptopInit, /setup-idle-ladder" \\\n\s*"\$DOTFILES_DIR\/quickshell\/\.config\/quickshell\/lock\/idle\.json"/);
    assert.match(devboxInit, /setup-idle-ladder" \\\n\s*"\$DOTFILES_DIR\/setup\/arch-devbox\/idle\.json"/);
    assert.doesNotMatch(packages, /^\s*hypridle\s*\\/m);
    assert.match(packages, /disable --now hypridle\.service/,
        "an already-installed daemon must be stopped during migration");
    assert.doesNotMatch(autostart, /hypridle/);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "hypr/.config/hypr/hypridle.conf")), false);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "setup/arch-devbox/hypridle.conf")), false);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "setup/common/setup-hypridle-no-suspend")), false);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "setup/arch-devbox/setup-hypridle-no-suspend")), false);
});

test("nothing is left of hyprlock or the theming pipeline that fed it", () => {
    const packages = source("setup/arch-hyprland/setup-packages/setup-hyprland");
    const fontSet = source("bin/df-font-set");
    const themes = fs.readdirSync(path.join(repoRoot, "themes/.config/themes"));

    assert.doesNotMatch(packages, /^\s*hyprlock\b/m);
    assert.doesNotMatch(fontSet, /hyprlock/i,
        "the positional two-occurrence substitution went with the file it patched");
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "hypr/.config/hypr/hyprlock.conf")), false);
    assert.strictEqual(fs.existsSync(path.join(repoRoot, "themes/templates/hyprlock.conf.tpl")), false,
        "df-theme-generate renders every template it finds, so the template is the generator");
    assert.ok(themes.length > 0, "the theme scan found nothing -- this assertion is asserting nothing");
    themes.forEach(theme => {
        assert.strictEqual(
            fs.existsSync(path.join(repoRoot, "themes/.config/themes", theme, "hyprlock.conf")), false,
            `${theme} still carries a generated lock config, so adding a theme still needs one`);
    });
});

test("the lock holds the delay inhibitor itself, and holds it from startup", () => {
    const shell = source(`${lockRoot}/shell.qml`);
    const inhibitor = shell.match(/Process \{\s*\n\s*id: sleepInhibitor([\s\S]*?)\n    \}/);

    assert.ok(inhibitor, "the inhibitor process must remain extractable");
    assert.match(inhibitor[1], /"systemd-inhibit",\s*"--what=sleep",\s*"--mode=delay"/,
        "a block inhibitor would refuse the suspend rather than delay it");
    assert.match(inhibitor[1], /"head",\s*"-n",\s*"1"/,
        "signalling systemd-inhibit leaves its child running; ending the child is what closes "
        + "the inhibitor's descriptor, and stdin closing does it too when this shell dies");
    assert.match(inhibitor[1], /stdinEnabled:\s*true[\s\S]*write\("\\n"\)/,
        "release is a line on stdin, not a signal");
    assert.match(shell, /Component\.onCompleted:[\s\S]*sleepInhibitor\.acquire\(\)/,
        "logind waits only for inhibitors registered before it announces sleep, so one taken "
        + "on the announcement is already too late");
});

test("the lock locks on logind's announcement and releases once Secure", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /"gdbus",\s*"monitor",\s*"--system",\s*"--dest",\s*"org\.freedesktop\.login1"/,
        "`dbus-monitor` needs BecomeMonitor or eavesdropping, and the system bus refuses both "
        + "to a user -- it prints its refusal and then sees nothing");
    assert.match(shell, /Sleep\.signalValue\(line\)/);
    assert.match(shell, /root\.onSleepAnnounced\(\)[\s\S]*root\.onSleepFinished\(\)/,
        "the resume is the same signal with a false argument, and the moment the inhibitor has "
        + "to be taken again");
    assert.match(shell, /function onSleepAnnounced\(\): void \{[\s\S]*root\.lock\(\)/);
    assert.match(shell, /function settleSleep\(\): void \{[\s\S]*Session\.phase\(root\.session\) !== Session\.SECURE[\s\S]*sleepInhibitor\.release\(\)/,
        "releasing on a lock merely requested is the race the Secure distinction exists to "
        + "prevent");
    assert.match(shell, /onSessionChanged:\s*\{[\s\S]*root\.settleSleep\(\)/,
        "Secure arrives as a session transition, and nothing else would notice it");
});

test("the wait for Secure is bounded, and a suspend without it is reported", () => {
    const shell = source(`${lockRoot}/shell.qml`);

    assert.match(shell, /id:\s*secureBudgetTimer[\s\S]*interval:\s*Sleep\.SECURE_BUDGET_MS[\s\S]*root\.onSecureBudgetExpired\(\)/,
        "an unbounded wait strands a closed laptop in a bag");
    assert.match(shell, /function onSecureBudgetExpired\(\): void \{[\s\S]*sleepInhibitor\.release\(\)/,
        "logind suspends when its own window expires either way");
    assert.match(shell, /notify-send[\s\S]*--urgency=critical/,
        "the suspend already happened; the notification is the only way anyone finds out");
    assert.match(shell, /function reportUnsecuredSuspend\(\): void \{[\s\S]*Session\.isLocked\(root\.session\)/,
        "the Bar's notification popup cannot render over the lock, so the notice waits for the "
        + "screen the session is unlocked into");
    assert.match(shell, /function unlock\(\): void \{[\s\S]*root\.reportUnsecuredSuspend\(\)/);
    assert.match(shell, /function onSleepFinished\(\): void \{[\s\S]*root\.reportUnsecuredSuspend\(\)/,
        "a session that never locked at all is unlocked at the resume, and nothing later would "
        + "deliver the notice");
});

// Copied from Omarchy test/shell.d/sleep-lock-test.sh, revision
// 83881e979b35468c3e7d60b171e319ede61a88fd: the budget is only reachable
// because the shipped drop-in widens logind's window past it, so shipping one
// without the other makes the budget dead weight.
test("the lock's budget stays inside the logind window the drop-in asks for", () => {
    const setup = source("setup/arch-hyprland/setup-packages/setup-sleep-inhibit");
    const sleep = require(path.join(repoRoot, lockRoot, "lib/sleep.js"));
    const inhibitDelay = setup.match(/^InhibitDelayMaxSec=(\d+)$/m);

    assert.ok(inhibitDelay, "the drop-in no longer declares an inhibit delay");
    assert.strictEqual(Number(inhibitDelay[1]), sleep.INHIBIT_DELAY_SECONDS,
        "the budget is checked against this number, so the two have to be the same number");
    assert.ok(Number(inhibitDelay[1]) > 5,
        "5s is logind's default, and it is not enough when closing the lid also reconfigures "
        + "displays");
    assert.ok(sleep.SECURE_BUDGET_MS < Number(inhibitDelay[1]) * 1000,
        "a budget past logind's window leaves logind no room to act on the release");
    assert.match(setup, /\/etc\/systemd\/logind\.conf\.d\/20-inhibit-delay\.conf/);
    assert.match(source("setup/arch-hyprland/init"), /setup-packages\/setup-sleep-inhibit"/,
        "a drop-in no box installs is a window that stays at the default");
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
    // The restore list is the one section that names paths precisely because
    // they are gone -- checking those for existence would assert the removal
    // never happened. Everything outside it is a path a reader is sent to.
    const restoreList = /^What has to come back[\s\S]*?^\*\*/m;
    const runbook = source(runbookPath).replace(restoreList, "");

    assert.doesNotMatch(runbook, /What has to come back/,
        "the restore-list heading moved, so the exemption is silently swallowing the whole file");

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
