// Plain network state shared by the Network Page and its tests.

var DEFAULT_PROBE = "1.1.1.1";
var WIFI_ICONS = ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"];

function numberOr(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
}

function textOr(value, fallback) {
    return value === undefined || value === null ? fallback : String(value);
}

function emptyState(overrides) {
    var state = {
        status: "unavailable",
        reason: "not-sampled",
        routePresent: false,
        routeKind: "",
        routeIface: "",
        kind: "",
        iface: "",
        label: "",
        ip: "",
        prefix: "",
        gateway: "",
        speed: "",
        duplex: "",
        ssid: "",
        signal: -1,
        signalStrength: -1,
        signalDbm: "",
        frequency: "",
        bitrate: "",
        rxBytes: null,
        txBytes: null,
        routerPingMs: null,
        internetPingMs: null,
        routerPingSamples: [],
        internetPingSamples: [],
        routerPingLatency: -1,
        internetPingLatency: -1,
        internetPingPacketLoss: 0,
        downloadRate: 0,
        uploadRate: 0,
        failure: ""
    };

    Object.keys(overrides || {}).forEach(function(key) {
        state[key] = overrides[key];
    });
    return state;
}

function parseRouteOutput(raw) {
    var source = textOr(raw, "").trim();
    if (!source) return null;

    try {
        var json = JSON.parse(source);
        var route = Array.isArray(json) ? json[0] : json;
        if (route && route.dev) {
            return {
                iface: String(route.dev),
                gateway: textOr(route.gateway, ""),
                ip: textOr(route.prefsrc || route.src, "")
            };
        }
    } catch (error) {
        // The normal `ip route get` form is not JSON.
    }

    var fields = source.split(/\s+/);
    var routeInfo = { iface: "", gateway: "", ip: "" };
    for (var i = 0; i < fields.length; i++) {
        if (fields[i] === "dev" && fields[i + 1]) routeInfo.iface = fields[i + 1];
        if (fields[i] === "via" && fields[i + 1]) routeInfo.gateway = fields[i + 1];
        if ((fields[i] === "src" || fields[i] === "prefsrc") && fields[i + 1]) routeInfo.ip = fields[i + 1];
    }
    return routeInfo.iface ? routeInfo : null;
}

function parseKeyValue(raw) {
    var values = {};
    textOr(raw, "").split(/\r?\n/).forEach(function(line) {
        if (!line) return;
        var index = line.indexOf("\t");
        if (index < 0) return;
        var key = line.slice(0, index).trim();
        if (!key) return;
        values[key] = line.slice(index + 1).trim();
    });
    return values;
}

function parseCompactStatus(raw) {
    var line = textOr(raw, "").trim().split(/\r?\n/)[0];
    var fields = line.split("\t");
    var kind = fields[0] || "";

    if (kind === "disconnected") {
        return emptyState({ status: "disconnected", reason: "no-route", routePresent: false });
    }
    if (kind !== "wifi" && kind !== "ethernet") return null;

    return emptyState({
        status: "connected",
        reason: "connected",
        routePresent: kind === "ethernet" ? !!fields[1] : !!fields[4],
        routeKind: kind,
        routeIface: kind === "ethernet" ? fields[1] || "" : fields[4] || "",
        kind: kind,
        iface: kind === "ethernet" ? fields[1] || "" : fields[4] || "",
        label: fields[1] || "",
        ssid: kind === "wifi" ? fields[1] || "" : "",
        signal: kind === "wifi" ? numberOr(fields[2], -1) : -1,
        signalStrength: kind === "wifi" ? numberOr(fields[2], -1) / 100 : -1,
        frequency: kind === "wifi" ? fields[3] || "" : ""
    });
}

function parseVerboseStatus(raw) {
    var values = parseKeyValue(raw);
    if (!values.iface) return null;

    var kind = values.type === "wifi" || values.type === "ethernet" ? values.type : "";
    if (!kind) return null;

    var state = emptyState({
        status: "connected",
        reason: "connected",
        routePresent: true,
        routeKind: kind,
        routeIface: values.iface,
        kind: kind,
        iface: values.iface,
        label: kind === "wifi" ? (values.ssid || values.iface) : values.iface,
        ip: values.ip || "",
        prefix: values.prefix || "",
        gateway: values.gateway || "",
        speed: values.speed || "",
        duplex: values.duplex || "",
        ssid: values.ssid || "",
        signalDbm: values.signal_dbm || "",
        frequency: values.freq || "",
        bitrate: values.bitrate || "",
        rxBytes: values.rx_bytes === undefined ? null : numberOr(values.rx_bytes, null),
        txBytes: values.tx_bytes === undefined ? null : numberOr(values.tx_bytes, null),
        routerPingMs: values.router_ping_ms === undefined ? null : pingSampleValue(values.router_ping_ms),
        internetPingMs: values.internet_ping_ms === undefined ? null : pingSampleValue(values.internet_ping_ms)
    });

    state.signalStrength = state.signalDbm === "" ? -1 : numberOr(state.signalDbm, -1);

    return state;
}

function parseStatus(raw, exitCode) {
    if (exitCode !== undefined && Number(exitCode) !== 0)
        return emptyState({ reason: "command-failed", failure: "command-failed" });

    var source = textOr(raw, "");
    // Verbose status has no body when `ip route get` finds no Internet route;
    // that is a normal disconnected state, not a broken helper response.
    if (!source.trim()) return emptyState({ status: "disconnected", reason: "no-route", routePresent: false });

    var compact = parseCompactStatus(source);
    if (compact) return compact;

    var verbose = parseVerboseStatus(source);
    if (verbose) return verbose;

    return emptyState({ reason: "malformed", failure: "malformed-output" });
}

function parseNetworkStatus(raw, exitCode) {
    return parseStatus(raw, exitCode);
}

function signalRatio(value) {
    var signal = numberOr(value, 0);
    if (signal > 1) signal /= 100;
    return Math.max(0, Math.min(1, signal));
}

function wifiIconFor(signal) {
    return WIFI_ICONS[Math.min(WIFI_ICONS.length - 1, Math.floor(signalRatio(signal) * WIFI_ICONS.length))];
}

function connectionIcon(state) {
    if (state && state.kind === "wifi") return wifiIconFor(state.signal);
    if (state && state.kind === "ethernet") return "󰀂";
    return "󰤮";
}

function formatHeaderSpeed(speed) {
    var value = parseInt(speed, 10);
    if (!isFinite(value) || value < 0) return "";
    if (value >= 1000) return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + "gbit";
    return value + "mbit";
}

function formatHeaderFreq(frequency) {
    var value = parseFloat(frequency);
    if (!isFinite(value) || value <= 0) return "";
    if (value >= 2400 && value < 2500) return "2.4ghz";
    if (value >= 4900 && value < 5925) return "5ghz";
    if (value >= 5925 && value < 7125) return "6ghz";
    if (value >= 57000 && value < 71000) return "60ghz";
    var ghz = value / 1000;
    return ghz.toFixed(ghz % 1 === 0 ? 0 : 1) + "ghz";
}

function bandForFrequency(frequency) {
    var value = parseFloat(frequency);
    if (!isFinite(value)) return "";
    if (value >= 2400 && value < 2500) return "2.4";
    if (value >= 4900 && value < 5925) return "5";
    if (value >= 5925 && value < 7125) return "6";
    return "";
}

function bandLabel(band) {
    if (band === "auto") return "Auto";
    if (band === "2.4" || band === "5" || band === "6") return band + "ghz";
    return "";
}

function bandSectionTitle(selected, current) {
    if (selected !== "auto") return "WI-FI BAND";
    var label = bandLabel(current);
    return label ? "WI-FI BAND: " + label.toUpperCase() : "WI-FI BAND";
}

function bandTooltip(band) {
    if (band === "auto") return "Let Wi-Fi pick the band";
    var label = bandLabel(band);
    return label ? "Stay on " + label : "";
}

function parseBandStatus(raw) {
    var values = parseKeyValue(raw);
    var bands = [];
    textOr(values.available, "").split(/\s+/).forEach(function(band) {
        if ((band === "2.4" || band === "5" || band === "6") && !bands.includes(band))
            bands.push(band);
    });
    return {
        device: textOr(values.device, ""),
        devices: textOr(values.devices, "").split(/\s+/).filter(Boolean),
        band: bandLabel(values.band) ? values.band : "",
        selected: values.selected === "2.4" || values.selected === "5" || values.selected === "6"
            ? values.selected : "auto",
        available: bands
    };
}

function normalizeDnsServers(raw) {
    var source = textOr(raw, "").replace(/[\t,]+/g, " ");
    var servers = source.split(/\s+/).filter(Boolean).map(function(server) {
        return server.replace(/^dns\+(tls|udp):\/\//, "").replace(/#.*$/, "")
            .replace(/^\[/, "").replace(/\]$/, "");
    });
    var unique = [];
    servers.forEach(function(server) {
        if (!unique.includes(server)) unique.push(server);
    });
    return unique.sort(function(a, b) { return a.localeCompare(b); });
}

function dnsProviderForValues(ignore4, dns4, ignore6, dns6) {
    var servers = normalizeDnsServers(textOr(dns4, "") + " " + textOr(dns6, ""));
    var canonical4 = normalizeDnsServers(dns4).join(",");
    var canonical6 = normalizeDnsServers(dns6).join(",");
    var ignored4 = /^(1|yes|true|on)$/i.test(textOr(ignore4, "").trim());
    var ignored6 = /^(1|yes|true|on)$/i.test(textOr(ignore6, "").trim());
    if ((!ignored4 && !ignored6) || servers.length === 0) return "Automatic";
    if ((canonical4 === "1.0.0.1,1.1.1.1" &&
        (!canonical6 || canonical6 === "2606:4700:4700::1001,2606:4700:4700::1111")) ||
        (!canonical4 && canonical6 === "2606:4700:4700::1001,2606:4700:4700::1111"))
        return "Cloudflare";
    if ((canonical4 === "8.8.4.4,8.8.8.8" &&
        (!canonical6 || canonical6 === "2001:4860:4860::8844,2001:4860:4860::8888")) ||
        (!canonical4 && canonical6 === "2001:4860:4860::8844,2001:4860:4860::8888"))
        return "Google";
    return "Custom";
}

function parseDnsStatus(raw, exitCode) {
    if (exitCode !== undefined && Number(exitCode) !== 0)
        return {
            available: false,
            error: "command-failed",
            iface: "",
            uuid: "",
            profile: "",
            provider: "Automatic",
            ipv4Dns: [],
            ipv6Dns: [],
            dns: []
        };

    var values = parseKeyValue(raw);
    var ipv4Dns = normalizeDnsServers(values.ipv4_dns);
    var ipv6Dns = normalizeDnsServers(values.ipv6_dns);
    var provider = values.provider === "DHCP" ? "Automatic" : textOr(values.provider, "");
    if (!provider)
        provider = dnsProviderForValues(
            values.ipv4_ignore_auto_dns,
            values.ipv4_dns,
            values.ipv6_ignore_auto_dns,
            values.ipv6_dns
        );

    return {
        available: !!values.uuid,
        error: "",
        iface: textOr(values.iface, ""),
        uuid: textOr(values.uuid, ""),
        profile: textOr(values.profile, ""),
        provider: provider === "DHCP" ? "Automatic" : provider,
        ipv4IgnoreAutoDns: textOr(values.ipv4_ignore_auto_dns, ""),
        ipv6IgnoreAutoDns: textOr(values.ipv6_ignore_auto_dns, ""),
        ipv4Dns: ipv4Dns,
        ipv6Dns: ipv6Dns,
        dns: normalizeDnsServers(values.dns || ipv4Dns.concat(ipv6Dns).join(" "))
    };
}

function dnsProviderServers(provider, custom) {
    var selected = textOr(provider, "Automatic");
    if (selected === "DHCP") selected = "Automatic";
    if (selected === "Cloudflare") {
        return {
            ipv4: ["1.1.1.1", "1.0.0.1"],
            ipv6: ["2606:4700:4700::1111", "2606:4700:4700::1001"]
        };
    }
    if (selected === "Google") {
        return {
            ipv4: ["8.8.8.8", "8.8.4.4"],
            ipv6: ["2001:4860:4860::8888", "2001:4860:4860::8844"]
        };
    }
    if (selected === "Custom") {
        var values = normalizeDnsServers(custom);
        return {
            ipv4: values.filter(function(server) { return server.indexOf(":") < 0; }),
            ipv6: values.filter(function(server) { return server.indexOf(":") >= 0; })
        };
    }
    return { ipv4: [], ipv6: [] };
}

function validateDnsServers(raw) {
    var source = textOr(raw, "").replace(/[\t,]+/g, " ").trim();
    var servers = source.split(/\s+/).filter(Boolean);
    if (!servers.length) return { valid: false, servers: [], error: "custom-validation-failed" };
    for (var i = 0; i < servers.length; i++) {
        var server = servers[i];
        var clean = server.replace(/^dns\+(tls|udp):\/\//, "").replace(/#.*$/, "")
            .replace(/^\[/, "").replace(/\]$/, "");
        var ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(clean);
        var ipv6 = /^[0-9A-Fa-f:]+$/.test(clean) && clean.includes(":") && clean !== "::";
        if (!ipv4 && !ipv6) return { valid: false, servers: [], error: "custom-validation-failed" };
        if (ipv4 && clean.split(".").some(function(octet) { return Number(octet) > 255; }))
            return { valid: false, servers: [], error: "custom-validation-failed" };
    }
    return { valid: true, servers: normalizeDnsServers(servers.join(" ")), error: "" };
}

function dnsStatusMatches(status, target, uuid, custom) {
    var current = status || {};
    var provider = textOr(target, "Automatic") === "DHCP" ? "Automatic" : textOr(target, "Automatic");
    if (!current.available || (uuid && current.uuid !== uuid) || current.provider !== provider)
        return false;
    if (provider !== "Custom") return true;
    var requested = validateDnsServers(custom);
    return requested.valid && requested.servers.join(",") === (current.dns || []).join(",");
}

function dnsActionState(previous, target, phase, error, token) {
    var old = previous || {};
    var stage = textOr(phase, "pending");
    var next = {
        target: textOr(target, old.target || "Automatic"),
        custom: textOr(old.custom, ""),
        uuid: textOr(old.uuid, ""),
        status: "pending",
        error: "",
        confirmed: false,
        requiredReconnection: false,
        token: token === undefined ? numberOr(old.token, 0) : numberOr(token, 0),
        previous: old.previous || null
    };
    if (stage === "reconnection-required") {
        next.status = "reconnection-required";
        next.requiredReconnection = true;
    } else if (stage === "confirmed") {
        next.status = "confirmed";
        next.confirmed = true;
    } else if (stage === "failed") {
        next.status = "failed";
        next.error = textOr(error, "dns-change-failed");
    } else if (stage === "cancelled") {
        next.status = "cancelled";
        next.error = "cancelled";
    } else if (stage === "idle") {
        next.status = "idle";
    }
    return next;
}

function dnsFailureLabel(error) {
    switch (textOr(error, "")) {
    case "authentication-cancelled": return "Authorization cancelled; previous DNS preserved";
    case "reconnect-failed": return "DNS change failed; previous setting restored";
    case "rollback-failed": return "DNS change failed; rollback needs attention";
    case "confirmation-timeout": return "DNS change not confirmed";
    case "custom-validation-failed": return "Enter valid DNS server addresses";
    case "profile-changed": return "Default Route changed; DNS not applied";
    case "profile-unavailable": return "Default Route profile unavailable";
    case "cancelled": return "Cancelled; previous DNS preserved";
    default: return error ? "DNS change failed" : "";
    }
}

function classifyDnsProcessFailure(stderr, exitCode) {
    if (Number(exitCode) === 0) return "";
    var message = textOr(stderr, "").toLowerCase();
    if (/authori|permission|cancel|denied|policy|password/.test(message))
        return "authentication-cancelled";
    if (/rollback/.test(message)) return "rollback-failed";
    if (/reconnect|reassociation|connection (up|activation)/.test(message)) return "reconnect-failed";
    if (/custom|dns server|invalid/.test(message)) return "custom-validation-failed";
    if (/profile.*change|expected/.test(message)) return "profile-changed";
    return "dns-change-failed";
}

function wifiDeviceInterface(device) {
    if (!device) return "";
    return textOr(device.name || device.interfaceName || device.device, "");
}

function activeWifiDevices(devices, wifiType) {
    var list = devices && typeof devices.filter === "function" ? devices : [];
    return list.filter(function(device) {
        return device && (device.type === "wifi" || (wifiType !== undefined && device.type === wifiType))
            && !!device.connected;
    });
}

function wifiDevicePriority(device) {
    if (!device) return -2147483648;
    var value = device.priority;
    if (value === undefined && device.connection) value = device.connection.priority;
    value = Number(value);
    return isFinite(value) ? value : 0;
}

function selectWifiDevice(devices, requestedInterface, routeInterface, helperInterface, wifiType) {
    var candidates = activeWifiDevices(devices, wifiType);
    var requested = textOr(requestedInterface, "");
    var route = textOr(routeInterface, "");
    var helper = textOr(helperInterface, "");
    var find = function(name) {
        return candidates.find(function(device) { return wifiDeviceInterface(device) === name; }) || null;
    };

    return find(requested) || find(route) || find(helper) || candidates.reduce(function(best, device) {
        if (!best || wifiDevicePriority(device) > wifiDevicePriority(best)) return device;
        return best;
    }, null) || null;
}

function bandActionState(previous, target, phase, error) {
    var old = previous || {};
    var next = {
        target: textOr(target, old.target || ""),
        selected: textOr(old.selected || "auto", "auto"),
        status: "pending",
        error: "",
        confirmed: false
    };
    var stage = textOr(phase, "pending");
    if (stage === "confirmed") {
        next.status = "confirmed";
        next.selected = next.target;
        next.confirmed = true;
    } else if (stage === "failed") {
        next.status = "failed";
        next.error = textOr(error, "reassociation-failed");
    } else if (stage === "cancelled") {
        next.status = "cancelled";
        next.error = "cancelled";
    } else if (stage === "idle") {
        next.status = "idle";
    }
    return next;
}

function bandFailureLabel(error) {
    switch (textOr(error, "")) {
    case "timeout":
    case "confirmation-timeout":
        return "Band change timed out";
    case "reassociation-failed":
    case "rollback-failed":
        return "Band change failed; previous band restored";
    case "unavailable":
        return "Band unavailable on this network";
    case "cancelled":
        return "Cancelled";
    default:
        return error ? "Band change failed" : "";
    }
}

function formatAddress(state) {
    if (!state || !state.ip) return "";
    return state.prefix ? state.ip + "/" + state.prefix : state.ip;
}

function formatLink(state) {
    if (!state) return "";
    if (state.kind === "ethernet") return formatHeaderSpeed(state.speed);
    return state.bitrate || formatHeaderFreq(state.frequency);
}

function formatBytes(bytes) {
    var value = numberOr(bytes, 0);
    if (value < 1024) return Math.round(Math.max(0, value)) + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatRate(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + "/s";
}

function pingSampleValue(raw) {
    var value = parseFloat(raw);
    return isFinite(value) && value >= 0 ? value : null;
}

function appendPingSample(samples, raw, limit) {
    var result = Array.isArray(samples) ? samples.slice() : [];
    result.push(pingSampleValue(raw));
    var max = Math.max(1, parseInt(limit, 10) || 5);
    while (result.length > max) result.shift();
    return result;
}

function averagePingLatency(samples) {
    var total = 0;
    var count = 0;
    (Array.isArray(samples) ? samples : []).forEach(function(value) {
        if (typeof value === "number" && isFinite(value) && value >= 0) {
            total += value;
            count++;
        }
    });
    return count ? total / count : -1;
}

function packetLossPercent(samples) {
    var values = Array.isArray(samples) ? samples : [];
    if (!values.length) return 0;
    var lost = values.filter(function(value) { return value === null; }).length;
    return Math.round(lost * 100 / values.length);
}

function pingState(previous, sample, limit) {
    var old = previous || {};
    var next = sample || {};
    var iface = next.iface || "";
    var reset = !iface || iface !== (old.pingIface || "");
    var router = reset ? [] : old.routerPingSamples;
    var internet = reset ? [] : old.internetPingSamples;

    if (next.router_ping_ms !== undefined)
        router = appendPingSample(router, next.router_ping_ms, limit);
    if (next.internet_ping_ms !== undefined)
        internet = appendPingSample(internet, next.internet_ping_ms, limit);

    return {
        pingIface: iface,
        routerPingSamples: router,
        internetPingSamples: internet,
        routerPingLatency: averagePingLatency(router),
        internetPingLatency: averagePingLatency(internet),
        internetPingPacketLoss: packetLossPercent(internet)
    };
}

function pingLatencyState(previous, sample, limit) {
    return pingState(previous, sample, limit);
}

function trafficDelta(previous, sample, now) {
    var old = previous || {};
    var next = sample || {};
    var iface = next.iface || "";
    var rx = numberOr(next.rx_bytes !== undefined ? next.rx_bytes : next.rxBytes, null);
    var tx = numberOr(next.tx_bytes !== undefined ? next.tx_bytes : next.txBytes, null);
    var time = numberOr(now, Date.now());
    var changed = !iface || iface !== (old.prevIface || "") || old.prevSampleTime === undefined;

    if (changed || old.prevSampleTime === 0) {
        return {
            prevIface: iface,
            prevRxBytes: rx,
            prevTxBytes: tx,
            prevSampleTime: time,
            downloadRate: 0,
            uploadRate: 0
        };
    }

    var elapsed = time - numberOr(old.prevSampleTime, time);
    var download = numberOr(old.downloadRate, 0);
    var upload = numberOr(old.uploadRate, 0);
    if (elapsed > 0 && rx !== null && tx !== null) {
        download = rx >= old.prevRxBytes ? (rx - old.prevRxBytes) / (elapsed / 1000) : 0;
        upload = tx >= old.prevTxBytes ? (tx - old.prevTxBytes) / (elapsed / 1000) : 0;
    }

    return {
        prevIface: iface,
        prevRxBytes: rx,
        prevTxBytes: tx,
        prevSampleTime: time,
        downloadRate: Math.max(0, download),
        uploadRate: Math.max(0, upload)
    };
}

function throughputState(previous, sample, now) {
    return trafficDelta(previous, sample, now);
}

function classifyFailure(error, exitCode, raw) {
    if (error && /not found|ENOENT|missing/i.test(String(error))) return "unavailable";
    if (exitCode !== undefined && Number(exitCode) !== 0) return "command-failed";
    if (raw !== undefined && !String(raw).trim()) return "";
    if (raw !== undefined) {
        var state = parseStatus(raw);
        if (state.status === "unavailable" && state.reason === "malformed") return "malformed";
    }
    return "";
}

function failureLabel(failure) {
    switch (failure) {
    case "unavailable": return "Network status unavailable";
    case "command-failed": return "Network status failed";
    case "malformed": return "Network status malformed";
    default: return "";
    }
}

function stateWithSamples(previous, raw, now, exitCode) {
    var state = parseStatus(raw, exitCode);
    var old = previous || {};
    var values = parseKeyValue(raw);
    var traffic = trafficDelta(old, values, now);
    var pings = pingState(old, values, old.pingHistoryWindow || 5);

    Object.keys(traffic).forEach(function(key) { state[key] = traffic[key]; });
    Object.keys(pings).forEach(function(key) { state[key] = pings[key]; });
    state.failure = state.failure || classifyFailure(null, exitCode, raw);
    return state;
}

function normalizeState(state) {
    var result = emptyState(state);
    var routeIface = textOr(result.routeIface || result.iface, "");
    var routeKind = textOr(result.routeKind || result.kind, "");
    result.routePresent = result.status === "connected" && !!routeIface;
    result.routeKind = result.routePresent ? routeKind : "";
    result.routeIface = result.routePresent ? routeIface : "";
    if (result.status === "connected" && !result.iface) result.status = "unavailable";
    if (result.kind === "ethernet" && !result.label) result.label = result.iface;
    if (result.kind === "wifi" && !result.label) result.label = result.ssid || result.iface;
    return result;
}

// NetworkManager's terse output escapes a separator as `\\:` and a literal
// backslash as `\\\\`. Keep this parser here so profile names never become a
// second, accidental delimiter in the wired-choice flow.
function splitEscapedFields(line, separator) {
    var fields = [];
    var field = "";
    var escaped = false;
    var source = textOr(line, "");
    var delimiter = separator || ":";

    for (var i = 0; i < source.length; i++) {
        var character = source[i];
        if (escaped) {
            field += character === delimiter || character === "\\" ? character : "\\" + character;
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (character === delimiter) {
            fields.push(field);
            field = "";
        } else {
            field += character;
        }
    }
    if (escaped) field += "\\";
    fields.push(field);
    return fields;
}

function booleanField(value) {
    return /^(1|yes|true|on)$/i.test(textOr(value, "").trim());
}

// `df-network-wired profiles` deliberately forwards NetworkManager's terse
// profile rows. The optional interface argument is applied after parsing,
// because an empty connection.interface-name means "eligible on any device".
function parseWiredProfiles(raw, iface) {
    var requestedIface = textOr(iface, "");
    var profiles = [];
    textOr(raw, "").split(/\r?\n/).forEach(function(line) {
        if (!line.trim()) return;
        var fields;
        if (line.indexOf("\t") >= 0) {
            fields = line.split("\t");
        } else {
            fields = splitEscapedFields(line, ":");
        }
        if (fields[0] === "profile") fields.shift();
        if (fields.length < 4) return;

        var type = textOr(fields[2], "").trim();
        if (type !== "802-3-ethernet" && type !== "ethernet" && type !== "wired") return;
        var interfaceName = textOr(fields[3], "").trim();
        var autoconnect = fields.length > 4 ? booleanField(fields[4]) : true;
        var active = fields.length > 5 ? booleanField(fields[5]) : false;
        // With no requested device, preserve every autoconnect profile and
        // apply device binding when the chooser knows its target.
        var eligibleInterface = !requestedIface || !interfaceName || interfaceName === "--" || interfaceName === requestedIface;

        profiles.push({
            uuid: textOr(fields[0], "").trim(),
            name: textOr(fields[1], "").trim(),
            type: type,
            interfaceName: interfaceName === "--" ? "" : interfaceName,
            autoconnect: autoconnect,
            active: active,
            eligible: autoconnect && eligibleInterface
        });
    });
    return profiles;
}

function eligibleWiredProfiles(profiles, iface) {
    var requestedIface = textOr(iface, "");
    return (Array.isArray(profiles) ? profiles : []).filter(function(profile) {
        if (!profile || profile.autoconnect === false || profile.eligible === false) return false;
        var bound = textOr(profile.interfaceName || profile.iface, "");
        return !bound || bound === requestedIface;
    });
}

function wiredProfileChoice(profiles, iface) {
    var eligible = eligibleWiredProfiles(profiles, iface);
    var choice = eligible.length === 0 ? "none" : eligible.length === 1 ? "one" : "multiple";
    return { choice: choice, profiles: eligible };
}

function routeAvailability(state) {
    var current = state || {};
    var iface = textOr(current.routeIface || current.iface, "");
    var kind = textOr(current.routeKind || current.kind, "");
    return {
        available: current.status === "connected" && !!iface,
        iface: current.status === "connected" ? iface : "",
        kind: current.status === "connected" ? kind : ""
    };
}

function wiredActionState(previous, action, phase, exitCode, error) {
    var old = previous || {};
    var kind = textOr(action, old.action || "");
    var stage = textOr(phase, "pending");
    var next = {
        action: kind,
        iface: textOr(old.iface, ""),
        status: "pending",
        error: "",
        confirmed: !!old.confirmed
    };

    if (stage === "cancelled") {
        next.status = "cancelled";
        next.error = "cancelled";
        next.confirmed = false;
    } else if (stage === "confirmed") {
        next.status = "confirmed";
        next.confirmed = true;
    } else if (stage === "failed" || (exitCode !== undefined && Number(exitCode) !== 0)) {
        next.status = "failed";
        next.error = textOr(error, "action-failed");
        next.confirmed = false;
    }
    return next;
}

function wifiRowKey(network) {
    if (!network) return "";
    var ssid = textOr(network.name !== undefined ? network.name : network.ssid, "");
    var security = textOr(network.security, "unknown");
    // NetworkManager can expose the same SSID more than once during a scan.
    // A profile is keyed by SSID and security, not by the transient AP object.
    return (ssid || "<hidden>") + "\u0000" + security;
}

function wifiSnapshot(network) {
    if (!network) return null;
    var ssid = textOr(network.name !== undefined ? network.name : network.ssid, "");
    var signal = numberOr(network.signal !== undefined ? network.signal : network.signalStrength, 0);
    if (signal >= 0 && signal <= 1) signal *= 100;
    return {
        key: wifiRowKey(network),
        ssid: ssid,
        label: ssid || "Hidden network",
        connected: !!network.connected,
        known: !!network.known,
        signal: Math.max(0, Math.min(100, Math.round(signal))),
        security: network.security,
        requiresCredentials: !!network.requiresCredentials,
        hidden: ssid === ""
    };
}

function wifiRowIsBetter(candidate, current) {
    if (!current) return true;
    if (!!candidate.connected !== !!current.connected) return !!candidate.connected;
    if (!!candidate.known !== !!current.known) return !!candidate.known;
    return numberOr(candidate.signal, 0) > numberOr(current.signal, 0);
}

function compareWifiRows(a, b) {
    if (!!a.connected !== !!b.connected) return a.connected ? -1 : 1;
    if (!!a.known !== !!b.known) return a.known ? -1 : 1;
    var signalDelta = numberOr(b.signal, 0) - numberOr(a.signal, 0);
    if (signalDelta) return signalDelta;
    return textOr(a.label, "").localeCompare(textOr(b.label, ""));
}

// Keep the rows as plain values. Holding a WifiNetwork QObject in a Repeater
// delegate lets a scan destroy the object while QML is still painting it.
function projectWifiRows(networks, previousRows) {
    var byKey = {};
    var count = networks && isFinite(Number(networks.length))
        ? Math.max(0, Math.floor(Number(networks.length))) : 0;
    for (var i = 0; i < count; i++) {
        var network = networks[i];
        var row = wifiSnapshot(network);
        if (!row || !row.key) continue;
        if (wifiRowIsBetter(row, byKey[row.key])) byKey[row.key] = row;
    }

    var rows = Object.keys(byKey).map(function(key) { return byKey[key]; });
    var old = Array.isArray(previousRows) ? previousRows : [];
    var next = [];
    old.forEach(function(row) {
        if (row && byKey[row.key]) {
            next.push(byKey[row.key]);
            delete byKey[row.key];
        }
    });
    Object.keys(byKey).map(function(key) { return byKey[key]; })
        .sort(compareWifiRows)
        .forEach(function(row) { next.push(row); });
    return old.length ? next : rows.sort(compareWifiRows);
}

function wifiState(device, networkManagerAvailable, radioEnabled, hardwareEnabled, scanning) {
    if (!networkManagerAvailable || !device) return "unavailable";
    if (hardwareEnabled === false) return "hardware-blocked";
    if (radioEnabled === false) return "software-disabled";
    if (scanning) return "scanning";
    var networks = device.networks && device.networks.values ? device.networks.values : [];
    return networks.some(function(network) { return network && network.connected; })
        ? "connected" : "available";
}

// OWE is encrypted but does not authenticate the user. Unknown security
// remains credentialed so a newly exposed security type cannot silently skip
// the password/management handoff.
function wifiRequiresCredentials(security, openSecurity, oweSecurity) {
    return security !== openSecurity && security !== oweSecurity;
}

function wifiActionState(previous, action, phase, token, error) {
    var old = previous || {};
    var stage = textOr(phase, "pending");
    var next = {
        action: textOr(action, old.action || ""),
        key: textOr(old.key, ""),
        status: "pending",
        error: "",
        token: token === undefined ? numberOr(old.token, 0) : numberOr(token, 0),
        confirmed: false
    };
    if (stage === "cancelled") {
        next.status = "cancelled";
        next.error = "cancelled";
    } else if (stage === "confirmed") {
        next.status = "confirmed";
        next.confirmed = true;
    } else if (stage === "failed") {
        next.status = "failed";
        next.error = textOr(error, "connection-failed");
    } else if (stage === "idle") {
        next.status = "idle";
    }
    return next;
}

function wifiFailureLabel(error) {
    switch (textOr(error, "")) {
    case "timeout":
    case "confirmation-timeout":
        return "Connection timed out";
    case "bad-password":
        return "Wrong password";
    case "network-unavailable":
        return "Network unavailable";
    case "cancelled":
        return "Cancelled";
    default:
        return error ? "Connection failed" : "";
    }
}

function classifyWifiProcessFailure(stderr, exitCode) {
    if (Number(exitCode) === 0) return "";
    var message = textOr(stderr, "").toLowerCase();
    if (/secret|password|authentication|associat/.test(message)) return "bad-password";
    if (/not found|no network|unavailable|device.*exist/.test(message)) return "network-unavailable";
    if (/timeout|timed out/.test(message)) return "timeout";
    return "connection-failed";
}

function wifiFailureForReason(reason, credentialed, reasons) {
    var values = reasons || {};
    if (credentialed && values.NoSecrets !== undefined && reason === values.NoSecrets) return "bad-password";
    if (credentialed && values.WifiAuthTimeout !== undefined && reason === values.WifiAuthTimeout) return "bad-password";
    if (values.WifiNetworkLost !== undefined && reason === values.WifiNetworkLost) return "network-unavailable";
    if (values.WifiClientDisconnected !== undefined && reason === values.WifiClientDisconnected) return "network-unavailable";
    if (values.WifiClientFailed !== undefined && reason === values.WifiClientFailed) return "connection-failed";
    return "connection-failed";
}

function shouldRepromptWifi(reason, credentialed, reasons) {
    var values = reasons || {};
    return !!credentialed && (
        (values.NoSecrets !== undefined && reason === values.NoSecrets)
        || (values.WifiAuthTimeout !== undefined && reason === values.WifiAuthTimeout)
    );
}

function parseQrMatrix(lines) {
    var rows = Array.isArray(lines) ? lines : [];
    if (rows.length === 0) return { rows: [], size: 0 };

    var size = String(rows[0]).length;
    if (size === 0 || size !== rows.length) return { rows: [], size: 0 };
    for (var i = 0; i < rows.length; i++) {
        var row = String(rows[i]);
        if (row.length !== size || !/^[01]+$/.test(row))
            return { rows: [], size: 0 };
    }
    return { rows: rows.map(function(row) { return String(row); }), size: size };
}

function parseQrOutput(raw) {
    var lines = textOr(raw, "").replace(/\r\n/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    var meta = { iface: "", security: "", ssid: "" };
    if (lines.length > 0 && lines[0].indexOf("meta\t") === 0) {
        var fields = lines.shift().split("\t");
        meta.iface = fields[1] || "";
        meta.security = fields[2] || "";
        meta.ssid = fields.slice(3).join("\t");
    }
    return { meta: meta, matrix: parseQrMatrix(lines) };
}

// Process output is one secret line. Remove transport framing without
// trimming spaces that may be part of the password.
function stripTrailingLineBreak(raw) {
    return textOr(raw, "").replace(/(?:\r\n|\r|\n)+$/, "");
}

// The speed helper emits one numeric Mbps sample per line. Accept tagged
// samples too, so a fake helper or a future helper can make the phase explicit
// without making the overlay depend on process timing.
function parseSpeedProgress(raw, fallbackPhase) {
    var line = textOr(raw, "").trim();
    if (!line) return null;

    var fields = line.split(/\s+/);
    var phase = textOr(fallbackPhase, "");
    var value;
    if (fields.length === 1) {
        value = fields[0];
    } else if (fields.length === 3 && fields[0] === "progress") {
        phase = fields[1];
        value = fields[2];
    } else if (fields.length === 2 && (fields[0] === "down" || fields[0] === "up")) {
        phase = fields[0];
        value = fields[1];
    } else {
        return null;
    }

    if (phase !== "down" && phase !== "up") return null;
    var mbps = Number(value);
    if (!isFinite(mbps) || mbps < 0) return null;
    return { phase: phase, mbps: mbps };
}

function parseSpeedTestProgress(raw, fallbackPhase) {
    return parseSpeedProgress(raw, fallbackPhase);
}

function speedTestFailureLabel(error) {
    switch (textOr(error, "")) {
    case "cancelled":
        return "Speed test cancelled";
    case "route-changed":
        return "Connection changed; speed test cancelled";
    case "timeout":
        return "Speed test timed out";
    case "dependency-missing":
        return "Speed test dependencies unavailable";
    case "route-lost":
        return "Default Route lost; speed test cancelled";
    default:
        return error ? textOr(error, "Speed test failed") : "Speed test failed";
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        DEFAULT_PROBE: DEFAULT_PROBE,
        emptyState: emptyState,
        parseRouteOutput: parseRouteOutput,
        parseKeyValue: parseKeyValue,
        parseStatus: parseStatus,
        parseNetworkStatus: parseNetworkStatus,
        splitEscapedFields: splitEscapedFields,
        parseWiredProfiles: parseWiredProfiles,
        eligibleWiredProfiles: eligibleWiredProfiles,
        wiredProfileChoice: wiredProfileChoice,
        routeAvailability: routeAvailability,
        wiredActionState: wiredActionState,
        wifiRowKey: wifiRowKey,
        wifiSnapshot: wifiSnapshot,
        projectWifiRows: projectWifiRows,
        wifiState: wifiState,
        wifiRequiresCredentials: wifiRequiresCredentials,
        wifiActionState: wifiActionState,
        wifiFailureLabel: wifiFailureLabel,
        classifyWifiProcessFailure: classifyWifiProcessFailure,
        wifiFailureForReason: wifiFailureForReason,
        shouldRepromptWifi: shouldRepromptWifi,
        parseQrMatrix: parseQrMatrix,
        parseQrOutput: parseQrOutput,
        stripTrailingLineBreak: stripTrailingLineBreak,
        parseSpeedProgress: parseSpeedProgress,
        parseSpeedTestProgress: parseSpeedTestProgress,
        speedTestFailureLabel: speedTestFailureLabel,
        wifiIconFor: wifiIconFor,
        connectionIcon: connectionIcon,
        formatHeaderSpeed: formatHeaderSpeed,
        formatHeaderFreq: formatHeaderFreq,
        bandForFrequency: bandForFrequency,
        bandLabel: bandLabel,
        bandSectionTitle: bandSectionTitle,
        bandTooltip: bandTooltip,
        parseBandStatus: parseBandStatus,
        normalizeDnsServers: normalizeDnsServers,
        dnsProviderForValues: dnsProviderForValues,
        parseDnsStatus: parseDnsStatus,
        dnsProviderServers: dnsProviderServers,
        validateDnsServers: validateDnsServers,
        dnsStatusMatches: dnsStatusMatches,
        dnsActionState: dnsActionState,
        dnsFailureLabel: dnsFailureLabel,
        classifyDnsProcessFailure: classifyDnsProcessFailure,
        wifiDeviceInterface: wifiDeviceInterface,
        activeWifiDevices: activeWifiDevices,
        wifiDevicePriority: wifiDevicePriority,
        selectWifiDevice: selectWifiDevice,
        bandActionState: bandActionState,
        bandFailureLabel: bandFailureLabel,
        formatAddress: formatAddress,
        formatLink: formatLink,
        formatBytes: formatBytes,
        formatRate: formatRate,
        pingSampleValue: pingSampleValue,
        appendPingSample: appendPingSample,
        averagePingLatency: averagePingLatency,
        packetLossPercent: packetLossPercent,
        pingState: pingState,
        pingLatencyState: pingLatencyState,
        trafficDelta: trafficDelta,
        throughputState: throughputState,
        classifyFailure: classifyFailure,
        failureLabel: failureLabel,
        stateWithSamples: stateWithSamples,
        normalizeState: normalizeState
    };
}
