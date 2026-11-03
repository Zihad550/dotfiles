const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "bin/df-dev-db");
const COMPOSE = path.join(ROOT, "scripts/containers/dev-databases/compose.yml");

test("database launcher creates a private credential file and uses rootless compose", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-db-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    const calls = path.join(root, "docker-calls");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "openssl"), "#!/usr/bin/env bash\nprintf '%s\\n' 0123456789abcdef0123456789abcdef0123456789abcdef\n");
    fs.writeFileSync(path.join(bin, "docker"), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "${calls}"
`);
    fs.chmodSync(path.join(bin, "openssl"), 0o755);
    fs.chmodSync(path.join(bin, "docker"), 0o755);

    const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, XDG_STATE_HOME: path.join(root, "state") };
    const result = childProcess.spawnSync(SCRIPT, ["up", "postgres"], { env, encoding: "utf8" });
    assert.strictEqual(result.status, 0, result.stderr);

    const envFile = path.join(root, "state/dotfiles/dev-databases/env");
    assert.strictEqual(fs.statSync(envFile).mode & 0o777, 0o600);
    assert.match(fs.readFileSync(envFile, "utf8"), /^POSTGRES_PASSWORD=/m);
    const invocation = fs.readFileSync(calls, "utf8");
    assert.match(invocation, /compose --project-name dotfiles-dev-db/);
    assert.match(invocation, /--profile postgres up -d postgres/);
    assert.doesNotMatch(invocation, /sudo/);
});

test("all database ports bind to loopback and all services keep named volumes", () => {
    const compose = fs.readFileSync(COMPOSE, "utf8");
    for (const database of ["postgres", "mysql", "mariadb", "redis", "mongo", "mssql"])
        assert.match(compose, new RegExp(`  ${database}:\\n[\\s\\S]*?profiles: \\[${database}\\]`));
    assert.strictEqual((compose.match(/127\.0\.0\.1:/g) || []).length, 6);
    assert.strictEqual((compose.match(/-data:\/|data:\/var/g) || []).length >= 6, true);
});

test("rendered healthchecks expand container passwords and use image-compatible paths", (t) => {
    const probe = childProcess.spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
    if (probe.status !== 0) return t.skip("Docker Compose is not installed");

    const password = 'Df!9 space"$value';
    const env = { ...process.env };
    for (const name of ["POSTGRES_PASSWORD", "MYSQL_ROOT_PASSWORD", "MYSQL_PASSWORD",
        "MARIADB_ROOT_PASSWORD", "MARIADB_PASSWORD", "REDIS_PASSWORD", "MONGO_PASSWORD", "MSSQL_PASSWORD"])
        env[name] = password;
    const rendered = childProcess.spawnSync("docker", ["compose", "--env-file", "/dev/null",
        "-f", COMPOSE, "--profile", "*", "config", "--format", "json"], { env, encoding: "utf8" });
    assert.strictEqual(rendered.status, 0, rendered.stderr);
    const { services } = JSON.parse(rendered.stdout);
    assert.ok(services.postgres.volumes.some(volume => volume.target === "/var/lib/postgresql"));
    assert.ok(services.mssql.healthcheck.test[1].startsWith("/opt/mssql-tools/bin/sqlcmd "));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-db-health-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const client of ["mysqladmin", "redis-cli", "mongosh", "sqlcmd"])
        fs.writeFileSync(path.join(root, client), `#!/bin/sh\nprintf '%s\\0' "$@"\n`, { mode: 0o755 });

    for (const name of ["mysql", "redis", "mongo", "mssql"]) {
        const service = services[name];
        const command = service.healthcheck.test[1].replaceAll("$$", "$")
            .replace("/opt/mssql-tools/bin/sqlcmd", "sqlcmd");
        const result = childProcess.spawnSync("sh", ["-c", command], {
            env: { ...process.env, ...Object.fromEntries(Object.entries(service.environment).map(([key, value]) => [key, value.replaceAll("$$", "$")])), PATH: `${root}:/usr/bin:/bin` }, encoding: "utf8"
        });
        assert.strictEqual(result.status, 0, `${name}: ${result.stderr}`);
        assert.ok(result.stdout.trim(), `${name}: no client output; ${result.stderr}; ${command}`);
        const args = result.stdout.split("\0").slice(0, -1);
        assert.ok(args.includes(password) || args.includes(`-p${password}`), `${name}: password did not expand`);
    }
});

test("concurrent first launches share one credential set", async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-db-concurrent-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    const calls = path.join(root, "secret-calls");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "openssl"), `#!/bin/sh
printf 'call\\n' >> '${calls}'
sleep 0.02
printf '%s\\n' "$$"
`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, XDG_STATE_HOME: path.join(root, "state") };
    const paths = await Promise.all(Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
        childProcess.execFile(SCRIPT, ["env-file"], { env }, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout.trim());
        });
    })));
    assert.strictEqual(new Set(paths).size, 1);
    assert.strictEqual(fs.readFileSync(calls, "utf8").trim().split("\n").length, 8);
    assert.strictEqual(fs.readFileSync(paths[0], "utf8").trim().split("\n").length, 8);
});

test("failed credential generation leaves no saved credentials", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-db-failure-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "openssl"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const state = path.join(root, "state");
    const result = childProcess.spawnSync(SCRIPT, ["env-file"], {
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, XDG_STATE_HOME: state }, encoding: "utf8"
    });
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(fs.existsSync(path.join(state, "dotfiles/dev-databases/env")), false);
});
