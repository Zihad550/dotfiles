// Process-level tests for df-default-app. The fake desktop directory keeps
// host-installed applications out of the fixture.

const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const COMMAND = path.join(ROOT, "bin/df-default-app");
const REGISTRY = path.join(ROOT, "dotfiles/.config/dotfiles/default-apps.json");

function fixture(t, options = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "default-apps-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));

    const bin = path.join(home, "bin");
    const desktop = path.join(home, "applications");
    const config = path.join(home, ".config/dotfiles");
    const state = path.join(home, ".local/state/dotfiles/default-apps");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(desktop, { recursive: true });
    fs.mkdirSync(config, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    fs.copyFileSync(REGISTRY, path.join(config, "default-apps.json"));

    for (const name of options.desktop || ["app.zen_browser.zen.desktop", "org.gnome.Nautilus.desktop"])
        fs.writeFileSync(path.join(desktop, name), "[Desktop Entry]\n");

    const xdgLog = path.join(home, "xdg.log");
    fs.writeFileSync(path.join(bin, "xdg-settings"), `#!/usr/bin/env bash
if [[ "$1" == get ]]; then
    cat "${path.join(home, "xdg-browser")}" 2>/dev/null || true
else
    printf 'settings %s\\n' "$*" >> "${xdgLog}"
    printf '%s\\n' "$3" > "${path.join(home, "xdg-browser")}"
fi
`);
    fs.writeFileSync(path.join(bin, "xdg-mime"), `#!/usr/bin/env bash
if [[ "$1" == query ]]; then
    cat "${path.join(home, "xdg-directory")}" 2>/dev/null || true
else
    printf 'mime %s\\n' "$*" >> "${xdgLog}"
    printf '%s\\n' "$2" > "${path.join(home, "xdg-directory")}"
fi
`);
    fs.writeFileSync(path.join(bin, "yazi"), "#!/usr/bin/env bash\nexit 0\n");
    for (const name of ["xdg-settings", "xdg-mime", "yazi"])
        fs.chmodSync(path.join(bin, name), 0o755);

    if (options.browser)
        fs.writeFileSync(path.join(home, "xdg-browser"), options.browser + "\n");
    if (options.directory)
        fs.writeFileSync(path.join(home, "xdg-directory"), options.directory + "\n");

    function run(...args) {
        return childProcess.spawnSync(COMMAND, args, {
            env: {
                ...process.env,
                HOME: home,
                PATH: `${bin}:/usr/bin:/bin`,
                XDG_CONFIG_HOME: path.join(home, ".config"),
                XDG_STATE_HOME: path.join(home, ".local/state"),
                DF_DEFAULT_APP_DESKTOP_DIRS: desktop
            },
            encoding: "utf8"
        });
    }

    return { home, state, xdgLog, run };
}

test("list offers only installed candidates for each role", t => {
    const harness = fixture(t);
    const result = harness.run("list");

    assert.strictEqual(result.status, 0, result.stderr);
    const listing = JSON.parse(result.stdout);
    assert.deepStrictEqual(listing.roles[0].candidates.map(candidate => candidate.key), ["zen"]);
    assert.deepStrictEqual(listing.roles[1].candidates.map(candidate => candidate.key), ["nautilus"]);
    assert.deepStrictEqual(listing.roles[2].candidates.map(candidate => candidate.key), ["nautilus", "yazi"]);
});

test("browser candidates use the icon names declared by their desktop entries", t => {
    const harness = fixture(t, {
        desktop: [
            "helium.desktop",
            "brave-browser.desktop",
            "org.gnome.Nautilus.desktop"
        ]
    });
    const result = harness.run("list");

    assert.strictEqual(result.status, 0, result.stderr);
    const browsers = JSON.parse(result.stdout).roles[0].candidates;
    assert.deepStrictEqual(
        browsers.map(candidate => [candidate.key, candidate.icon]),
        [["helium", "helium-browser"], ["brave", "brave-desktop"]]
    );
});

test("set writes the selection and the matching XDG default", t => {
    const harness = fixture(t);
    const result = harness.run("set", "browser", "zen");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(fs.readFileSync(path.join(harness.state, "browser"), "utf8"), "zen\n");
    assert.match(fs.readFileSync(harness.xdgLog, "utf8"), /settings set default-web-browser app\.zen_browser\.zen\.desktop/);
    assert.strictEqual(result.stdout.trim(), "zen");
});

test("an installed Brave browser is listed and can become the XDG default", t => {
    const harness = fixture(t, {
        desktop: ["brave-browser.desktop", "org.gnome.Nautilus.desktop"]
    });

    const listingResult = harness.run("list");
    assert.strictEqual(listingResult.status, 0, listingResult.stderr);
    const listing = JSON.parse(listingResult.stdout);
    assert.deepStrictEqual(listing.roles[0].candidates.map(candidate => candidate.key), ["brave"]);

    const setResult = harness.run("set", "browser", "brave");
    assert.strictEqual(setResult.status, 0, setResult.stderr);
    assert.strictEqual(fs.readFileSync(path.join(harness.state, "browser"), "utf8"), "brave\n");
    assert.match(fs.readFileSync(harness.xdgLog, "utf8"), /settings set default-web-browser brave-browser\.desktop/);
});

test("set refuses an unavailable candidate and leaves the selection alone", t => {
    const harness = fixture(t);
    fs.writeFileSync(path.join(harness.state, "browser"), "zen\n");

    const result = harness.run("set", "browser", "chromium");

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /not installed/);
    assert.strictEqual(fs.readFileSync(path.join(harness.state, "browser"), "utf8"), "zen\n");
});

test("a stale saved selection falls back to XDG and reports the stale key", t => {
    const harness = fixture(t, { browser: "app.zen_browser.zen.desktop" });
    fs.writeFileSync(path.join(harness.state, "browser"), "chromium\n");

    const result = harness.run("get", "browser");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), "zen");
    assert.match(result.stderr, /stale selection for browser: chromium/);
});

test("an absent file-manager selection falls back through the directory handler", t => {
    const harness = fixture(t, { directory: "org.gnome.Nautilus.desktop" });
    const result = harness.run("get", "file-manager");

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), "nautilus");
});

test("a stale directory handler does not fall through to an unrelated role", t => {
    const harness = fixture(t);
    fs.writeFileSync(path.join(harness.state, "directory-handler"), "chromium\n");

    const result = harness.run("get", "directory-handler");

    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /no installed candidate resolves role directory-handler/);
});
