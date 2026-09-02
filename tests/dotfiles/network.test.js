const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const statusCommand = path.join(repoRoot, "bin/df-network-status");
const commandPresentCommand = path.join(repoRoot, "bin/df-cmd-present");
const wiredCommand = path.join(repoRoot, "bin/df-network-wired");
const wifiCommand = path.join(repoRoot, "bin/df-network-wifi");
const bandCommand = path.join(repoRoot, "bin/df-network-band");
const dnsCommand = path.join(repoRoot, "bin/df-network-dns");
const qrCommand = path.join(repoRoot, "bin/df-network-qr");
const passwordCommand = path.join(repoRoot, "bin/df-network-password");
const speedTestCommand = path.join(repoRoot, "bin/df-network-speedtest");
const Network = require("../../quickshell/.config/quickshell/dotfiles/modules/lib/network.js");

function fakeCommandDirectory(ipOutput, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-"));
    const ip = path.join(directory, "ip");
    fs.writeFileSync(ip, `#!/bin/sh
case "$*" in
  *"-j route get"*) printf '%s\\n' '${ipOutput.jsonRoute}' ;;
  *"route get"*) printf '%s\\n' '${ipOutput.route}' ;;
  *"-j addr show"*) printf '%s\\n' '[{"addr_info":[{"family":"inet","prefixlen":24}]}]' ;;
  *) exit 1 ;;
esac
`);
    fs.chmodSync(ip, 0o755);
    if (options.commandPresent !== false) {
        const commandPresent = path.join(directory, "df-cmd-present");
        fs.writeFileSync(commandPresent, "#!/bin/sh\nexit 0\n");
        fs.chmodSync(commandPresent, 0o755);
    }
    const ping = path.join(directory, "ping");
    fs.writeFileSync(ping, "#!/bin/sh\nprintf '%s\\n' '64 bytes from probe: time=5.0 ms'\n");
    fs.chmodSync(ping, 0o755);
    const iw = path.join(directory, "iw");
    fs.writeFileSync(iw, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(iw, 0o755);
    return directory;
}

function runStatus(fakeDirectory, args = []) {
    return childProcess.spawnSync(statusCommand, args, {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeDirectory}:/usr/bin:/bin` },
        encoding: "utf8"
    });
}

function runStatusWithRepositoryHelpers(fakeDirectory, args = []) {
    return childProcess.spawnSync(statusCommand, args, {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeDirectory}:${path.join(repoRoot, "bin")}:/usr/bin:/bin` },
        encoding: "utf8"
    });
}

function fakeNetworkManagerDirectory(profileOutput = "") {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-manager-"));
    const nmcli = path.join(directory, "nmcli");
    fs.writeFileSync(nmcli, `#!/bin/sh
printf '%s\\n' "$*" > "$FAKE_NMCLI_ARGS"
printf '%s\\n' '${profileOutput}'
`);
    fs.chmodSync(nmcli, 0o755);
    return directory;
}

function runWired(fakeDirectory, args, argsFile) {
    return childProcess.spawnSync(wiredCommand, args, {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeDirectory}:/usr/bin:/bin`, FAKE_NMCLI_ARGS: argsFile },
        encoding: "utf8"
    });
}

function fakeWifiManagerDirectory(options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-wifi-manager-"));
    const nmcli = path.join(directory, "nmcli");
    fs.writeFileSync(nmcli, `#!/bin/sh
printf '%s\n' "$*" >> "$WIFI_NMCLI_ARGS"
case "$*" in
  *"connection edit"*)
    while IFS= read -r line; do
        printf '%s\n' "$line" >> "$WIFI_NMCLI_STDIN"
        case "$line" in *quit*) break;; esac
    done
    ;;
esac
if [ -n "$WIFI_NMCLI_STDIN" ] && [ ! -e "$WIFI_NMCLI_STDIN" ]; then
    : > "$WIFI_NMCLI_STDIN"
fi
case "$*" in
  *"connection up"*)
    exit ${options.failUp ? 1 : 0}
    ;;
esac
exit 0
`);
    fs.chmodSync(nmcli, 0o755);
    return directory;
}

function runWifi(fakeDirectory, args, input, options = {}) {
    const argsFile = path.join(fakeDirectory, "args");
    const stdinFile = path.join(fakeDirectory, "stdin");
    const result = childProcess.spawnSync(wifiCommand, args, {
        cwd: repoRoot,
        input,
        env: {
            ...process.env,
            PATH: `${fakeDirectory}:/usr/bin:/bin`,
            WIFI_NMCLI_ARGS: argsFile,
            WIFI_NMCLI_STDIN: stdinFile,
        },
        encoding: "utf8",
    });
    return {
        result,
        args: fs.existsSync(argsFile) ? fs.readFileSync(argsFile, "utf8") : "",
        stdin: fs.existsSync(stdinFile) ? fs.readFileSync(stdinFile, "utf8") : "",
    };
}

function fakeBandManagerDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-band-"));
    const ip = path.join(directory, "ip");
    fs.writeFileSync(ip, `#!/bin/sh
case "$*" in
  *"route get"*) printf '%s\\n' "$BAND_ROUTE" ;;
  *) exit 1 ;;
esac
`);
    fs.chmodSync(ip, 0o755);

    const iw = path.join(directory, "iw");
    fs.writeFileSync(iw, `#!/bin/sh
printf '%s\\n' "SSID: $BAND_SSID" "freq: $BAND_FREQ"
`);
    fs.chmodSync(iw, 0o755);

    const nmcli = path.join(directory, "nmcli");
    fs.writeFileSync(nmcli, `#!/bin/sh
printf '%s\\n' "$*" >> "$BAND_NMCLI_ARGS"
case "$*" in
  *"-g DEVICE,TYPE,STATE device status"*) printf '%s\\n' "$BAND_DEVICE_ROWS" ;;
  *"-g GENERAL.CONNECTION device show wlan0"*) printf '%s\\n' "$BAND_PROFILE0" ;;
  *"-g GENERAL.CONNECTION device show wlan1"*) printf '%s\\n' "$BAND_PROFILE1" ;;
  *"-g GENERAL.CONNECTION device show"*) printf '%s\\n' "$BAND_PROFILE0" ;;
  *"-g connection.autoconnect-priority connection show"*)
    case "$*" in
      *"Office"*) printf '%s\\n' "$BAND_OFFICE_PRIORITY" ;;
      *) printf '%s\\n' "$BAND_BACKUP_PRIORITY" ;;
    esac
    ;;
  *"-g FREQ,SSID dev wifi list"*) printf '%s\\n' "$BAND_SCAN" ;;
  *"-g 802-11-wireless.band connection show"*) printf '%s\\n' "$BAND_PREVIOUS" ;;
  *"connection modify"*) printf '%s\\n' "$*" >> "$BAND_MODIFY_ARGS" ;;
  *"connection up"*)
    count=$(wc -l < "$BAND_UP_ARGS" 2>/dev/null || printf '0')
    printf '%s\\n' "$*" >> "$BAND_UP_ARGS"
    if [ "$BAND_FAIL_UP" = 1 ] && [ "$count" -eq 0 ]; then exit 1; fi
    ;;
  *) ;;
esac
exit 0
`);
    fs.chmodSync(nmcli, 0o755);
    return directory;
}

function runBand(fakeDirectory, args, options = {}) {
    const env = {
        ...process.env,
        PATH: `${fakeDirectory}:/usr/bin:/bin`,
        BAND_ROUTE: options.route || "",
        BAND_SSID: options.ssid || "Office:Guest\\Zone",
        BAND_FREQ: options.frequency || "5745 MHz",
        BAND_DEVICE_ROWS: options.devices || "wlan0:wifi:connected:Office",
        BAND_PROFILE0: options.profile0 || options.profile || "Office:Guest\\Zone",
        BAND_PROFILE1: options.profile1 || options.profile || "Office:Guest\\Zone",
        BAND_OFFICE_PRIORITY: String(options.officePriority ?? 0),
        BAND_BACKUP_PRIORITY: String(options.backupPriority ?? 0),
        BAND_SCAN: options.scan || "2412:Office:Guest\\Zone\n5745:Office:Guest\\Zone",
        BAND_PREVIOUS: options.previous || "a",
        BAND_FAIL_UP: options.failUp ? "1" : "0",
        BAND_NMCLI_ARGS: path.join(fakeDirectory, "nmcli-args"),
        BAND_MODIFY_ARGS: path.join(fakeDirectory, "modify-args"),
        BAND_UP_ARGS: path.join(fakeDirectory, "up-args"),
    };
    const result = childProcess.spawnSync(bandCommand, args, {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
    return {
        result,
        nmcli: fs.existsSync(env.BAND_NMCLI_ARGS) ? fs.readFileSync(env.BAND_NMCLI_ARGS, "utf8") : "",
        modified: fs.existsSync(env.BAND_MODIFY_ARGS) ? fs.readFileSync(env.BAND_MODIFY_ARGS, "utf8") : "",
        activated: fs.existsSync(env.BAND_UP_ARGS) ? fs.readFileSync(env.BAND_UP_ARGS, "utf8") : "",
    };
}

function fakeDnsManagerDirectory(options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-dns-"));
    const nmcli = path.join(directory, "nmcli");
    fs.writeFileSync(nmcli, `#!/bin/sh
printf '%s\n' "$*" >> "$DNS_NMCLI_ARGS"
case "$*" in
  "-g GENERAL.CONNECTION device show eth0") printf '%s\n' "Office" ;;
  "-g GENERAL.STATE device show eth0") printf '%s\n' "100 (connected)" ;;
  "-g connection.uuid connection show Office") printf '%s\n' "uuid-route" ;;
  "-g connection.id connection show uuid uuid-route") printf '%s\n' "Office" ;;
  *"-g ipv4.ignore-auto-dns connection show uuid uuid-route"*) printf '%s\n' "${options.ignore4 || "yes"}" ;;
  *"-g ipv4.dns connection show uuid uuid-route"*) printf '%s\n' "${options.dns4 || "1.1.1.1 1.0.0.1"}" ;;
  *"-g ipv6.ignore-auto-dns connection show uuid uuid-route"*) printf '%s\n' "${options.ignore6 || "yes"}" ;;
  *"-g ipv6.dns connection show uuid uuid-route"*) printf '%s\n' "${options.dns6 || "2606:4700:4700::1111 2606:4700:4700::1001"}" ;;
  *"connection modify uuid uuid-route"*)
    if [ "${options.failModify ? "1" : "0"}" = 1 ]; then
      echo "Not authorized to perform this operation" >&2
      exit 1
    fi
    ;;
  *"connection up uuid uuid-route ifname eth0"*)
    if [ "${options.failUp ? "1" : "0"}" = 1 ]; then
      echo "connection activation failed" >&2
      exit 1
    fi
    ;;
  *"device reapply eth0"*)
    if [ "${options.failRollback ? "1" : "0"}" = 1 ]; then exit 1; fi
    ;;
  *) ;;
esac
exit 0
`);
    fs.chmodSync(nmcli, 0o755);
    return directory;
}

function runDns(fakeDirectory, args, input = "") {
    const env = {
        ...process.env,
        PATH: `${fakeDirectory}:/usr/bin:/bin`,
        DNS_NMCLI_ARGS: path.join(fakeDirectory, "nmcli-args"),
    };
    const result = childProcess.spawnSync(dnsCommand, args, {
        cwd: repoRoot,
        input,
        env,
        encoding: "utf8",
    });
    return {
        result,
        nmcli: fs.existsSync(env.DNS_NMCLI_ARGS)
            ? fs.readFileSync(env.DNS_NMCLI_ARGS, "utf8") : "",
    };
}

function fakeQrDirectory() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-qr-"));
    const nmcli = path.join(directory, "nmcli");
    fs.writeFileSync(nmcli, [
        "#!/bin/sh",
        "printf '%s\\n' \"$*\" >> \"$QR_NMCLI_ARGS\"",
        "case \"$*\" in",
        "  *\"GENERAL.CON-UUID device show\"*) printf '%s\\n' \"test-uuid\" ;;",
        "  *\"connection show uuid\"*) printf '%s' \"$QR_NMCLI_FIELDS\" ;;",
        "  *) exit 1 ;;",
        "esac",
        "",
    ].join("\n"));
    fs.chmodSync(nmcli, 0o755);

    const qrencode = path.join(directory, "qrencode");
    fs.writeFileSync(qrencode, [
        "#!/bin/sh",
        "cat > \"$QR_PAYLOAD_FILE\"",
        "printf '100\\n010\\n001\\n'",
        "",
    ].join("\n"));
    fs.chmodSync(qrencode, 0o755);
    return directory;
}

function runQr(fakeDirectory, args, fields) {
    const payloadFile = path.join(fakeDirectory, "payload");
    fs.rmSync(payloadFile, { force: true });
    const env = {
        ...process.env,
        PATH: `${fakeDirectory}:/usr/bin:/bin`,
        QR_NMCLI_FIELDS: fields,
        QR_NMCLI_ARGS: path.join(fakeDirectory, "nmcli-args"),
        QR_PAYLOAD_FILE: payloadFile,
    };
    const result = childProcess.spawnSync(qrCommand, args, {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
    return {
        result,
        args: fs.existsSync(env.QR_NMCLI_ARGS)
            ? fs.readFileSync(env.QR_NMCLI_ARGS, "utf8") : "",
        payload: fs.existsSync(env.QR_PAYLOAD_FILE)
            ? fs.readFileSync(env.QR_PAYLOAD_FILE, "utf8") : "",
    };
}

function runPassword(fakeDirectory, args, fields) {
    const env = {
        ...process.env,
        PATH: `${fakeDirectory}:/usr/bin:/bin`,
        QR_NMCLI_FIELDS: fields,
        QR_NMCLI_ARGS: path.join(fakeDirectory, "nmcli-args"),
    };
    const result = childProcess.spawnSync(passwordCommand, args, {
        cwd: repoRoot,
        env,
        encoding: "utf8",
    });
    return {
        result,
        args: fs.existsSync(env.QR_NMCLI_ARGS)
            ? fs.readFileSync(env.QR_NMCLI_ARGS, "utf8") : "",
    };
}

function fakeSpeedTestDirectory(statsRoot) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-network-speed-"));
    const interfaceDirectory = path.join(statsRoot, "wlan-test", "statistics");
    fs.mkdirSync(interfaceDirectory, { recursive: true });
    fs.writeFileSync(path.join(interfaceDirectory, "rx_bytes"), "1000\n");
    fs.writeFileSync(path.join(interfaceDirectory, "tx_bytes"), "1000\n");

    const curl = path.join(directory, "curl");
    fs.writeFileSync(curl, `#!/bin/sh
printf '%s\\n' "$*" >> "$SPEED_CURL_LOG"
[ -z "\${SPEED_CURL_PIDS:-}" ] || printf '%s\\n' "$$" >> "$SPEED_CURL_PIDS"
case "$*" in
  *api.fast.com*) printf '%s\\n' '{"targets":[{"url":"https://speed.example/target"}]}' ;;
  *) while :; do sleep 1; done ;;
esac
`);
    fs.chmodSync(curl, 0o755);

    const dd = path.join(directory, "dd");
    fs.writeFileSync(dd, `#!/bin/sh
[ -z "\${SPEED_DD_PIDS:-}" ] || printf '%s\\n' "$$" >> "$SPEED_DD_PIDS"
while :; do printf x; sleep 1; done
`);
    fs.chmodSync(dd, 0o755);

    const jq = path.join(directory, "jq");
    fs.writeFileSync(jq, "#!/bin/sh\nprintf '%s\\n' 'https://speed.example/target'\n");
    fs.chmodSync(jq, 0o755);
    return directory;
}

function runSpeedTest(fakeDirectory, statsRoot, args, options = {}) {
    const log = path.join(fakeDirectory, "curl.log");
    const result = childProcess.spawnSync(speedTestCommand, args, {
        cwd: repoRoot,
        env: {
            ...process.env,
            PATH: `${fakeDirectory}:/usr/bin:/bin`,
            DF_NETWORK_SPEEDTEST_STATS_ROOT: statsRoot,
            SPEED_CURL_LOG: log,
        },
        encoding: "utf8",
        timeout: options.timeout,
    });
    return {
        result,
        curl: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "",
    };
}

// Keep signal delivery in the controller shell so the test can inspect every
// fake traffic process after the helper has reaped its worker children.
function runControlledSpeedTest(fakeDirectory, statsRoot, direction, action) {
    const output = path.join(fakeDirectory, `${direction}-${action}.out`);
    const error = path.join(fakeDirectory, `${direction}-${action}.err`);
    const curlPids = path.join(fakeDirectory, `${direction}-${action}.curl-pids`);
    const ddPids = path.join(fakeDirectory, `${direction}-${action}.dd-pids`);
    const controller = [
        "set -eu",
        "rm -f \"$SPEED_OUTPUT\" \"$SPEED_ERROR\" \"$SPEED_CURL_PIDS\" \"$SPEED_DD_PIDS\"",
        "\"$SPEED_HELPER\" --interface \"$SPEED_INTERFACE\" \"$SPEED_DIRECTION\" >\"$SPEED_OUTPUT\" 2>\"$SPEED_ERROR\" &",
        "helper_pid=$!",
        "for attempt in $(seq 1 100); do",
        "    curl_count=0",
        "    dd_count=0",
        "    [ -f \"$SPEED_CURL_PIDS\" ] && curl_count=$(wc -l < \"$SPEED_CURL_PIDS\") || true",
        "    [ -f \"$SPEED_DD_PIDS\" ] && dd_count=$(wc -l < \"$SPEED_DD_PIDS\") || true",
        "    if [ \"$curl_count\" -ge \"$EXPECTED_CURL_PIDS\" ] && [ \"$dd_count\" -ge \"$EXPECTED_DD_PIDS\" ]; then break; fi",
        "    sleep 0.05",
        "done",
        "[ \"$curl_count\" -ge \"$EXPECTED_CURL_PIDS\" ]",
        "[ \"$dd_count\" -ge \"$EXPECTED_DD_PIDS\" ]",
        "[ \"$SPEED_SAMPLE_WAIT\" = 0 ] || sleep \"$SPEED_SAMPLE_WAIT\"",
        "if [ \"$SPEED_ACTION\" = cancel ]; then",
        "    kill -TERM \"$helper_pid\"",
        "else",
        "    rm -rf \"$SPEED_STATS_ROOT/wlan-test\"",
        "    mkdir -p \"$SPEED_STATS_ROOT/wlan-replacement/statistics\"",
        "    printf '9000\\n' > \"$SPEED_STATS_ROOT/wlan-replacement/statistics/rx_bytes\"",
        "    printf '9000\\n' > \"$SPEED_STATS_ROOT/wlan-replacement/statistics/tx_bytes\"",
        "fi",
        "for attempt in $(seq 1 100); do",
        "    kill -0 \"$helper_pid\" 2>/dev/null || break",
        "    sleep 0.05",
        "done",
        "kill -0 \"$helper_pid\" 2>/dev/null && kill -KILL \"$helper_pid\" || true",
        "set +e",
        "wait \"$helper_pid\"",
        "helper_status=$?",
        "set -e",
        "all_gone=0",
        "for attempt in $(seq 1 100); do",
        "    all_gone=1",
        "    for pid_file in \"$SPEED_CURL_PIDS\" \"$SPEED_DD_PIDS\"; do",
        "        [ -f \"$pid_file\" ] || continue",
        "        while IFS= read -r pid; do",
        "            [ -n \"$pid\" ] || continue",
        "            if kill -0 \"$pid\" 2>/dev/null; then all_gone=0; fi",
        "        done < \"$pid_file\"",
        "    done",
        "    [ \"$all_gone\" -eq 1 ] && break",
        "    sleep 0.05",
        "done",
        "printf 'helper_status=%s\\n' \"$helper_status\"",
        "printf 'all_gone=%s\\n' \"$all_gone\"",
    ].join("\n");
    const result = childProcess.spawnSync("/bin/bash", ["-c", controller], {
        cwd: repoRoot,
        env: {
            ...process.env,
            PATH: `${fakeDirectory}:/usr/bin:/bin`,
            DF_NETWORK_SPEEDTEST_STATS_ROOT: statsRoot,
            SPEED_CURL_LOG: path.join(fakeDirectory, "curl.log"),
            SPEED_CURL_PIDS: curlPids,
            SPEED_DD_PIDS: ddPids,
            SPEED_HELPER: speedTestCommand,
            SPEED_INTERFACE: "wlan-test",
            SPEED_DIRECTION: direction,
            SPEED_ACTION: action,
            SPEED_OUTPUT: output,
            SPEED_ERROR: error,
            SPEED_STATS_ROOT: statsRoot,
            EXPECTED_CURL_PIDS: "9",
            EXPECTED_DD_PIDS: direction === "up" ? "8" : "0",
            SPEED_SAMPLE_WAIT: action === "cancel" ? "1.1" : "0",
        },
        encoding: "utf8",
        timeout: 10000,
    });
    return {
        result,
        output: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "",
        error: fs.existsSync(error) ? fs.readFileSync(error, "utf8") : "",
        curl: fs.existsSync(path.join(fakeDirectory, "curl.log"))
            ? fs.readFileSync(path.join(fakeDirectory, "curl.log"), "utf8") : "",
    };
}

test("Wi-Fi sharing helpers are repository-owned, pinned, and executable", () => {
    const provenance = fs.readFileSync(
        path.join(repoRoot, "setup/common/network/PROVENANCE.md"), "utf8"
    );
    for (const helper of [qrCommand, passwordCommand]) {
        assert.equal(fs.statSync(helper).mode & 0o111, 0o111);
        const source = fs.readFileSync(helper, "utf8");
        assert.doesNotMatch(source, /resources\/omarchy/);
        const digest = crypto.createHash("sha256").update(source).digest("hex");
        assert.match(provenance, new RegExp(digest));
    }
});

test("Wi-Fi QR helper escapes payload values and keeps the password out of argv", t => {
    const fakeDirectory = fakeQrDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));
    const check = runQr(fakeDirectory, ["--check"], "");
    assert.equal(check.result.status, 0, check.result.stderr);
    assert.equal(check.args, "");
    const password = "p,a:ss;word\\42";
    const run = runQr(fakeDirectory, ["--meta", "wlan0"],
        `Cafe;Guest\\5G\nwpa-psk\n${password}\nno\n`);

    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /^meta\twlan0\tWPA\tCafe;Guest\\5G\n/);
    assert.equal(run.payload,
        "WIFI:T:WPA;S:Cafe\\;Guest\\\\5G;P:p\\,a\\:ss\\;word\\\\42;;");
    assert.doesNotMatch(run.args, /p,a:ss/);
    assert.equal(run.result.stderr, "");
});

test("Wi-Fi QR helper supports open, WEP, hidden, and rejects enterprise profiles", t => {
    const fakeDirectory = fakeQrDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    let run = runQr(fakeDirectory, ["--meta", "wlan0"], "Cafe Open\nnone\n\nno\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /^meta\twlan0\tnopass\tCafe Open\n/);
    assert.match(run.payload, /WIFI:T:nopass;S:Cafe Open;P:;;/);

    run = runQr(fakeDirectory, ["--meta", "wlan0"], "Hidden\nwpa-psk\nsecret\nyes\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.payload, /H:true/);

    run = runQr(fakeDirectory, ["--meta", "wlan0"], "Old Router\nnone\n\nno\nwep-secret\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /^meta\twlan0\tWEP\tOld Router\n/);
    assert.match(run.payload, /WIFI:T:WEP;S:Old Router;P:wep-secret;;/);

    run = runQr(fakeDirectory, ["wlan0"], "Enterprise\nwpa-eap\nsecret\nno\n");
    assert.notEqual(run.result.status, 0);
    assert.equal(run.result.stderr.trim(),
        "Enterprise Wi-Fi cannot be shared with a password QR code");
    assert.equal(run.payload, "");
});

test("Wi-Fi password helper returns raw WEP and PSK secrets without argv leakage", t => {
    const fakeDirectory = fakeQrDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    const run = runPassword(fakeDirectory, ["wlan0"], "wpa-psk\np,a:ss;word\\42\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.equal(run.result.stdout, "p,a:ss;word\\42\n");
    assert.doesNotMatch(run.args, /p,a:ss/);

    const wep = runPassword(fakeDirectory, ["wlan0"], "none\n\nwep-secret\n");
    assert.equal(wep.result.status, 0, wep.result.stderr);
    assert.equal(wep.result.stdout, "wep-secret\n");

    const enterprise = runPassword(fakeDirectory, ["wlan0"], "wpa-eap\nsecret\n");
    assert.notEqual(enterprise.result.status, 0);
    assert.equal(enterprise.result.stderr.trim(), "Enterprise Wi-Fi has no shareable password");
});

test("Wi-Fi share model parses metadata and preserves password whitespace", () => {
    const parsed = Network.parseQrOutput("meta\twlan1\tWPA\tCafe\tGuest\n100\n010\n001\n");
    assert.deepStrictEqual(parsed.meta, { iface: "wlan1", security: "WPA", ssid: "Cafe\tGuest" });
    assert.deepStrictEqual(parsed.matrix, { rows: ["100", "010", "001"], size: 3 });
    assert.deepStrictEqual(Network.parseQrOutput("meta\twlan0\tWPA\tCafe\n10\n0\n" ).matrix,
        { rows: [], size: 0 });
    assert.equal(Network.stripTrailingLineBreak("  secret  \n"), "  secret  ");
});

test("Network Page shares the selected adapter and drops late Wi-Fi share output", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );
    const overlay = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/WifiShareOverlay.qml"), "utf8"
    );

    assert.match(page, /function shareWifi\(row\)/);
    assert.match(page, /wifiShareOverlay\.open\(iface\)/);
    assert.match(page, /label: "Share Wi-Fi"/);
    assert.match(overlay, /\["df-network-qr", "--meta", interfaceName\]/);
    assert.match(overlay, /\["df-network-password", root\.iface\]/);
    assert.match(overlay, /command: \["wl-copy"\]/);
    assert.match(overlay, /onStreamFinished: if \(!root\.qrExpectedStop\)/);
    assert.match(overlay, /onStreamFinished: if \(root\.opened && !root\.passwordExpectedStop\)/);
    assert.match(overlay, /if \(root\.copyExpectedStop \|\| !root\.opened\)/);
    assert.match(overlay, /root\.password = ""/);
    assert.match(overlay, /root\.pendingShow = false/);
});

test("Wi-Fi credential form flows below its row and vertically centers input text", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );

    assert.match(page, /height: wifiEntry\.promptOpen \? credentialForm\.implicitHeight \+ 16 : 0/);
    assert.match(page, /id: credentialForm[\s\S]*anchors\.top: parent\.top/);
    assert.equal((page.match(/verticalAlignment: TextInput\.AlignVCenter/g) || []).length >= 2, true);
});

test("speed-test progress parsing rejects malformed samples and keeps phases explicit", () => {
    assert.deepStrictEqual(Network.parseSpeedProgress("12.5", "down"), {
        phase: "down",
        mbps: 12.5,
    });
    assert.deepStrictEqual(Network.parseSpeedProgress("progress up 88", "down"), {
        phase: "up",
        mbps: 88,
    });
    assert.equal(Network.parseSpeedProgress("not-a-rate", "down"), null);
    assert.equal(Network.parseSpeedProgress("unexpected 42", "down"), null);
    assert.equal(Network.parseSpeedProgress("progress down 42 extra", "down"), null);
    assert.equal(Network.parseSpeedProgress("-1", "up"), null);
    assert.equal(Network.speedTestFailureLabel("timeout"), "Speed test timed out");
    assert.match(Network.speedTestFailureLabel("route-changed"), /cancelled/);
});

test("speed-test helper pins the interface, cleans workers, and has a pinned digest", t => {
    const statsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-speed-stats-"));
    const fakeDirectory = fakeSpeedTestDirectory(statsRoot);
    t.after(() => fs.rmSync(statsRoot, { recursive: true, force: true }));
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    let run = runSpeedTest(fakeDirectory, statsRoot,
        ["--check", "--interface", "wlan-test"]);
    assert.equal(run.result.status, 0, run.result.stderr);
    run = runSpeedTest(fakeDirectory, statsRoot,
        ["--check", "--interface", "missing"]);
    assert.notEqual(run.result.status, 0);

    const provenance = fs.readFileSync(
        path.join(repoRoot, "setup/common/network/PROVENANCE.md"), "utf8"
    );
    assert.equal(fs.statSync(speedTestCommand).mode & 0o111, 0o111);
    const helper = fs.readFileSync(speedTestCommand, "utf8");
    assert.match(helper, /curl -fsS --interface "\$interface"/);
    assert.match(helper, /--data-binary @-/);
    assert.match(helper, /traffic_pids=\(\)/);
    assert.match(helper, /pkill -TERM -P/);
    assert.match(helper, /--connect-timeout 3 --max-time 10/);
    assert.match(helper, /trap on_signal INT TERM/);
    const digest = crypto.createHash("sha256").update(helper).digest("hex");
    assert.equal(digest,
        "24a7c226183e599bfff7979b347c875ee2f2e61d9041576983c77487c9da01b9");
    assert.match(provenance, new RegExp(digest));
});

test("speed-test fake workers terminate on cancellation and pinned route loss", t => {
    const statsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-speed-lifecycle-"));
    const fakeDirectory = fakeSpeedTestDirectory(statsRoot);
    t.after(() => fs.rmSync(statsRoot, { recursive: true, force: true }));
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    for (const direction of ["down", "up"]) {
        const cancelled = runControlledSpeedTest(fakeDirectory, statsRoot, direction, "cancel");
        assert.equal(cancelled.result.status, 0, cancelled.result.stderr);
        assert.match(cancelled.result.stdout, /helper_status=143/);
        assert.match(cancelled.result.stdout, /all_gone=1/);
        assert.match(cancelled.output, /0\.0/);
        assert.match(cancelled.curl, /--interface wlan-test/);
        assert.doesNotMatch(cancelled.curl, /--interface (wlan0|eth0)/);
    }

    const routeLoss = runControlledSpeedTest(fakeDirectory, statsRoot, "down", "route-loss");
    assert.equal(routeLoss.result.status, 0, routeLoss.result.stderr);
    assert.match(routeLoss.result.stdout, /helper_status=1/);
    assert.match(routeLoss.result.stdout, /all_gone=1/);
    assert.match(routeLoss.error, /Interface wlan-test disappeared/);
});

test("Network Page owns the pinned speed-test lifecycle and full-screen overlay", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );
    const overlay = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/SpeedTestOverlay.qml"), "utf8"
    );

    assert.match(page, /property string speedTestCommand: "df-network-speedtest"/);
    assert.match(page, /\[\s*root\.speedTestCommand,\s*"--check",\s*"--interface",\s*root\.routeInfo\.iface\s*\]/);
    assert.match(page, /label: "Run speed test"/);
    assert.match(page, /root\.speedTestAvailable && !root\.speedTestActionBusy/);
    assert.match(page, /speedTestInterface = root\.routeInfo\.iface/);
    assert.match(page, /speedTestLabel = root\.statusLabel\(\)/);
    assert.match(page, /SplitParser[\s\S]*onRead:\s*root\.updateSpeedTestLine\(data,\s*speedTestProcess\.token\)/);
    assert.doesNotMatch(page, /onRead:\s*root\.updateSpeedTestLine\(line,/);
    assert.match(page, /speedTestProcess\.token === root\.speedTestToken[\s\S]*!root\.speedTestExpectedStop/);
    assert.match(page, /speedTestPhaseTimer/);
    assert.match(page, /speedTestTimeoutTimer/);
    assert.match(page, /Model\.speedTestFailureLabel\("timeout"\)/);
    assert.match(page, /speedTestProcess\.running = false/);
    assert.match(page, /function checkSpeedTestRoute/);
    assert.match(page, /root\.closeSpeedTest\([\s\S]*"route-changed"/);
    assert.match(page, /root\.closeSpeedTest\([\s\S]*"route-lost"/);
    assert.match(page, /root\.closeSpeedTest\("cancelled", true\)/);

    assert.match(overlay, /PanelWindow/);
    assert.match(overlay, /anchors \{ top: true; bottom: true; left: true; right: true \}/);
    assert.match(overlay, /label: "Cancel speed test"/);
    assert.match(overlay, /Run again/);
    assert.match(overlay, /WlrLayershell\.keyboardFocus: WlrKeyboardFocus\.Exclusive/);
});

test("the repository status helper is executable and has no upstream checkout dependency", () => {
    assert.equal(fs.statSync(statusCommand).mode & 0o111, 0o111);
    assert.doesNotMatch(fs.readFileSync(statusCommand, "utf8"), /resources\/omarchy/);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(statusCommand)).digest("hex");
    assert.equal(digest, "cd1bbd6ed810d4a7130124b02df4b0a0b79e908983c07bbc78a48f2078619203");
    assert.match(fs.readFileSync(path.join(repoRoot, "setup/common/network/PROVENANCE.md"), "utf8"), new RegExp(digest));
});

test("df-cmd-present is pinned and available to the status helper", () => {
    assert.equal(fs.statSync(commandPresentCommand).mode & 0o111, 0o111);
    const source = fs.readFileSync(commandPresentCommand);
    const digest = crypto.createHash("sha256").update(source).digest("hex");
    assert.equal(digest, "99aeaaf98adfba9aff39f4452464c082ca91f1f761aede9208c0d239c272e6ff");
    assert.match(
        fs.readFileSync(path.join(repoRoot, "setup/common/network/PROVENANCE.md"), "utf8"),
        new RegExp(digest),
    );
});

test("the repository band helper is executable and pinned to its adapted source", () => {
    assert.equal(fs.statSync(bandCommand).mode & 0o111, 0o111);
    assert.doesNotMatch(fs.readFileSync(bandCommand, "utf8"), /resources\/omarchy/);
    const digest = crypto.createHash("sha256").update(fs.readFileSync(bandCommand)).digest("hex");
    assert.equal(digest, "aa75f25c8f6b7e1325def940f9ae7103688b9429256f3a825508cb075062f834");
    assert.match(fs.readFileSync(path.join(repoRoot, "setup/common/network/PROVENANCE.md"), "utf8"), new RegExp(digest));
});

test("the status helper reports a discovered wired route through its repository name", () => {
    const fakeDirectory = fakeCommandDirectory({
        route: "1.1.1.1 via 192.0.2.1 dev eth-test src 192.0.2.20 uid 1000",
        jsonRoute: '[{"dev":"eth-test","gateway":"192.0.2.1","prefsrc":"192.0.2.20"}]'
    });
    try {
        const result = runStatus(fakeDirectory, ["--verbose"]);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /iface\teth-test/);
        assert.match(result.stdout, /type\tethernet/);
        assert.match(result.stdout, /gateway\t192\.0\.2\.1/);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the real status helper finds df-cmd-present", () => {
    const fakeDirectory = fakeCommandDirectory({
        route: "1.1.1.1 via 192.0.2.1 dev eth-test src 192.0.2.20 uid 1000",
        jsonRoute: '[{"dev":"eth-test","gateway":"192.0.2.1","prefsrc":"192.0.2.20"}]'
    }, { commandPresent: false });
    try {
        const result = runStatusWithRepositoryHelpers(fakeDirectory, ["--verbose"]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.existsSync(path.join(fakeDirectory, "df-cmd-present")), false);
        assert.equal(fs.existsSync(path.join(fakeDirectory, "ping")), true);
        assert.equal(fs.existsSync(path.join(fakeDirectory, "iw")), true);
        assert.match(result.stdout, /iface\teth-test/);
        assert.match(result.stdout, /internet_ping_ms\t5\.0/);
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the status helper reports no route without consulting host network state", () => {
    const fakeDirectory = fakeCommandDirectory({ route: "", jsonRoute: "[]" });
    try {
        const result = runStatus(fakeDirectory);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, "disconnected\t\t\t\n");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("the model classifies compact wired, Wi-Fi, no-route, and malformed reports", () => {
    const wired = Network.parseStatus("ethernet\teth0\t\t\n");
    assert.equal(wired.status, "connected");
    assert.equal(wired.kind, "ethernet");
    assert.equal(wired.iface, "eth0");

    const wifi = Network.parseStatus("wifi\tCafe:Guest\t80\t5745\n");
    assert.equal(wifi.status, "connected");
    assert.equal(wifi.kind, "wifi");
    assert.equal(wifi.ssid, "Cafe:Guest");
    assert.equal(wifi.signal, 80);
    assert.equal(Network.parseStatus("wifi\tCafe:Guest\t80\t5745\twlan0\n").iface, "wlan0");

    assert.equal(Network.parseStatus("disconnected\t\t\t\n").status, "disconnected");
    assert.equal(Network.parseStatus("").reason, "no-route");
    assert.equal(Network.parseStatus("garbage\n").reason, "malformed");
});

test("the model identifies the selected route and resolves wired profile choices", () => {
    const wired = Network.parseStatus([
        "iface\teth0",
        "type\tethernet",
        "ip\t192.0.2.20",
        "gateway\t192.0.2.1",
    ].join("\n"));
    assert.deepStrictEqual(Network.routeAvailability(wired), {
        available: true,
        iface: "eth0",
        kind: "ethernet",
    });
    const simultaneousWifi = Network.parseStatus([
        "iface\twlan0",
        "type\twifi",
        "ssid\tOffice Wi-Fi",
    ].join("\n"));
    assert.deepStrictEqual(Network.routeAvailability(simultaneousWifi), {
        available: true,
        iface: "wlan0",
        kind: "wifi",
    });
    assert.deepStrictEqual(Network.routeAvailability({
        status: "connected",
        kind: "wifi",
        iface: "wlan0",
        routeKind: "ethernet",
        routeIface: "eth0",
    }), {
        available: true,
        iface: "eth0",
        kind: "ethernet",
    });
    assert.equal(Network.routeAvailability(Network.parseStatus("disconnected\t\t\t\n")).available, false);
    assert.equal(Network.stateWithSamples({}, "", 1000).reason, "no-route");

    const profiles = Network.parseWiredProfiles([
        "uuid-a:Office\\:Dock:802-3-ethernet::yes",
        "uuid-b:Backup:802-3-ethernet:eth0:yes",
        "uuid-c:Disabled:802-3-ethernet::no",
        "uuid-d:Home:802-11-wireless::yes",
    ].join("\n"));
    assert.equal(profiles[0].name, "Office:Dock");
    assert.equal(Network.wiredProfileChoice(profiles, "eth0").choice, "multiple");
    assert.equal(Network.wiredProfileChoice(profiles, "eth1").choice, "one");
    assert.equal(Network.wiredProfileChoice(profiles, "eth1").profiles[0].uuid, "uuid-a");
    assert.equal(Network.wiredProfileChoice([], "eth0").choice, "none");
});

test("the model parses the verbose route status and keeps connection fields plain", () => {
    const state = Network.parseStatus([
        "iface\twlan0",
        "ip\t192.0.2.30",
        "prefix\t24",
        "gateway\t192.0.2.1",
        "type\twifi",
        "ssid\tCafe:Guest",
        "freq\t5745",
        "rx_bytes\t1000",
        "tx_bytes\t2000",
        "router_ping_ms\t4.5",
        "internet_ping_ms\t20.1",
    ].join("\n"));

    assert.deepStrictEqual({
        status: state.status,
        iface: state.iface,
        kind: state.kind,
        address: Network.formatAddress(state),
        gateway: state.gateway,
        frequency: Network.formatHeaderFreq(state.frequency),
        routerPingMs: state.routerPingMs,
        internetPingMs: state.internetPingMs,
    }, {
        status: "connected",
        iface: "wlan0",
        kind: "wifi",
        address: "192.0.2.30/24",
        gateway: "192.0.2.1",
        frequency: "5ghz",
        routerPingMs: 4.5,
        internetPingMs: 20.1,
    });
});

test("changing counters produce rates while interface changes reset the sample", () => {
    const first = Network.stateWithSamples({}, "iface\teth0\ntype\tethernet\nrx_bytes\t100\ntx_bytes\t200\n", 1000);
    const second = Network.stateWithSamples(first, "iface\teth0\ntype\tethernet\nrx_bytes\t500\ntx_bytes\t800\n", 2000);
    assert.equal(second.downloadRate, 400);
    assert.equal(second.uploadRate, 600);

    const changed = Network.stateWithSamples(second, "iface\twlan0\ntype\twifi\nrx_bytes\t900\ntx_bytes\t1000\n", 3000);
    assert.equal(changed.downloadRate, 0);
    assert.equal(changed.uploadRate, 0);
    assert.equal(changed.prevIface, "wlan0");
});

test("ping samples retain timeouts, averages, and packet loss", () => {
    const first = Network.stateWithSamples({}, "iface\teth0\ntype\tethernet\ninternet_ping_ms\t10\n", 1000);
    const second = Network.stateWithSamples(first, "iface\teth0\ntype\tethernet\ninternet_ping_ms\tbad\n", 2000);
    assert.equal(second.internetPingSamples.length, 2);
    assert.equal(second.internetPingLatency, 10);
    assert.equal(second.internetPingPacketLoss, 50);
});

test("failure classification distinguishes command failure, malformed output, and no route", () => {
    assert.equal(Network.classifyFailure("ENOENT: df-network-status", 1), "unavailable");
    assert.equal(Network.classifyFailure(null, 1, ""), "command-failed");
    assert.equal(Network.classifyFailure(null, 0, "garbage"), "malformed");
    assert.equal(Network.classifyFailure(null, 0, "disconnected\t\t\t\n"), "");
});

test("wired actions expose pending, cancellation, confirmation, and failure", () => {
    const pending = Network.wiredActionState({ iface: "eth0" }, "reconnect", "pending");
    assert.equal(pending.status, "pending");
    assert.equal(Network.wiredActionState(pending, "reconnect", "cancelled").status, "cancelled");
    assert.equal(Network.wiredActionState(pending, "reconnect", "confirmed").confirmed, true);
    assert.equal(Network.wiredActionState(pending, "reconnect", "failed", undefined, "confirmation-timeout").error, "confirmation-timeout");
    assert.equal(Network.wiredActionState(pending, "reconnect", "pending", 1).status, "failed");
});

test("Wi-Fi projection deduplicates scan churn without retaining live objects", () => {
    const first = Network.projectWifiRows([
        { name: "Cafe", security: 3, signalStrength: 0.4 },
        { name: "Cafe", security: 3, signalStrength: 0.8, known: true },
        { name: "Hidden", security: 10, signalStrength: 0.2 },
        { name: "", security: 3, signalStrength: 0.9 },
    ]);

    assert.deepStrictEqual(first.map(row => row.label), ["Cafe", "Hidden network", "Hidden"]);
    assert.equal(first[0].known, true);
    assert.equal(first[1].hidden, true);
    assert.equal(Object.values(first[0]).some(value => value && typeof value === "object"), false);

    const second = Network.projectWifiRows([
        { name: "New", security: 10, signalStrength: 1 },
        { name: "Cafe", security: 3, signalStrength: 0.1, known: true },
    ], first);
    assert.deepStrictEqual(second.map(row => row.label), ["Cafe", "New"]);
    assert.equal(second[0].signal, 10);
    assert.equal(Network.wifiRowKey({ name: "Cafe", security: 3 }), Network.wifiRowKey({ name: "Cafe", security: 3 }));
});

test("Wi-Fi projection accepts QuickShell array-like network lists", () => {
    const qmlList = {
        0: { name: "Cafe", security: 3, signalStrength: 0.8 },
        length: 1,
    };

    assert.deepStrictEqual(
        Network.projectWifiRows(qmlList).map(row => row.label),
        ["Cafe"],
    );
});

test("Wi-Fi state and failure helpers expose actionable transitions", () => {
    const device = { networks: { values: [{ connected: true }] } };
    assert.equal(Network.wifiState(null, true, true, true, false), "unavailable");
    assert.equal(Network.wifiState(device, true, false, true, false), "software-disabled");
    assert.equal(Network.wifiState(device, true, true, false, false), "hardware-blocked");
    assert.equal(Network.wifiState(device, true, true, true, true), "scanning");
    assert.equal(Network.wifiState(device, true, true, true, false), "connected");
    assert.equal(Network.wifiRequiresCredentials(10, 10, 9), false);
    assert.equal(Network.wifiRequiresCredentials(9, 10, 9), false);
    assert.equal(Network.wifiRequiresCredentials(11, 10, 9), true);

    const reasons = { NoSecrets: 1, WifiAuthTimeout: 2, WifiNetworkLost: 3 };
    assert.equal(Network.wifiFailureForReason(reasons.NoSecrets, true, reasons), "bad-password");
    assert.equal(Network.wifiFailureForReason(reasons.WifiNetworkLost, false, reasons), "network-unavailable");
    assert.equal(Network.shouldRepromptWifi(reasons.WifiAuthTimeout, true, reasons), true);
    assert.equal(Network.shouldRepromptWifi(reasons.WifiNetworkLost, true, reasons), false);
    assert.equal(Network.wifiFailureLabel("timeout"), "Connection timed out");
    assert.equal(Network.wifiFailureLabel("network-unavailable"), "Network unavailable");
});

test("band state keeps the confirmed selection while an action is pending or fails", () => {
    assert.equal(Network.bandForFrequency("5745 MHz"), "5");
    assert.equal(Network.bandForFrequency("6455.0"), "6");
    assert.equal(Network.bandForFrequency("18300"), "");
    assert.deepStrictEqual(Network.parseBandStatus(
        "device\twlan0\ndevices\twlan0 wlan1\nband\t5\navailable\t2.4 5 6\nselected\tauto\n"
    ), {
        device: "wlan0",
        devices: ["wlan0", "wlan1"],
        band: "5",
        selected: "auto",
        available: ["2.4", "5", "6"],
    });

    const pending = Network.bandActionState({ selected: "5" }, "2.4", "pending");
    assert.equal(pending.status, "pending");
    assert.equal(pending.selected, "5");
    const failed = Network.bandActionState(pending, "2.4", "failed", "reassociation-failed");
    assert.equal(failed.status, "failed");
    assert.equal(failed.selected, "5");
    assert.match(Network.bandFailureLabel(failed.error), /previous band restored/);
    const confirmed = Network.bandActionState(pending, "2.4", "confirmed");
    assert.equal(confirmed.selected, "2.4");
    assert.equal(confirmed.confirmed, true);
});

test("Wi-Fi target selection prefers an explicit target, the route, then profile priority", () => {
    const devices = [
        { name: "wlan0", type: "wifi", connected: true, priority: 10 },
        { name: "wlan1", type: "wifi", connected: true, priority: 40 },
        { name: "wlan2", type: "wifi", connected: false, priority: 100 },
    ];
    assert.equal(Network.selectWifiDevice(devices, "wlan0", "wlan1", "wlan1").name, "wlan0");
    assert.equal(Network.selectWifiDevice(devices, "", "wlan0", "wlan1").name, "wlan0");
    assert.equal(Network.selectWifiDevice(devices, "", "eth0", "wlan1").name, "wlan1");
    assert.equal(Network.selectWifiDevice(devices, "", "eth0", "").name, "wlan1");
});

test("Wi-Fi credential helper keeps secrets out of argv and cleans failed profiles", t => {
    const fakeDirectory = fakeWifiManagerDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    let run = runWifi(fakeDirectory, ["connect-psk", "wlan0", "Cafe Wi-Fi"], "correct;secret\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.args, /connection add type wifi/);
    assert.match(run.stdin, /wifi-sec\.psk correct;secret/);
    assert.doesNotMatch(run.args, /correct;secret/);

    fs.rmSync(fakeDirectory, { recursive: true, force: true });
    const failingDirectory = fakeWifiManagerDirectory({ failUp: true });
    t.after(() => fs.rmSync(failingDirectory, { recursive: true, force: true }));
    run = runWifi(failingDirectory, ["connect-enterprise", "wlan0", "Campus", "alice@example.com"], "enterprise-secret\n");
    assert.notEqual(run.result.status, 0);
    assert.match(run.args, /802-1x\.identity alice@example\.com/);
    assert.match(run.stdin, /802-1x\.password enterprise-secret/);
    assert.doesNotMatch(run.args, /enterprise-secret/);
    assert.match(run.args, /connection delete uuid/);
});

test("wired command seam delegates profile policy and explicit choices to NetworkManager", () => {
    const fakeDirectory = fakeNetworkManagerDirectory("uuid-a:Office\\:Dock:802-3-ethernet::yes");
    const argsFile = path.join(fakeDirectory, "args");
    try {
        let result = runWired(fakeDirectory, ["profiles"], argsFile);
        assert.equal(result.status, 0);
        assert.match(fs.readFileSync(argsFile, "utf8"), /--terse --escape yes/);
        assert.match(
            fs.readFileSync(argsFile, "utf8"),
            /--fields UUID,NAME,TYPE,DEVICE,AUTOCONNECT connection show/
        );
        assert.doesNotMatch(fs.readFileSync(argsFile, "utf8"), /connection\.uuid/);
        assert.match(result.stdout, /Office\\:Dock/);

        result = runWired(fakeDirectory, ["disconnect", "eth0"], argsFile);
        assert.equal(result.status, 0);
        assert.equal(fs.readFileSync(argsFile, "utf8").trim(), "device disconnect eth0");

        result = runWired(fakeDirectory, ["reconnect", "eth0"], argsFile);
        assert.equal(result.status, 0);
        assert.equal(fs.readFileSync(argsFile, "utf8").trim(), "device connect eth0");

        result = runWired(fakeDirectory, ["activate", "eth0", "uuid-a"], argsFile);
        assert.equal(result.status, 0);
        assert.equal(fs.readFileSync(argsFile, "utf8").trim(), "connection up uuid uuid-a ifname eth0");
    } finally {
        fs.rmSync(fakeDirectory, { recursive: true, force: true });
    }
});

test("band helper discovers the route target and preserves SSID separators and escapes", t => {
    const fakeDirectory = fakeBandManagerDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    const run = runBand(fakeDirectory, [], {
        route: "1.1.1.1 dev wlan1 src 192.0.2.20",
        devices: "wlan0:wifi:connected:Office\nwlan1:wifi:connected:Office",
        ssid: "Office:Guest\\Zone",
        profile: "Office:Guest\\Zone",
        previous: "a",
        scan: "2412:Office:Guest\\Zone\n5745:Office:Guest\\Zone\n5180:Other",
    });

    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /device\twlan1/);
    assert.match(run.result.stdout, /available\t2\.4 5/);
    assert.match(run.result.stdout, /selected\t5/);
    assert.match(run.nmcli, /FREQ,SSID dev wifi list ifname wlan1/);
});

test("band helper falls back to the highest-priority active Wi-Fi profile and honors an explicit adapter", t => {
    const fakeDirectory = fakeBandManagerDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    const fallback = runBand(fakeDirectory, [], {
        route: "1.1.1.1 dev eth0 src 192.0.2.20",
        devices: "wlan0:wifi:connected:Office\nwlan1:wifi:connected:Backup",
        profile0: "Office",
        profile1: "Backup",
        officePriority: 10,
        backupPriority: 40,
    });
    assert.equal(fallback.result.status, 0, fallback.result.stderr);
    assert.match(fallback.result.stdout, /device\twlan1/);

    const explicit = runBand(fakeDirectory, ["--interface", "wlan0"], {
        route: "1.1.1.1 dev eth0 src 192.0.2.20",
        devices: "wlan0:wifi:connected:Office\nwlan1:wifi:connected:Backup",
    });
    assert.equal(explicit.result.status, 0, explicit.result.stderr);
    assert.match(explicit.result.stdout, /device\twlan0/);
});

test("band helper applies a supported band and rolls back the profile and connection after reassociation fails", t => {
    const fakeDirectory = fakeBandManagerDirectory();
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    const success = runBand(fakeDirectory, ["--interface", "wlan0", "2.4"], {
        route: "1.1.1.1 dev wlan0 src 192.0.2.20",
        scan: "2412:Office:Guest\\Zone\n5745:Office:Guest\\Zone",
        previous: "a",
    });
    assert.equal(success.result.status, 0, success.result.stderr);
    assert.match(success.modified, /802-11-wireless\.band bg/);
    assert.equal(success.activated.trim(), "connection up Office:Guest\\Zone");

    const failedDirectory = fakeBandManagerDirectory();
    t.after(() => fs.rmSync(failedDirectory, { recursive: true, force: true }));
    const failed = runBand(failedDirectory, ["--interface", "wlan0", "2.4"], {
        route: "1.1.1.1 dev wlan0 src 192.0.2.20",
        scan: "2412:Office:Guest\\Zone\n5745:Office:Guest\\Zone",
        previous: "a",
        failUp: true,
    });
    assert.notEqual(failed.result.status, 0);
    assert.match(failed.result.stderr, /reverted to previous band/);
    assert.match(failed.modified, /802-11-wireless\.band bg/);
    assert.match(failed.modified, /802-11-wireless\.band a/);
    assert.equal(failed.activated.trim().split("\n").length, 2);
});

test("DNS model keeps provider choices, validation, and confirmed state explicit", () => {
    const automatic = Network.parseDnsStatus([
        "iface\teth0",
        "uuid\tuuid-route",
        "profile\tOffice",
        "provider\tAutomatic",
        "ipv4_ignore_auto_dns\tno",
        "ipv4_dns\t",
        "ipv6_ignore_auto_dns\tno",
        "ipv6_dns\t",
        "dns\t",
    ].join("\n"));
    assert.equal(automatic.available, true);
    assert.equal(automatic.provider, "Automatic");
    assert.deepStrictEqual(Network.dnsProviderServers("Cloudflare"), {
        ipv4: ["1.1.1.1", "1.0.0.1"],
        ipv6: ["2606:4700:4700::1111", "2606:4700:4700::1001"],
    });
    assert.equal(Network.validateDnsServers("1.1.1.1, 2001:4860:4860::8888").valid, true);
    assert.equal(Network.validateDnsServers("example.com").valid, false);
    assert.equal(Network.validateDnsServers("999.1.1.1").valid, false);
    assert.equal(Network.dnsStatusMatches(
        { available: true, uuid: "uuid-route", provider: "Cloudflare" },
        "Cloudflare",
        "uuid-route",
        ""
    ), true);

    const pending = Network.dnsActionState({ uuid: "uuid-route", previous: automatic }, "Cloudflare", "pending", "", 1);
    assert.equal(pending.status, "pending");
    assert.equal(Network.dnsActionState(pending, "Cloudflare", "reconnection-required", "", 1).requiredReconnection, true);
    assert.equal(Network.dnsActionState(pending, "Cloudflare", "confirmed", "", 1).confirmed, true);
    assert.equal(Network.dnsActionState(pending, "Cloudflare", "failed", "reconnect-failed", 1).status, "failed");
    assert.match(Network.dnsFailureLabel("authentication-cancelled"), /Authorization cancelled/);
    assert.equal(Network.classifyDnsProcessFailure("User cancelled authorization", 1), "authentication-cancelled");
    assert.equal(Network.classifyDnsProcessFailure("connection activation failed", 1), "reconnect-failed");
});

test("DNS helper reads only the active route profile and applies each stock provider", t => {
    const fakeDirectory = fakeDnsManagerDirectory({
        dns4: "1.1.1.1 1.0.0.1",
        dns6: "2606:4700:4700::1111 2606:4700:4700::1001",
    });
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    let run = runDns(fakeDirectory, ["status", "eth0"]);
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /uuid\tuuid-route/);
    assert.match(run.result.stdout, /provider\tCloudflare/);

    for (const provider of ["Automatic", "Cloudflare", "Google"]) {
        run = runDns(fakeDirectory, ["apply", "eth0", provider, "uuid-route"]);
        assert.equal(run.result.status, 0, `${provider}: ${run.result.stderr}`);
        assert.match(run.result.stdout, /reconnection-required/);
        assert.match(run.nmcli, new RegExp(`connection modify uuid uuid-route`));
        assert.match(run.nmcli, /connection up uuid uuid-route ifname eth0/);
        assert.doesNotMatch(run.nmcli, /uuid-unrelated/);
    }
});

test("DNS helper recognizes stock providers when nmcli escapes IPv6 colons", t => {
    const fakeDirectory = fakeDnsManagerDirectory({
        dns4: "1.1.1.1 1.0.0.1",
        dns6: "2606\\:4700\\:4700\\:\\:1111 2606\\:4700\\:4700\\:\\:1001",
    });
    t.after(() => fs.rmSync(fakeDirectory, { recursive: true, force: true }));

    const run = runDns(fakeDirectory, ["status", "eth0"]);
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /provider\tCloudflare/);
    assert.doesNotMatch(run.result.stdout, /provider\tCustom/);
});

test("DNS provider status row expands a selectable provider list", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );

    assert.match(page, /property bool dnsProviderOpen: false/);
    assert.match(
        page,
        /label: "DNS provider"[\s\S]*enabled: !root\.dnsActionBusy[\s\S]*disclosureVisible: true[\s\S]*disclosureOpen: root\.dnsProviderOpen[\s\S]*onClicked: root\.dnsProviderOpen = !root\.dnsProviderOpen/
    );
    assert.match(page, /model: root\.dnsProviderOpen \? root\.dnsProviders : \[\]/);
    assert.match(page, /root\.dnsProviderOpen = false[\s\S]*if \(provider === "Custom"\)/);
});

test("Network Page keeps stable DNS and speed details during same-interface polls", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );

    assert.match(page, /const needsInitialStatus = !root\.dnsProfile\.available[\s\S]*root\.dnsProfile\.iface !== root\.routeInfo\.iface/);
    assert.match(page, /if \(needsInitialStatus\)\s*root\.dnsStatusLoading = true/);
    assert.match(page, /if \(root\.speedDependenciesInterface === root\.routeInfo\.iface[\s\S]*&&\s*!root\.speedDependenciesLoading\)\s*return/);
});

test("Network Page groups read-only connection facts behind a disclosure row", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8"
    );

    assert.match(page, /property bool connectionInfoOpen: false/);
    assert.match(
        page,
        /label: "Connection info"[\s\S]*disclosureVisible: true[\s\S]*disclosureOpen: root\.connectionInfoOpen[\s\S]*onClicked: root\.connectionInfoOpen = !root\.connectionInfoOpen/
    );
    assert.match(page, /label: "Connection info"[\s\S]*label: "Run speed test"/);
    assert.match(page, /x: 12[\s\S]*width: parent\.width - 12[\s\S]*visible: root\.connectionInfoOpen[\s\S]*label: "Default Route"/);
    assert.match(page, /model: root\.dnsProviderOpen \? root\.dnsProviders : \[\][\s\S]*width: parent\.width - 12[\s\S]*x: 12/);
    assert.match(page, /label: "Run speed test"[\s\S]*onClicked: root\.runSpeedTest\(\)/);
});

test("DNS helper validates Custom, preserves auth-cancelled state, and rolls back reconnect failures", t => {
    const validDirectory = fakeDnsManagerDirectory({
        dns4: "192.0.2.53",
        dns6: "",
    });
    t.after(() => fs.rmSync(validDirectory, { recursive: true, force: true }));
    let run = runDns(validDirectory, ["apply", "eth0", "Custom", "uuid-route"], "9.9.9.9\n");
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.nmcli, /ipv4\.dns 9\.9\.9\.9/);
    assert.match(run.nmcli, /ipv6\.dns/);

    const invalidDirectory = fakeDnsManagerDirectory({
        dns4: "192.0.2.53",
        dns6: "",
    });
    t.after(() => fs.rmSync(invalidDirectory, { recursive: true, force: true }));
    run = runDns(invalidDirectory, ["apply", "eth0", "Custom", "uuid-route"], "not-a-server\n");
    assert.notEqual(run.result.status, 0);
    assert.match(run.result.stderr, /custom-validation-failed/);
    assert.doesNotMatch(run.nmcli, /connection modify/);

    const authDirectory = fakeDnsManagerDirectory({ failModify: true });
    t.after(() => fs.rmSync(authDirectory, { recursive: true, force: true }));
    run = runDns(authDirectory, ["apply", "eth0", "Google", "uuid-route"]);
    assert.notEqual(run.result.status, 0);
    assert.match(run.result.stderr, /authentication-cancelled/);
    assert.doesNotMatch(run.nmcli, /connection up/);

    const failedDirectory = fakeDnsManagerDirectory({ failUp: true });
    t.after(() => fs.rmSync(failedDirectory, { recursive: true, force: true }));
    run = runDns(failedDirectory, ["apply", "eth0", "Google", "uuid-route"]);
    assert.notEqual(run.result.status, 0);
    assert.match(run.result.stderr, /reconnect-failed/);
    assert.match(run.nmcli, /connection modify uuid uuid-route/);
    assert.match(run.nmcli, /ipv4\.dns 1\.1\.1\.1|ipv4\.dns 192\.0\.2\.53/);
    assert.match(run.nmcli, /device reapply eth0|connection up uuid uuid-route ifname eth0/);
});

test("DNS page and helper never claim global or Tailscale resolver ownership", () => {
    const helper = fs.readFileSync(dnsCommand, "utf8");
    const page = fs.readFileSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8");
    assert.doesNotMatch(helper, /sudo|pkexec|systemctl|resolved|global-dns|\/etc\//i);
    assert.doesNotMatch(page, /resolved\.conf|global-dns|tailscale|sudo|pkexec/);
    assert.match(helper, /connection modify uuid/);
    assert.match(page, /dnsStatusProcess/);
    assert.match(page, /dnsActionProcess/);
    assert.match(page, /Cancel DNS action/);
    assert.match(page, /reconnection-required/);
    assert.match(page, /Model\.dnsStatusMatches/);
});

test("the Network Page owns Wi-Fi management through live Quick Settings", () => {
    const page = fs.readFileSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"), "utf8");
    const networkTiles = fs.readFileSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkQuickSettings.qml"), "utf8");
    const wiredTile = fs.readFileSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/WiredTile.qml"), "utf8");
    const quickSettings = fs.readFileSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/QuickSettings.qml"), "utf8");

    assert.match(page, /property var modelState:\s*Model\.emptyState\(\)/);
    assert.match(page, /case "connected"/);
    assert.match(page, /case "disconnected"/);
    assert.match(page, /case "busy"/);
    assert.match(page, /Network status unavailable/);
    assert.match(page, /command: \[root\.statusCommand, "--verbose"\]/);
    assert.match(page, /routeAvailable/);
    assert.match(page, /wiredProfilesProcess/);
    assert.match(page, /wiredActionProcess/);
    assert.match(page, /cancelWiredAction/);
    assert.match(page, /Cancel wired action/);
    assert.match(page, /NetworkManager profiles/);
    assert.match(page, /property var wifiRows/);
    assert.match(page, /Model\.projectWifiRows/);
    assert.match(page, /setWifiScannerEnabled/);
    assert.match(page, /scannerDevice\.scannerEnabled = false/);
    assert.match(page, /stdinEnabled:\s*true/);
    assert.match(page, /write\(secret \+ "\\n"\)/);
    assert.match(page, /wifiCredentialProcess\.token/);
    assert.match(page, /resultToken !== root\.wifiAction\.token/);
    assert.match(page, /ConnectionFailReason\.NoSecrets/);
    assert.match(page, /ConnectionFailReason\.WifiAuthTimeout/);
    assert.match(page, /startWifiNativeAction\("disconnect"/);
    assert.match(page, /startWifiNativeAction\("forget"/);
    assert.match(page, /property string bandCommand: "df-network-band"/);
    assert.match(page, /property string dnsCommand: "df-network-dns"/);
    assert.match(page, /label: "DNS provider"/);
    assert.match(page, /\["Automatic", "Cloudflare", "Google", "Custom"\]/);
    assert.match(page, /property string pendingBand/);
    assert.match(page, /bandStatusProcess/);
    assert.match(page, /bandActionProcess/);
    assert.match(page, /bandActionBusy \|\| root\.bandFailure\) && status\.available\.length === 0/);
    assert.match(page, /bandSelected = target/);
    assert.match(page, /selectWifiAdapter/);
    assert.match(page, /label: "Automatic"/);
    assert.match(page, /Model\.bandFailureLabel/);
    assert.match(page, /Quickshell\.execDetached\(\["ghostty", "-e", "nmtui"\]\)/);
    assert.match(page, /Component\.onDestruction[\s\S]*setWifiScannerEnabled\(false\)/);
    assert.match(networkTiles, /Tile \{[\s\S]*id: wifiTile/);
    assert.match(networkTiles, /WiredTile \{/);
    assert.match(wiredTile, /toggleWired/);
    assert.match(quickSettings, /NetworkQuickSettings\s*\{/);
    assert.match(quickSettings, /NetworkPage\s*\{/);
    assert.match(quickSettings, /QuickSettings\.Network/);
    assert.doesNotMatch(quickSettings, /WifiPage\s*\{|WiredStatus\s*\{/);
    for (const obsolete of ["WifiPage.qml", "WiredStatus.qml", "WiredRow.qml", "NetworkItem.qml"])
        assert.equal(fs.existsSync(path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules", obsolete)), false);
});

test("Network Page reads StdioCollector text as a property", () => {
    const page = fs.readFileSync(
        path.join(repoRoot, "quickshell/.config/quickshell/dotfiles/modules/NetworkPage.qml"),
        "utf8",
    );
    const collectorIds = new Set(
        [...page.matchAll(/StdioCollector\s*\{[^{}]*?\bid:\s*([A-Za-z_$][\w$]*)/g)]
            .map(([, id]) => id),
    );
    const collectorTextCalls = [...page.matchAll(/\b([A-Za-z_$][\w$]*)\.text\(\)/g)]
        .map(([, id]) => id)
        .filter(id => collectorIds.has(id));

    assert.deepStrictEqual(
        collectorTextCalls,
        [],
        "StdioCollector.text is a property; FileView.text() calls are unrelated",
    );
});

test("both Arch targets validate the Network Page seam without selecting a backend", () => {
    const packageList = fs.readFileSync(
        path.join(repoRoot, "setup/common/packages/quickshell-packages"), "utf8"
    );
    const validator = fs.readFileSync(
        path.join(repoRoot, "setup/common/setup-network-page"), "utf8"
    );
    for (const dependency of [
        "networkmanager", "iproute2", "inetutils", "gawk", "iw", "curl", "jq"
    ]) {
        assert.match(packageList, new RegExp(`\\b${dependency}\\b`));
    }
    assert.match(packageList, /Optional network feature:[\s\S]*qrencode/);
    assert.doesNotMatch(
        packageList.match(/sudo pacman -S --noconfirm \\\n[\s\S]*?(?=\n\s*$)/)?.[0] || "",
        /\bqrencode\b/
    );
    for (const target of ["setup/arch-hyprland/init", "setup/arch-devbox/init"]) {
        const init = fs.readFileSync(path.join(repoRoot, target), "utf8");
        assert.match(init, /run_step "quickshell packages"/);
        assert.match(init, /run_step "network page validation" .*setup-network-page/);
    }
    assert.match(validator, /required_commands=\([\s\S]*nmcli[\s\S]*df-cmd-present[\s\S]*jq/);
    assert.match(validator, /optional_commands=\([\s\S]*qrencode/);
    assert.match(validator, /nmcli -t -f RUNNING general/);
    assert.doesNotMatch(validator, /systemctl\s+(enable|disable|start|stop|restart)/);
    assert.doesNotMatch(validator, /nmcli\s+(radio|general\s+reload|connection\s+(up|down|modify))/);
});
