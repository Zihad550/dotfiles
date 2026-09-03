// Plain Tailscale Profile state shared by the Tailscale Page and its tests.
// Normalizes `bin/df-tailscale profiles` output; see TailscaleService.qml's
// header for why the singleton, not the Page, owns this state. Privilege and
// failure handling: docs/adr/0030-tailscale-privilege-and-failure-handling.md

var EMPTY_MESSAGE = "No saved Tailscale profiles.";
var UNSUPPORTED_MESSAGE = "Profile switching is unavailable in this Tailscale version.";
var MALFORMED_MESSAGE = "Tailscale profile list malformed.";
var DAEMON_FAILURE_MESSAGE = "Tailscale profile list unavailable.";
var PERMISSION_MESSAGE = "Tailscale needs administrator permission, and authentication was cancelled or denied.";
var TIMEOUT_MESSAGE = "Tailscale operation timed out.";
var AUTH_REQUIRED_MESSAGE = "This Profile needs authentication";
var OPERATION_FAILURE_MESSAGE = "Tailscale operation failed.";

function textOr(value, fallback) {
    return value === undefined || value === null ? fallback : String(value);
}

// bin/df-tailscale forwards tailscale's raw text on a real (non-permission)
// failure, which can still carry its own operator/sudo advice lines --
// never shown to the user verbatim (see the ADR this module's header points
// to).
function stripPrivilegeAdvice(text) {
    return textOr(text, "")
        .split("\n")
        .filter(function(line) {
            var trimmed = line.trim();
            return !/^use '.*sudo.*'\.?$/i.test(trimmed) && !/--operator/i.test(trimmed);
        })
        .join("\n")
        .trim();
}

function looksLikeAuthRequired(text) {
    return /to authenticate, visit/i.test(textOr(text, ""));
}

// Shared by classifyProfiles and classifyAction: reads the two retry exit
// codes from bin/df-tailscale's contract (see its header), plus the one
// state neither exit code alone can tell -- a Profile stuck waiting on
// browser authentication, recognized from tailscale's own fixed wording
// rather than an exit code, since `timeout` can kill that wait before
// tailscale ever gets to report it as a distinct failure.
function classifyExit(exitCode, stdout, stderr) {
    var code = Number(exitCode);
    if (looksLikeAuthRequired(stdout) || looksLikeAuthRequired(stderr)) {
        return { state: "authentication-required", message: AUTH_REQUIRED_MESSAGE };
    }
    if (code === 3) {
        return { state: "unsupported", message: UNSUPPORTED_MESSAGE };
    }
    if (code === 4) {
        return { state: "permission-cancelled", message: PERMISSION_MESSAGE };
    }
    if (code === 5) {
        return { state: "timeout", message: TIMEOUT_MESSAGE };
    }
    return null;
}

// nickname -> tailnet -> account -> id, matching the issue's fallback order.
function profileLabel(profile) {
    var nickname = textOr(profile.nickname, "").trim();
    if (nickname) return nickname;
    var tailnet = textOr(profile.tailnet, "").trim();
    if (tailnet) return tailnet;
    var account = textOr(profile.account, "").trim();
    if (account) return account;
    return textOr(profile.id, "").trim();
}

// Only shown when it adds information the label does not already carry.
function profileDetail(profile, label) {
    var tailnet = textOr(profile.tailnet, "").trim();
    if (tailnet && tailnet !== label) return tailnet;
    var account = textOr(profile.account, "").trim();
    if (account && account !== label) return account;
    return "";
}

function normalizeProfile(raw) {
    var profile = raw || {};
    var label = profileLabel(profile);
    return {
        id: textOr(profile.id, ""),
        tailnet: textOr(profile.tailnet, ""),
        account: textOr(profile.account, ""),
        nickname: textOr(profile.nickname, ""),
        current: profile.selected === true,
        label: label,
        detail: profileDetail(profile, label)
    };
}

// Preserves `tailscale switch --list --json`'s array order.
function normalizeProfiles(list) {
    return (Array.isArray(list) ? list : []).map(normalizeProfile);
}

// Reads `bin/df-tailscale profiles`'s exit-code contract (see its header) and
// classifies the result into the Page's visible states.
function classifyProfiles(exitCode, stdout, stderr) {
    var code = Number(exitCode);
    var shared = classifyExit(code, stdout, stderr);
    if (shared) {
        return { state: shared.state, profiles: [], message: shared.message };
    }
    if (code !== 0) {
        var reason = stripPrivilegeAdvice(stderr);
        return { state: "daemon-failure", profiles: [], message: reason || DAEMON_FAILURE_MESSAGE };
    }

    var trimmed = textOr(stdout, "").trim();
    if (!trimmed) {
        return { state: "empty", profiles: [], message: EMPTY_MESSAGE };
    }

    var parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        parsed = undefined;
    }
    if (!Array.isArray(parsed)) {
        return { state: "malformed", profiles: [], message: MALFORMED_MESSAGE };
    }

    var profiles = normalizeProfiles(parsed);
    if (profiles.length === 0) {
        return { state: "empty", profiles: [], message: EMPTY_MESSAGE };
    }
    return { state: "ready", profiles: profiles, message: "" };
}

// Reads the same exit-code contract for switch/connect (`enable()` reuses
// connect's subcommand -- see TailscaleService.qml). No list to parse here,
// so this only ever classifies pass/fail, never a Profile array.
function classifyAction(exitCode, stdout, stderr) {
    var shared = classifyExit(exitCode, stdout, stderr);
    if (shared) {
        return shared;
    }
    if (Number(exitCode) === 0) {
        return { state: "ok", message: "" };
    }
    var reason = stripPrivilegeAdvice(stderr);
    return { state: "failure", message: reason || OPERATION_FAILURE_MESSAGE };
}

// Everything a later attempt could plausibly answer differently. "unsupported"
// is a fact about the installed Tailscale and "empty" is a successful answer,
// so neither offers a Retry Row.
function isRetryableState(state) {
    return state === "permission-cancelled" || state === "timeout"
        || state === "authentication-required" || state === "daemon-failure"
        || state === "malformed";
}

function currentProfile(profiles) {
    return (Array.isArray(profiles) ? profiles : []).find(function(profile) {
        return profile.current;
    }) || null;
}

// "ready" and "empty" both come from a load that actually reached the
// daemon; "unsupported"/"daemon-failure"/"malformed" did not.
function isSettledState(state) {
    return state === "ready" || state === "empty";
}

// A refresh that fails must not blank a Page that already shows a good list,
// but the failure still has to be visible: the retained Profiles are carried
// into the failed result rather than the failure being dropped.
function mergeProfilesResult(previous, next) {
    if (isSettledState(next.state)) {
        return next;
    }
    var retained = (previous || {}).profiles;
    if (!Array.isArray(retained) || retained.length === 0) {
        return next;
    }
    return { state: next.state, profiles: retained, message: next.message };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        EMPTY_MESSAGE: EMPTY_MESSAGE,
        UNSUPPORTED_MESSAGE: UNSUPPORTED_MESSAGE,
        MALFORMED_MESSAGE: MALFORMED_MESSAGE,
        DAEMON_FAILURE_MESSAGE: DAEMON_FAILURE_MESSAGE,
        PERMISSION_MESSAGE: PERMISSION_MESSAGE,
        TIMEOUT_MESSAGE: TIMEOUT_MESSAGE,
        AUTH_REQUIRED_MESSAGE: AUTH_REQUIRED_MESSAGE,
        OPERATION_FAILURE_MESSAGE: OPERATION_FAILURE_MESSAGE,
        stripPrivilegeAdvice: stripPrivilegeAdvice,
        profileLabel: profileLabel,
        profileDetail: profileDetail,
        normalizeProfile: normalizeProfile,
        normalizeProfiles: normalizeProfiles,
        classifyProfiles: classifyProfiles,
        classifyAction: classifyAction,
        isRetryableState: isRetryableState,
        currentProfile: currentProfile,
        isSettledState: isSettledState,
        mergeProfilesResult: mergeProfilesResult
    };
}
