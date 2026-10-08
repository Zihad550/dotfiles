const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const PICKER = path.join(ROOT, "bin/df-capture-region");

test("a tiny smart selection snaps to the smallest window under it", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "capture-region-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);

    fs.writeFileSync(path.join(bin, "hyprctl"), `#!/usr/bin/env bash
case "$1" in
  monitors) printf '%s\n' '[{"focused":true,"x":0,"y":0,"width":1920,"height":1080,"scale":1,"transform":0,"activeWorkspace":{"id":1}}]' ;;
  clients) printf '%s\n' '[{"workspace":{"id":1},"hidden":false,"at":[100,100],"size":[800,600]}]' ;;
  cursorpos) printf '%s\n' '101, 101' ;;
esac
`);
    fs.writeFileSync(path.join(bin, "slurp"), "#!/usr/bin/env bash\ncat >/dev/null\nprintf '%s\\n' '101,101 1x1'\n");
    fs.writeFileSync(path.join(bin, "hyprpicker"), "#!/usr/bin/env bash\nexec sleep 30\n");
    for (const command of ["hyprctl", "slurp", "hyprpicker"])
        fs.chmodSync(path.join(bin, command), 0o755);

    const result = childProcess.spawnSync(PICKER, ["smart"], {
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, XDG_RUNTIME_DIR: root },
        encoding: "utf8"
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), "100,100 800x600");
});

test("Hyprland uses the smart picker for copy and edit screenshots", () => {
    const source = fs.readFileSync(path.join(ROOT, "hypr/.config/hypr/lua/bindings/system.lua"), "utf8");
    assert.match(source, /df-capture-screenshot smart copy/);
    assert.match(source, /df-capture-screenshot smart edit/);
    assert.match(source, /layer\.namespace == "selection"/);
    assert.match(source, /df-capture-region --select-window next/);
});

test("the screenshot keeps the freeze through capture and releases it before Swappy", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "capture-edit-"));
    const freeze = childProcess.spawn("/usr/bin/sleep", ["30"], { stdio: "ignore" });
    t.after(() => {
        freeze.kill();
        fs.rmSync(root, { recursive: true, force: true });
    });

    fs.copyFileSync(path.join(ROOT, "bin/df-capture-screenshot"), path.join(root, "df-capture-screenshot"));
    const commands = {
        "df-capture-region": "printf '%s\\n' \"$FREEZE_PID\" '100,100 800x600'",
        pgrep: "exit 1",
        grim: "kill -0 \"$FREEZE_PID\" || exit 1\ntouch \"$3\"",
        "wl-copy": "cat >/dev/null",
        swappy: `for attempt in {1..50}; do
    if ! kill -0 "$FREEZE_PID" 2>/dev/null; then exit 0; fi
    if [[ $(ps -o stat= -p "$FREEZE_PID") == Z* ]]; then exit 0; fi
    sleep 0.01
done
echo "Freeze overlay still active when Swappy opens" >&2
exit 1`,
    };
    for (const [name, body] of Object.entries(commands)) {
        fs.writeFileSync(path.join(root, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    }

    const result = childProcess.spawnSync(path.join(root, "df-capture-screenshot"), ["smart", "edit"], {
        env: { ...process.env, PATH: `${root}:/usr/bin:/bin`, FREEZE_PID: String(freeze.pid), DF_SCREENSHOT_DIR: root },
        encoding: "utf8",
        timeout: 5000,
    });
    assert.strictEqual(result.status, 0, result.stderr);
});
