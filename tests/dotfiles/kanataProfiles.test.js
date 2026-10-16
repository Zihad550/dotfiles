const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const hasKanata = spawnSync("kanata", ["--version"]).status === 0;

test("Laptop adds 10 ms to every hold time and keeps tap timing", () => {
    const variables = name => Object.fromEntries([...fs.readFileSync(
        path.join(repo, "kanata/.config/kanata", name), "utf8"
    ).matchAll(/(\S+-time)\s+(\d+)/g)].map(([, key, value]) => [key, Number(value)]));
    const original = variables("config.kbd");
    const laptop = variables("laptop.kbd");
    assert.deepEqual(Object.keys(laptop), Object.keys(original));
    for (const [key, value] of Object.entries(original))
        assert.equal(laptop[key], value + (key.includes("hold") ? 10 : 0), key);
});

test("Kanata profiles persist, validate, preserve stopped state, and roll back restart failures and crashes", { skip: !hasKanata }, t => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "kanata-profile-"));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const config = path.join(home, ".config/kanata");
    const active = path.join(home, ".local/state/kanata/active.kbd");
    fs.mkdirSync(path.join(home, "bin"));
    fs.cpSync(path.join(repo, "kanata/.config/kanata"), config, { recursive: true });
    fs.writeFileSync(path.join(home, "bin/systemctl"), `#!/bin/sh
case "$1" in
    show) echo "$HOME/.local/state/kanata/active.kbd" ;;
    is-active) test -f "$HOME/running" ;;
    restart)
        echo restart >> "$HOME/calls"
        test ! -f "$HOME/fail-auth" || exit 1
        rm -f "$HOME/running"
        test ! -f "$HOME/crash" || exit 0
        test ! -f "$HOME/fail" || exit 1
        touch "$HOME/running"
        ;;
    start)
        echo start >> "$HOME/calls"
        test ! -f "$HOME/fail-recovery" || exit 1
        touch "$HOME/running"
        ;;
    *) exit 2 ;;
esac
`, { mode: 0o755 });
    const run = (...args) => spawnSync(path.join(repo, "bin/df-kanata-profile"), args, {
        encoding: "utf8", env: { ...process.env, HOME: home, KANATA_SETTLE_SECONDS: "0", PATH: `${home}/bin:${process.env.PATH}` },
    });
    const success = (...args) => {
        const result = run(...args);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        return result.stdout.trim();
    };
    assert.equal(success("current"), "default");
    success("init");
    assert.equal(fs.readlinkSync(active), path.join(config, "config.kbd"));
    success("laptop");
    assert.equal(success("current"), "laptop");
    assert.equal(fs.existsSync(path.join(home, "calls")), false, "stopped service stays stopped");
    const validate = spawnSync("kanata", ["--check", "-c", active], { encoding: "utf8" });
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    success("init");
    assert.equal(success("current"), "laptop", "setup preserves selection");
    fs.writeFileSync(path.join(home, "running"), "");
    success("default");
    assert.equal(fs.readFileSync(path.join(home, "calls"), "utf8"), "restart\n");
    fs.writeFileSync(path.join(home, "fail"), "");
    const recovered = run("laptop");
    assert.equal(recovered.status, 1);
    assert.match(recovered.stderr, /restored and started the previous profile/);
    assert.ok(fs.existsSync(path.join(home, "running")), "previous service recovered");
    assert.equal(success("current"), "default");
    fs.writeFileSync(path.join(home, "fail-recovery"), "");
    const failedRecovery = run("laptop");
    assert.equal(failedRecovery.status, 1);
    assert.match(failedRecovery.stderr, /recovery also failed/);
    assert.equal(fs.existsSync(path.join(home, "running")), false);
    assert.equal(success("current"), "default");
    for (const name of ["fail", "fail-recovery"])
        fs.rmSync(path.join(home, name));
    fs.writeFileSync(path.join(home, "running"), "");
    fs.writeFileSync(path.join(home, "fail-auth"), "");
    const cancelled = run("laptop");
    assert.equal(cancelled.status, 1);
    assert.match(cancelled.stderr, /previous profile is still running/);
    assert.ok(fs.existsSync(path.join(home, "running")), "cancelled restart leaves Kanata running");
    assert.equal(success("current"), "default");
    fs.rmSync(path.join(home, "fail-auth"));
    fs.writeFileSync(path.join(home, "crash"), "");
    const crashed = run("laptop");
    assert.equal(crashed.status, 1);
    assert.match(crashed.stderr, /restored and started the previous profile/);
    assert.ok(fs.existsSync(path.join(home, "running")), "crashed profile rolls back");
    assert.equal(success("current"), "default");
    assert.deepEqual(fs.readdirSync(path.dirname(active)).filter(name => name.startsWith(".profile.")), []);
    fs.writeFileSync(path.join(config, "laptop.kbd"), "invalid");
    assert.equal(run("laptop").status, 1);
    assert.equal(success("current"), "default");
    assert.equal(run("unknown").status, 1);
    assert.equal(fs.readFileSync(path.join(home, "calls"), "utf8"), "restart\nrestart\nstart\nrestart\nstart\nrestart\nrestart\nstart\n");
});
