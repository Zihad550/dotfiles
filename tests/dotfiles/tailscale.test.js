const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const tailscaleCommand = path.join(repoRoot, "bin/df-tailscale");
const Model = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/tailscale.js");

// A fake `tailscale` that answers `switch --list --json`, `switch <id>`,
// `status --json`, and `up` from env vars, the same shape network.test.js
// uses for nmcli/ip. Every invocation is also appended to FAKE_TAILSCALE_LOG
// (one line of raw args each) when set, so a test can assert exactly which
// commands a chained switch-then-connect actually issued. A FAKE_TAILSCALE_
// ELEVATED flag (set by the fake pkexec below before it execs) switches each
// case to its own *_ELEVATED_* answer, so a test can make the direct attempt
// fail and the elevated retry succeed (or fail differently) with the same
// fake binary. FAKE_TAILSCALE_SLEEP, if set, blocks before answering, for
// exercising DF_TAILSCALE_TIMEOUT.
function fakeTailscaleDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-tailscale-"));
    const tailscale = path.join(directory, "tailscale");
    fs.writeFileSync(tailscale, `#!/bin/sh
if [ -n "\${FAKE_TAILSCALE_LOG:-}" ]; then
  printf '%s\\n' "$*" >> "\$FAKE_TAILSCALE_LOG"
fi
if [ -n "\${FAKE_TAILSCALE_SLEEP:-}" ]; then
  sleep "\$FAKE_TAILSCALE_SLEEP"
fi
case "$*" in
  *"switch --list --json"*)
    if [ -n "\${FAKE_TAILSCALE_ELEVATED:-}" ]; then
      if [ -n "\${FAKE_TAILSCALE_ELEVATED_STDOUT:-}" ]; then
        printf '%s\\n' "$FAKE_TAILSCALE_ELEVATED_STDOUT"
        exit "\${FAKE_TAILSCALE_ELEVATED_EXIT:-0}"
      fi
      printf '%s\\n' "\${FAKE_TAILSCALE_ELEVATED_STDERR:-elevated error}" >&2
      exit "\${FAKE_TAILSCALE_ELEVATED_EXIT:-1}"
    fi
    if [ -n "\${FAKE_TAILSCALE_STDOUT:-}" ]; then
      printf '%s\\n' "$FAKE_TAILSCALE_STDOUT"
      exit 0
    fi
    printf '%s\\n' "\${FAKE_TAILSCALE_STDERR:-error}" >&2
    exit "\${FAKE_TAILSCALE_EXIT:-1}"
    ;;
  "switch "*)
    if [ -n "\${FAKE_TAILSCALE_ELEVATED:-}" ]; then
      if [ -n "\${FAKE_TAILSCALE_SWITCH_ELEVATED_STDOUT:-}" ] || [ -z "\${FAKE_TAILSCALE_SWITCH_ELEVATED_EXIT:-}" ]; then
        printf '%s\\n' "\${FAKE_TAILSCALE_SWITCH_ELEVATED_STDOUT:-Switched.}"
        exit "\${FAKE_TAILSCALE_SWITCH_ELEVATED_EXIT:-0}"
      fi
      printf '%s\\n' "\${FAKE_TAILSCALE_SWITCH_ELEVATED_STDERR:-elevated error}" >&2
      exit "\$FAKE_TAILSCALE_SWITCH_ELEVATED_EXIT"
    fi
    if [ -n "\${FAKE_TAILSCALE_SWITCH_STDERR:-}" ]; then
      printf '%s\\n' "$FAKE_TAILSCALE_SWITCH_STDERR" >&2
      exit "\${FAKE_TAILSCALE_SWITCH_EXIT:-1}"
    fi
    printf '%s\\n' "\${FAKE_TAILSCALE_SWITCH_STDOUT:-Switched.}"
    exit 0
    ;;
  "status --json")
    if [ -n "\${FAKE_TAILSCALE_STATUS_STDOUT:-}" ]; then
      printf '%s\\n' "$FAKE_TAILSCALE_STATUS_STDOUT"
      exit "\${FAKE_TAILSCALE_STATUS_EXIT:-0}"
    fi
    printf '%s\\n' "\${FAKE_TAILSCALE_STATUS_STDERR:-status unavailable}" >&2
    exit "\${FAKE_TAILSCALE_STATUS_EXIT:-1}"
    ;;
  up)
    if [ -n "\${FAKE_TAILSCALE_ELEVATED:-}" ]; then
      if [ -n "\${FAKE_TAILSCALE_UP_ELEVATED_STDOUT:-}" ] || [ -z "\${FAKE_TAILSCALE_UP_ELEVATED_EXIT:-}" ]; then
        printf '%s\\n' "\${FAKE_TAILSCALE_UP_ELEVATED_STDOUT:-Success.}"
        exit "\${FAKE_TAILSCALE_UP_ELEVATED_EXIT:-0}"
      fi
      printf '%s\\n' "\${FAKE_TAILSCALE_UP_ELEVATED_STDERR:-elevated error}" >&2
      exit "\$FAKE_TAILSCALE_UP_ELEVATED_EXIT"
    fi
    if [ -n "\${FAKE_TAILSCALE_UP_STDERR:-}" ]; then
      printf '%s\\n' "$FAKE_TAILSCALE_UP_STDERR" >&2
      # Models the real \`tailscale up\`: it prints the login URL first and
      # only then blocks waiting for the browser, so a timeout kills it with
      # that line already written.
      if [ -n "\${FAKE_TAILSCALE_UP_BLOCK:-}" ]; then
        sleep "\$FAKE_TAILSCALE_UP_BLOCK"
      fi
      exit "\${FAKE_TAILSCALE_UP_EXIT:-1}"
    fi
    printf '%s\\n' "\${FAKE_TAILSCALE_UP_STDOUT:-Success.}"
    exit 0
    ;;
  *) exit 127 ;;
esac
`);
    fs.chmodSync(tailscale, 0o755);
    return directory;
}

// Adds a fake `pkexec` to `directory`, shadowing the real one since the fake
// directory is listed first on PATH. It logs its exact argv to
// FAKE_PKEXEC_LOG (proving an elevated retry invokes `tailscale` directly,
// never this script or another wrapper), can sleep for FAKE_PKEXEC_SLEEP
// seconds and record start/end timestamps to FAKE_PKEXEC_TIMING (proving
// serialization), can exit a fixed FAKE_PKEXEC_EXIT (126/127 model a
// cancelled/denied graphical prompt), and otherwise runs the wrapped command
// with FAKE_TAILSCALE_ELEVATED=1 so the fake tailscale above can answer
// differently once elevated.
function addFakePkexec(directory) {
    const pkexec = path.join(directory, "pkexec");
    fs.writeFileSync(pkexec, `#!/bin/sh
if [ -n "\${FAKE_PKEXEC_LOG:-}" ]; then
  printf '%s\\n' "$*" >> "\$FAKE_PKEXEC_LOG"
fi
if [ -n "\${FAKE_PKEXEC_TIMING:-}" ]; then
  printf 'start %s\\n' "$(date +%s%N)" >> "\$FAKE_PKEXEC_TIMING"
fi
if [ -n "\${FAKE_PKEXEC_SLEEP:-}" ]; then
  sleep "\$FAKE_PKEXEC_SLEEP"
fi
if [ -n "\${FAKE_PKEXEC_TIMING:-}" ]; then
  printf 'end %s\\n' "$(date +%s%N)" >> "\$FAKE_PKEXEC_TIMING"
fi
if [ -n "\${FAKE_PKEXEC_EXIT:-}" ]; then
  exit "\$FAKE_PKEXEC_EXIT"
fi
FAKE_TAILSCALE_ELEVATED=1 exec "$@"
`);
    fs.chmodSync(pkexec, 0o755);
    return pkexec;
}

// Symlinks the real jq/timeout/flock into `directory` so a test can point
// PATH at nothing but this one directory -- the only way to prove pkexec is
// genuinely absent rather than merely shadowed, since this sandbox has a
// real pkexec on /usr/bin.
function symlinkSystemTools(directory) {
    for (const tool of ["jq", "timeout", "flock", "sleep", "date", "grep"]) {
        const real = childProcess.execSync(`command -v ${tool}`, { shell: "/bin/bash" }).toString().trim();
        fs.symlinkSync(real, path.join(directory, tool));
    }
}

function buildEnv(fakeDirectory, options) {
    const env = {
        ...process.env,
        PATH: options.isolatedPath ? fakeDirectory : `${fakeDirectory}:/usr/bin:/bin`,
    };
    if (options.timeout !== undefined) env.DF_TAILSCALE_TIMEOUT = String(options.timeout);
    if (options.runtimeDir !== undefined) env.XDG_RUNTIME_DIR = options.runtimeDir;
    if (options.pkexecLog !== undefined) env.FAKE_PKEXEC_LOG = options.pkexecLog;
    if (options.pkexecExit !== undefined) env.FAKE_PKEXEC_EXIT = String(options.pkexecExit);
    if (options.pkexecSleep !== undefined) env.FAKE_PKEXEC_SLEEP = String(options.pkexecSleep);
    if (options.pkexecTiming !== undefined) env.FAKE_PKEXEC_TIMING = options.pkexecTiming;
    if (options.sleep !== undefined) env.FAKE_TAILSCALE_SLEEP = String(options.sleep);
    if (options.logFile !== undefined) env.FAKE_TAILSCALE_LOG = options.logFile;
    return env;
}

function runProfiles(fakeDirectory, options = {}) {
    const env = buildEnv(fakeDirectory, options);
    if (options.stdout !== undefined) env.FAKE_TAILSCALE_STDOUT = options.stdout;
    if (options.stderr !== undefined) env.FAKE_TAILSCALE_STDERR = options.stderr;
    if (options.exitCode !== undefined) env.FAKE_TAILSCALE_EXIT = String(options.exitCode);
    if (options.elevatedStdout !== undefined) env.FAKE_TAILSCALE_ELEVATED_STDOUT = options.elevatedStdout;
    if (options.elevatedStderr !== undefined) env.FAKE_TAILSCALE_ELEVATED_STDERR = options.elevatedStderr;
    if (options.elevatedExitCode !== undefined) env.FAKE_TAILSCALE_ELEVATED_EXIT = String(options.elevatedExitCode);
    return childProcess.spawnSync(tailscaleCommand, ["profiles"].concat(options.extraArgs || []), {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
}

function runSwitch(fakeDirectory, id, options = {}) {
    const env = buildEnv(fakeDirectory, options);
    if (options.stderr !== undefined) env.FAKE_TAILSCALE_SWITCH_STDERR = options.stderr;
    if (options.exitCode !== undefined) env.FAKE_TAILSCALE_SWITCH_EXIT = String(options.exitCode);
    if (options.elevatedStdout !== undefined) env.FAKE_TAILSCALE_SWITCH_ELEVATED_STDOUT = options.elevatedStdout;
    if (options.elevatedStderr !== undefined) env.FAKE_TAILSCALE_SWITCH_ELEVATED_STDERR = options.elevatedStderr;
    if (options.elevatedExitCode !== undefined) env.FAKE_TAILSCALE_SWITCH_ELEVATED_EXIT = String(options.elevatedExitCode);
    return childProcess.spawnSync(tailscaleCommand, id === undefined ? ["switch"] : ["switch", id], {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
}

function runConnect(fakeDirectory, options = {}) {
    const env = buildEnv(fakeDirectory, options);
    if (options.statusStdout !== undefined) env.FAKE_TAILSCALE_STATUS_STDOUT = options.statusStdout;
    if (options.statusStderr !== undefined) env.FAKE_TAILSCALE_STATUS_STDERR = options.statusStderr;
    if (options.statusExitCode !== undefined) env.FAKE_TAILSCALE_STATUS_EXIT = String(options.statusExitCode);
    if (options.upStderr !== undefined) env.FAKE_TAILSCALE_UP_STDERR = options.upStderr;
    if (options.upBlock !== undefined) env.FAKE_TAILSCALE_UP_BLOCK = String(options.upBlock);
    if (options.upExitCode !== undefined) env.FAKE_TAILSCALE_UP_EXIT = String(options.upExitCode);
    if (options.upElevatedStdout !== undefined) env.FAKE_TAILSCALE_UP_ELEVATED_STDOUT = options.upElevatedStdout;
    if (options.upElevatedStderr !== undefined) env.FAKE_TAILSCALE_UP_ELEVATED_STDERR = options.upElevatedStderr;
    if (options.upElevatedExitCode !== undefined) env.FAKE_TAILSCALE_UP_ELEVATED_EXIT = String(options.upElevatedExitCode);
    return childProcess.spawnSync(tailscaleCommand, ["connect"], {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
}

function readLog(logFile) {
    return fs.existsSync(logFile)
        ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean)
        : [];
}

function spawnAsync(args, env) {
    return new Promise(resolve => {
        const child = childProcess.spawn(tailscaleCommand, args, { cwd: repoRoot, env });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });
        child.on("close", status => resolve({ status, stdout, stderr }));
    });
}

test("df-tailscale is executable and rejects a missing or unknown subcommand as usage", () => {
    assert.equal(fs.statSync(tailscaleCommand).mode & 0o111, 0o111);

    let result = childProcess.spawnSync(tailscaleCommand, [], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: df-tailscale profiles/);

    result = childProcess.spawnSync(tailscaleCommand, ["bogus"], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);

    result = childProcess.spawnSync(tailscaleCommand, ["profiles", "extra"], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);

    result = childProcess.spawnSync(tailscaleCommand, ["switch"], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);

    result = childProcess.spawnSync(tailscaleCommand, ["switch", "p1", "extra"], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);

    result = childProcess.spawnSync(tailscaleCommand, ["connect", "extra"], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);
});

test("df-tailscale forwards a successful raw JSON list on stdout with exit 0", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        const result = runProfiles(fakeDirectory, {
            stdout: '[{"ID":"p1","Tailnet":"example.ts.net"}]',
        });
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), '[{"ID":"p1","Tailnet":"example.ts.net"}]');
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale classifies an unsupported Tailscale version as exit 3, distinct from a daemon failure", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        let result = runProfiles(fakeDirectory, {
            stderr: "tailscale: unknown subcommand: switch",
            exitCode: 1,
        });
        assert.equal(result.status, 3);

        result = runProfiles(fakeDirectory, {
            stderr: "flag provided but not defined: -json",
            exitCode: 2,
        });
        assert.equal(result.status, 3);

        result = runProfiles(fakeDirectory, {
            stderr: "failed to connect to local tailscaled",
            exitCode: 1,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /failed to connect to local tailscaled/);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale reports a cleaned exit 4 for an access-denied profiles listing when pkexec is unavailable", () => {
    // No fake pkexec, and PATH points only at this directory: proves the
    // exit-4 path is reached because pkexec is genuinely absent, not merely
    // because this sandbox's real pkexec was shadowed.
    const fakeDirectory = fakeTailscaleDirectory();
    symlinkSystemTools(fakeDirectory);
    try {
        const result = runProfiles(fakeDirectory, {
            stderr: "Access denied: profiles access denied\n\nUse 'sudo tailscale switch --list --json'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.",
            exitCode: 1,
            isolatedPath: true,
        });
        assert.equal(result.status, 4);
        assert.doesNotMatch(result.stderr, /sudo|--operator|Access denied/i);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the model normalizes Profiles: order, label fallback, and detail only when it adds information", () => {
    const raw = JSON.stringify([
        { id: "1", tailnet: "example.ts.net", account: "user@example.com", nickname: "", selected: false },
        { id: "2", tailnet: "personal.ts.net", account: "user@personal.com", nickname: "Home", selected: true },
        { id: "3", tailnet: "", account: "", nickname: "", selected: false },
        { id: "4", tailnet: "solo.ts.net", account: "solo.ts.net", nickname: "", selected: false },
    ]);

    const result = Model.classifyProfiles(0, raw, "");
    assert.equal(result.state, "ready");
    assert.equal(result.profiles.length, 4);

    // order preserved
    assert.deepStrictEqual(result.profiles.map(p => p.id), ["1", "2", "3", "4"]);

    // label fallback: tailnet (no nickname), nickname (present), id (nothing else), tailnet
    assert.equal(result.profiles[0].label, "example.ts.net");
    assert.equal(result.profiles[1].label, "Home");
    assert.equal(result.profiles[2].label, "3");
    assert.equal(result.profiles[3].label, "solo.ts.net");

    // detail: account shown when it adds information beyond the label
    assert.equal(result.profiles[0].detail, "user@example.com");
    // detail: tailnet shown when it differs from the nickname label
    assert.equal(result.profiles[1].detail, "personal.ts.net");
    // no tailnet/account at all -> no detail
    assert.equal(result.profiles[2].detail, "");
    // account equals the tailnet label already shown -> adds nothing, so no detail
    assert.equal(result.profiles[3].detail, "");

    // current selection
    assert.equal(Model.currentProfile(result.profiles).id, "2");
    assert.equal(result.profiles[0].current, false);
    assert.equal(result.profiles[1].current, true);
});

test("the model falls back through nickname, Tailnet, account, then Profile ID in that order", () => {
    assert.equal(Model.profileLabel({ id: "x", nickname: "Nick", tailnet: "t", account: "a" }), "Nick");
    assert.equal(Model.profileLabel({ id: "x", nickname: "", tailnet: "t", account: "a" }), "t");
    assert.equal(Model.profileLabel({ id: "x", nickname: "", tailnet: "", account: "a" }), "a");
    assert.equal(Model.profileLabel({ id: "x", nickname: "", tailnet: "", account: "" }), "x");
});

test("the model classifies a successful empty response distinctly from unsupported, daemon, and malformed failures", () => {
    assert.deepStrictEqual(Model.classifyProfiles(0, "[]", ""), {
        state: "empty",
        profiles: [],
        message: Model.EMPTY_MESSAGE,
    });
    assert.equal(Model.EMPTY_MESSAGE, "No saved Tailscale profiles.");

    assert.deepStrictEqual(Model.classifyProfiles(3, "", "anything"), {
        state: "unsupported",
        profiles: [],
        message: Model.UNSUPPORTED_MESSAGE,
    });
    assert.equal(Model.UNSUPPORTED_MESSAGE, "Profile switching is unavailable in this Tailscale version.");

    const daemon = Model.classifyProfiles(1, "", "failed to connect to local tailscaled");
    assert.equal(daemon.state, "daemon-failure");
    assert.equal(daemon.message, "failed to connect to local tailscaled");

    const malformed = Model.classifyProfiles(0, "not json", "");
    assert.equal(malformed.state, "malformed");
    assert.equal(malformed.message, Model.MALFORMED_MESSAGE);

    const malformedShape = Model.classifyProfiles(0, '{"not":"an array"}', "");
    assert.equal(malformedShape.state, "malformed");

    assert.notEqual(daemon.message, malformed.message,
        "daemon and malformed failures must be distinguishable inline states");
});

test("a refresh that fails keeps the last useful Profile list until a replacement succeeds", () => {
    const ready = Model.classifyProfiles(0, '[{"id":"1","nickname":"Home","selected":true}]', "");
    const failed = Model.classifyProfiles(1, "", "failed to connect to local tailscaled");
    const emptyAfterReady = Model.classifyProfiles(0, "[]", "");
    const readyAgain = Model.classifyProfiles(0, '[{"id":"2","nickname":"Work","selected":true}]', "");

    // a failed reload keeps the already-loaded good list, and still reports
    // its own failure so the Page can show it inline
    let merged = Model.mergeProfilesResult(ready, failed);
    assert.deepStrictEqual(merged.profiles, ready.profiles);
    assert.equal(merged.state, failed.state);
    assert.equal(merged.message, failed.message);

    // a load that itself succeeds (even to an empty list) does replace it
    merged = Model.mergeProfilesResult(ready, emptyAfterReady);
    assert.equal(merged, emptyAfterReady);

    // a later successful load replaces the retained one
    merged = Model.mergeProfilesResult(ready, readyAgain);
    assert.equal(merged, readyAgain);

    // nothing useful loaded yet -> first result is adopted even if it fails
    merged = Model.mergeProfilesResult({ state: "" }, failed);
    assert.equal(merged, failed);

    // an empty list is not a useful list to retain
    merged = Model.mergeProfilesResult(emptyAfterReady, failed);
    assert.equal(merged, failed);
});

test("the command boundary's own exit-code contract feeds the model end to end", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        const success = runProfiles(fakeDirectory, {
            stdout: '[{"id":"p1","tailnet":"example.ts.net","account":"user@example.com","nickname":"","selected":true}]',
        });
        let result = Model.classifyProfiles(success.status, success.stdout, success.stderr);
        assert.equal(result.state, "ready");
        assert.equal(result.profiles[0].label, "example.ts.net");
        assert.equal(result.profiles[0].current, true);

        const empty = runProfiles(fakeDirectory, { stdout: "[]" });
        result = Model.classifyProfiles(empty.status, empty.stdout, empty.stderr);
        assert.equal(result.state, "empty");
        assert.equal(result.message, "No saved Tailscale profiles.");

        const unsupported = runProfiles(fakeDirectory, {
            stderr: "tailscale: unknown subcommand: switch",
            exitCode: 1,
        });
        result = Model.classifyProfiles(unsupported.status, unsupported.stdout, unsupported.stderr);
        assert.equal(result.state, "unsupported");
        assert.equal(result.message, "Profile switching is unavailable in this Tailscale version.");

        const daemonFailure = runProfiles(fakeDirectory, {
            stderr: "failed to connect to local tailscaled",
            exitCode: 1,
        });
        result = Model.classifyProfiles(daemonFailure.status, daemonFailure.stdout, daemonFailure.stderr);
        assert.equal(result.state, "daemon-failure");
        assert.match(result.message, /failed to connect to local tailscaled/);

        const malformed = runProfiles(fakeDirectory, { stdout: "not json at all" });
        result = Model.classifyProfiles(malformed.status, malformed.stdout, malformed.stderr);
        assert.equal(result.state, "malformed");
        assert.equal(result.message, "Tailscale profile list malformed.");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale switch forwards the literal stable Profile ID, never a name", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const result = runSwitch(fakeDirectory, "profile-abc123", { logFile });
        assert.equal(result.status, 0);
        assert.deepStrictEqual(readLog(logFile), ["switch profile-abc123"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale switch classifies an unsupported version distinctly from a real switch failure", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        let result = runSwitch(fakeDirectory, "p1", {
            stderr: "tailscale: unknown subcommand: switch",
            exitCode: 1,
        });
        assert.equal(result.status, 3);

        result = runSwitch(fakeDirectory, "p1", {
            stderr: "no such profile",
            exitCode: 1,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /no such profile/);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale connect issues nothing beyond the status check when BackendState is already Running", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Running"}',
            logFile,
        });
        assert.equal(result.status, 0);
        assert.deepStrictEqual(readLog(logFile), ["status --json"],
            "an already-connected daemon must not see an extra up (or down) command");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale connect runs `tailscale up` only when BackendState is not Running", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            logFile,
        });
        assert.equal(result.status, 0);
        assert.deepStrictEqual(readLog(logFile), ["status --json", "up"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale connect fails without ever running `up` when the status check itself fails", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const result = runConnect(fakeDirectory, {
            statusStderr: "failed to connect to local tailscaled",
            statusExitCode: 1,
            logFile,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /failed to connect to local tailscaled/);
        assert.deepStrictEqual(readLog(logFile), ["status --json"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("df-tailscale connect surfaces a real `tailscale up` failure and classifies an unsupported one as exit 3", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        let result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            upStderr: "no netmap available",
            upExitCode: 1,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /no netmap available/);

        result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            upStderr: "flag provided but not defined: -timeout",
            upExitCode: 2,
        });
        assert.equal(result.status, 3);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

// TailscaleService.switchProfile() composes these same subcommands; these
// tests reproduce each of its activation paths at the command boundary and
// assert on the fake's invocation log, so "switch by ID then connect", "no
// extra up/down", and "a failed switch never reaches connect" are proven
// against real process exit codes rather than assumed from the QML source.
test("switching to a non-current Profile: switch by ID, then connect (which itself no-ops when already Running)", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const switchResult = runSwitch(fakeDirectory, "profile-2", { logFile });
        assert.equal(switchResult.status, 0);

        const connectResult = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Running"}',
            logFile,
        });
        assert.equal(connectResult.status, 0);

        assert.deepStrictEqual(readLog(logFile), ["switch profile-2", "status --json"],
            "switching to an already-running Profile must not issue an extra up");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("switching to a non-current, disconnected Profile: switch by ID, then connect brings it up", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const switchResult = runSwitch(fakeDirectory, "profile-3", { logFile });
        assert.equal(switchResult.status, 0);

        const connectResult = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            logFile,
        });
        assert.equal(connectResult.status, 0);

        assert.deepStrictEqual(readLog(logFile), ["switch profile-3", "status --json", "up"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a failed switch never reaches connect, and a refresh afterward reports Tailscale's real, unmoved current Profile", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const switchResult = runSwitch(fakeDirectory, "profile-4", {
            stderr: "no such profile",
            exitCode: 1,
            logFile,
        });
        assert.equal(switchResult.status, 1);
        assert.deepStrictEqual(readLog(logFile), ["switch profile-4"],
            "a failed switch must not be followed by connect");

        // failure reconciliation: the caller's mandatory refresh shows
        // whichever Profile Tailscale actually left selected, not profile-4
        const profilesResult = runProfiles(fakeDirectory, {
            stdout: '[{"id":"profile-1","nickname":"Home","selected":true}]',
        });
        const classified = Model.classifyProfiles(profilesResult.status, profilesResult.stdout, profilesResult.stderr);
        assert.equal(classified.state, "ready");
        assert.equal(Model.currentProfile(classified.profiles).id, "profile-1");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("activating the current, disconnected Profile retries its connection without ever switching", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    try {
        const connectResult = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            logFile,
        });
        assert.equal(connectResult.status, 0);
        assert.deepStrictEqual(readLog(logFile), ["status --json", "up"],
            "retrying the current Profile's connection must never issue a switch");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

// #143: unprivileged first, pkexec only on a recognized permission denial,
// one elevated retry at a time, cleaned failure states, and a bounded
// timeout. See docs/adr/0030-tailscale-privilege-and-failure-handling.md.

test("a direct success never touches pkexec", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const pkexecLog = path.join(fakeDirectory, "pkexec.log");
    addFakePkexec(fakeDirectory);
    try {
        const result = runProfiles(fakeDirectory, {
            stdout: '[{"id":"p1","tailnet":"example.ts.net"}]',
            pkexecLog,
        });
        assert.equal(result.status, 0);
        assert.deepStrictEqual(readLog(pkexecLog), [],
            "an unprivileged success must never invoke pkexec");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a recognized permission denial retries the identical operation directly under pkexec", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const pkexecLog = path.join(fakeDirectory, "pkexec.log");
    addFakePkexec(fakeDirectory);
    try {
        const result = runProfiles(fakeDirectory, {
            stderr: "Access denied: profiles access denied\n\nUse 'sudo tailscale switch --list --json'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.",
            exitCode: 1,
            elevatedStdout: '[{"id":"p1","tailnet":"example.ts.net","selected":true}]',
            pkexecLog,
        });
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), '[{"id":"p1","tailnet":"example.ts.net","selected":true}]');
        // "invoked directly": pkexec's own argv is the bare tailscale
        // command, never this script or a wrapper.
        assert.deepStrictEqual(readLog(pkexecLog), ["tailscale switch --list --json"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a non-permission failure never retries through pkexec", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const pkexecLog = path.join(fakeDirectory, "pkexec.log");
    addFakePkexec(fakeDirectory);
    try {
        const result = runProfiles(fakeDirectory, {
            stderr: "failed to connect to local tailscaled",
            exitCode: 1,
            pkexecLog,
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /failed to connect to local tailscaled/);
        assert.deepStrictEqual(readLog(pkexecLog), []);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("switch and connect's `up` also fall back to pkexec on a permission denial", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const pkexecLog = path.join(fakeDirectory, "pkexec.log");
    addFakePkexec(fakeDirectory);
    try {
        const switchResult = runSwitch(fakeDirectory, "profile-9", {
            stderr: "Access denied: must be root",
            exitCode: 1,
            elevatedStdout: "Switched.",
            pkexecLog,
        });
        assert.equal(switchResult.status, 0);

        const connectResult = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"Stopped"}',
            upStderr: "Access denied: must be root",
            upExitCode: 1,
            upElevatedStdout: "Success.",
            pkexecLog,
        });
        assert.equal(connectResult.status, 0);

        assert.deepStrictEqual(readLog(pkexecLog), ["tailscale switch profile-9", "tailscale up"]);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a graphical prompt that is cancelled or denied reports a cleaned exit 4, never the raw advice", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    addFakePkexec(fakeDirectory);
    try {
        const cancelled = runProfiles(fakeDirectory, {
            stderr: "Access denied: profiles access denied\n\nUse 'sudo tailscale switch --list --json'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.",
            exitCode: 1,
            pkexecExit: 126,
        });
        assert.equal(cancelled.status, 4);
        assert.doesNotMatch(cancelled.stderr, /sudo|--operator|Access denied/i);

        const denied = runProfiles(fakeDirectory, {
            stderr: "Access denied: profiles access denied",
            exitCode: 1,
            pkexecExit: 127,
        });
        assert.equal(denied.status, 4);
        assert.doesNotMatch(denied.stderr, /sudo|--operator|Access denied/i);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("cancelling or failing graphical authentication never starts a second attempt on its own", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const pkexecLog = path.join(fakeDirectory, "pkexec.log");
    addFakePkexec(fakeDirectory);
    try {
        const result = runProfiles(fakeDirectory, {
            stderr: "Access denied: must be root",
            exitCode: 1,
            pkexecExit: 126,
            pkexecLog,
        });
        assert.equal(result.status, 4);
        assert.deepStrictEqual(readLog(pkexecLog), ["tailscale switch --list --json"],
            "exactly one elevated attempt -- no automatic retry loop");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("elevated retries are serialized: two overlapping permission denials never hold the pkexec lock at once", async () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-runtime-"));
    const timing = path.join(fakeDirectory, "timing");
    addFakePkexec(fakeDirectory);
    try {
        const env = buildEnv(fakeDirectory, {
            timeout: 5,
            runtimeDir,
            pkexecSleep: "0.15",
            pkexecTiming: timing,
        });
        env.FAKE_TAILSCALE_STDERR = "Access denied: must be root";
        env.FAKE_TAILSCALE_EXIT = "1";
        env.FAKE_TAILSCALE_ELEVATED_STDOUT = "[]";

        const [first, second] = await Promise.all([
            spawnAsync(["profiles"], env),
            spawnAsync(["profiles"], env),
        ]);
        assert.equal(first.status, 0);
        assert.equal(second.status, 0);

        const marks = readLog(timing).map(line => {
            const [label, stamp] = line.split(" ");
            return { label, stamp: BigInt(stamp) };
        });
        assert.equal(marks.length, 4, "each invocation should mark one start and one end");
        // Never interleaved: the second invocation's pkexec cannot even
        // start running until flock has released the first's.
        assert.deepStrictEqual(marks.map(m => m.label), ["start", "end", "start", "end"]);
        assert.ok(marks[1].stamp <= marks[2].stamp,
            "the second elevated attempt must not begin until the first's has fully finished");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
        fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
});

test("only the elevated retry is serialized -- an unprivileged success never waits on the pkexec lock", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-runtime-"));
    addFakePkexec(fakeDirectory);
    try {
        // Pre-lock the file a real elevated retry would use; a direct
        // success must complete instantly regardless.
        const lockFile = path.join(runtimeDir, "df-tailscale-pkexec.lock");
        const held = childProcess.spawn("flock", [lockFile, "sleep", "5"]);
        try {
            const start = Date.now();
            const result = runProfiles(fakeDirectory, {
                stdout: "[]",
                runtimeDir,
            });
            assert.equal(result.status, 0);
            assert.ok(Date.now() - start < 2000,
                "an unprivileged attempt must not block on the elevated-only lock");
        } finally {
            held.kill();
        }
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
        fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
});

test("the pkexec lock lives under XDG_RUNTIME_DIR, honored by the caller's environment", async () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-runtime-"));
    addFakePkexec(fakeDirectory);
    try {
        const env = buildEnv(fakeDirectory, { timeout: 5, runtimeDir });
        env.FAKE_TAILSCALE_STDERR = "Access denied: must be root";
        env.FAKE_TAILSCALE_EXIT = "1";
        env.FAKE_TAILSCALE_ELEVATED_STDOUT = "[]";
        const result = await spawnAsync(["profiles"], env);
        assert.equal(result.status, 0);
        assert.ok(fs.existsSync(path.join(runtimeDir, "df-tailscale-pkexec.lock")));
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
        fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
});

test("each operation stops waiting after DF_TAILSCALE_TIMEOUT, direct or elevated", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    addFakePkexec(fakeDirectory);
    try {
        const directTimeout = runProfiles(fakeDirectory, {
            sleep: "0.5",
            timeout: "0.1",
        });
        assert.equal(directTimeout.status, 5);
        assert.doesNotMatch(directTimeout.stderr, /sudo|--operator/i);

        const elevatedTimeout = runProfiles(fakeDirectory, {
            stderr: "Access denied: must be root",
            exitCode: 1,
            timeout: "0.2",
            pkexecSleep: "1",
        });
        assert.equal(elevatedTimeout.status, 5);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the timeout duration is injectable and defaults sanely -- a slow answer inside it still succeeds", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        const result = runProfiles(fakeDirectory, {
            stdout: "[]",
            sleep: "0.05",
            timeout: "2",
        });
        assert.equal(result.status, 0);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a Profile stuck on browser authentication is recognized from tailscale's own wording, not an exit code", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        const result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"NeedsLogin"}',
            upStderr: "To authenticate, visit:\n\n\thttps://login.tailscale.com/a/0123456789abcdef\n",
            upExitCode: 1,
        });
        assert.equal(result.status, 1, "the boundary itself still reports a plain failure");
        assert.match(result.stderr, /to authenticate, visit/i);

        const classified = Model.classifyAction(result.status, result.stdout, result.stderr);
        assert.equal(classified.state, "authentication-required");
        assert.equal(classified.message, "This Profile needs authentication");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the model classifies df-tailscale's new exit codes distinctly from every existing one", () => {
    assert.equal(Model.classifyAction(0, "Success.", "").state, "ok");
    assert.equal(Model.classifyAction(1, "", "no such profile").state, "failure");
    assert.equal(Model.classifyAction(3, "", "").state, "unsupported");
    assert.equal(Model.classifyAction(4, "", "").state, "permission-cancelled");
    assert.equal(Model.classifyAction(5, "", "").state, "timeout");

    const states = new Set([0, 1, 3, 4, 5].map(code => Model.classifyAction(code, "", "x").state));
    assert.equal(states.size, 5, "every exit code must map to its own distinct state");
});

test("classified messages never carry tailscale's own operator/sudo advice", () => {
    const permission = Model.classifyAction(4, "", "");
    assert.doesNotMatch(permission.message, /sudo|--operator/i);

    const timeout = Model.classifyAction(5, "", "");
    assert.doesNotMatch(timeout.message, /sudo|--operator/i);

    const failure = Model.classifyAction(
        1,
        "",
        "some real failure\nUse 'sudo tailscale up'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.",
    );
    assert.doesNotMatch(failure.message, /sudo|--operator/i);
    assert.match(failure.message, /some real failure/);

    const profilesDaemonFailure = Model.classifyProfiles(
        1,
        "",
        "failed to connect to local tailscaled\nUse 'sudo tailscale switch --list --json'.",
    );
    assert.doesNotMatch(profilesDaemonFailure.message, /sudo/i);
    assert.match(profilesDaemonFailure.message, /failed to connect to local tailscaled/);
});

test("df-tailscale never runs `tailscale set --operator`, installs no passwordless rule, and changes no polkit policy", () => {
    const source = fs.readFileSync(tailscaleCommand, "utf8");
    assert.doesNotMatch(source, /set\s+--operator/);
    assert.doesNotMatch(source, /NOPASSWD/i);
    assert.doesNotMatch(source, /\/etc\/sudoers|polkit-1\/(actions|rules\.d)/);
});

test("a live invocation, elevated or not, never runs `tailscale set --operator` even when permission is denied", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    const logFile = path.join(fakeDirectory, "log");
    addFakePkexec(fakeDirectory);
    try {
        runProfiles(fakeDirectory, {
            stderr: "Access denied: must be root",
            exitCode: 1,
            elevatedStdout: "[]",
            logFile,
        });
        for (const invocation of readLog(logFile)) {
            assert.doesNotMatch(invocation, /--operator/);
        }
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("a browser-authentication wait that outlives the timeout still reads as needing authentication", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    try {
        const result = runConnect(fakeDirectory, {
            statusStdout: '{"BackendState":"NeedsLogin"}',
            upStderr: "To authenticate, visit:\n\n\thttps://login.tailscale.com/a/0123456789abcdef\n",
            upBlock: "1",
            timeout: "0.3",
        });

        assert.equal(result.status, 5, "the boundary still reports its timeout exit code");
        assert.match(
            result.stderr,
            /to authenticate, visit/i,
            "tailscale's own output must survive the kill, or a Profile waiting on a "
            + "browser login is indistinguishable from a stalled daemon",
        );

        const classified = Model.classifyAction(result.status, result.stdout, result.stderr);
        assert.equal(classified.state, "authentication-required");
        assert.equal(classified.message, "This Profile needs authentication");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("`profiles --no-elevate` refuses to prompt: a permission denial stops at exit 4, pkexec untouched", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    addFakePkexec(fakeDirectory);
    const pkexecLog = path.join(fakeDirectory, "pkexec-log");
    try {
        const result = runProfiles(fakeDirectory, {
            extraArgs: ["--no-elevate"],
            stderr: "Access denied: profiles access denied\n\nUse 'sudo tailscale switch --list --json'.",
            exitCode: 1,
            pkexecLog,
        });

        assert.equal(result.status, 4);
        assert.equal(
            fs.existsSync(pkexecLog),
            false,
            "the refresh that follows an authenticated switch must not charge a second password",
        );
        assert.doesNotMatch(result.stderr, /--operator/i);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("`profiles --no-elevate` still returns a list when the unprivileged call succeeds", () => {
    const fakeDirectory = fakeTailscaleDirectory();
    addFakePkexec(fakeDirectory);
    const pkexecLog = path.join(fakeDirectory, "pkexec-log");
    try {
        const result = runProfiles(fakeDirectory, {
            extraArgs: ["--no-elevate"],
            stdout: '[{"id":"p1","tailnet":"one.ts.net","account":"a@example.com","nickname":"","selected":true}]',
            pkexecLog,
        });

        assert.equal(result.status, 0);
        assert.equal(Model.classifyProfiles(result.status, result.stdout, result.stderr).state, "ready");
        assert.equal(fs.existsSync(pkexecLog), false);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the daemon's current Tailnet moves the marker when the listing could not be refreshed", () => {
    const profiles = Model.normalizeProfiles([
        { id: "p1", tailnet: "one.ts.net", account: "a@example.com", selected: true },
        { id: "p2", tailnet: "two.ts.net", account: "b@example.com", selected: false },
    ]);

    const moved = Model.withCurrentTailnet(profiles, "two.ts.net");
    assert.deepStrictEqual(moved.map(p => p.current), [false, true]);
    assert.deepStrictEqual(
        moved.map(p => p.label),
        profiles.map(p => p.label),
        "confirming the marker must not disturb the retained list",
    );

    // nothing confirmed yet, or a name that matches no Profile: a stale
    // marker beats a guessed one
    assert.deepStrictEqual(Model.withCurrentTailnet(profiles, "").map(p => p.current), [true, false]);
    assert.deepStrictEqual(Model.withCurrentTailnet(profiles, "other.ts.net").map(p => p.current), [true, false]);

    // two Profiles on one Tailnet cannot be told apart by Tailnet alone
    const shared = Model.normalizeProfiles([
        { id: "p1", tailnet: "one.ts.net", account: "a@example.com", selected: true },
        { id: "p2", tailnet: "one.ts.net", account: "b@example.com", selected: false },
    ]);
    assert.deepStrictEqual(Model.withCurrentTailnet(shared, "one.ts.net").map(p => p.current), [true, false]);
});
