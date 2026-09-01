// The pure half of the Directories Provider's post-launch coordination.
// QML owns the compositor snapshot and Timer; this module decides whether a
// newly focused window is an unambiguous result and what name it receives.

var POLL_INTERVAL_MS = 100;
var TIMEOUT_MS = 3000;

var TERMINAL_IDS = [
    "com.mitchellh.ghostty",
    "ghostty"
];

var APPLICATION_IDS = {
    zed: ["dev.zed.Zed", "zed"],
    code: ["com.visualstudio.code", "code", "code-oss", "code-url-handler"],
    cursor: ["com.todesktop.230313mzl4w4u92", "cursor"],
    files: ["org.gnome.Nautilus", "nautilus"],
    nvim: TERMINAL_IDS,
    herdr: TERMINAL_IDS
};

function basenameOf(path) {
    var value = String(path || "").replace(/\/+$/, "");
    var slash = value.lastIndexOf("/");
    return slash < 0 ? value : value.slice(slash + 1);
}

// An issue token is more useful than a generic project word when the Bar has
// to elide the rest of the persistent Workspace Name.
function directoryHintOf(path) {
    var basename = basenameOf(path);
    var tokens = basename.split(/[-_\s.]+/).filter(token => token !== "");
    if (tokens.length === 0)
        return "";

    var selected = tokens[0];
    for (var i = 0; i < tokens.length; i++) {
        if (/\d/.test(tokens[i])) {
            selected = tokens[i];
            break;
        }
    }

    return selected.toLowerCase().slice(0, 5);
}

function workspaceNameFor(workspaceId, application, directoryHint) {
    return String(workspaceId) + "-" + application + "(" + directoryHint + ")";
}

function idsFor(application) {
    return APPLICATION_IDS[String(application || "").toLowerCase()] || [];
}

function applicationMatches(application, appId) {
    if (!appId)
        return false;

    var wanted = String(appId).toLowerCase();
    return idsFor(application).some(id => String(id).toLowerCase() === wanted);
}

function isTerminalHosted(application) {
    var key = String(application || "").toLowerCase();
    return key === "nvim" || key === "herdr";
}

function identityOf(window) {
    if (!window)
        return "";
    if (window.address !== undefined && window.address !== null && window.address !== "")
        return String(window.address);
    if (window.id !== undefined && window.id !== null && window.id !== "")
        return String(window.id);
    return "";
}

function workspaceIdOf(window) {
    if (!window)
        return null;
    if (window.workspaceId !== undefined && window.workspaceId !== null)
        return window.workspaceId;

    var workspace = window.workspace;
    if (workspace !== undefined && workspace !== null) {
        if (typeof workspace === "object" && workspace.id !== undefined && workspace.id !== null)
            return workspace.id;
        if (typeof workspace !== "object")
            return workspace;
    }
    return null;
}

function workspaceNameOf(window) {
    if (!window)
        return "";
    if (window.workspaceName !== undefined && window.workspaceName !== null)
        return String(window.workspaceName);

    var workspace = window.workspace;
    if (workspace && typeof workspace === "object" && workspace.name !== undefined)
        return String(workspace.name);
    return "";
}

function isSpecialWorkspace(window) {
    var id = workspaceIdOf(window);
    var name = workspaceNameOf(window);
    return Number(id) < 0 || name === "special" || name.indexOf("special:") === 0;
}

function isFocused(window) {
    return !!window && (window.focused === true || window.activated === true);
}

function previousWindowsByIdentity(before) {
    var result = {};
    for (var i = 0; i < (before || []).length; i++) {
        var identity = identityOf(before[i]);
        if (identity !== "")
            result[identity] = before[i];
    }
    return result;
}

// Only a focus transition or a new window is evidence that the launch caused
// this result. Treat an already-focused matching window as unobservable: a
// failed request must not overwrite a Workspace Name by accident. Neovim and
// Herdr both launch through Ghostty, so their existing terminal windows have
// no identity that distinguishes them from an unrelated terminal.
function destinationFor(before, after, application, excluded) {
    var previous = previousWindowsByIdentity(before);
    var focused = (after || []).filter(window =>
        isFocused(window) && applicationMatches(application, window.appId)
            && !(excluded && excluded[identityOf(window)]));

    if (focused.length !== 1)
        return null;

    var candidate = focused[0];
    var identity = identityOf(candidate);
    if (identity === "")
        return null;

    var old = previous[identity];
    if (old && (isFocused(old) || isTerminalHosted(application)))
        return null;

    var workspaceId = workspaceIdOf(candidate);
    if (workspaceId === null || workspaceId === undefined || isSpecialWorkspace(candidate))
        return null;

    return {
        identity: identity,
        window: candidate,
        workspaceId: workspaceId,
        workspaceName: workspaceNameOf(candidate)
    };
}

function begin(before, request) {
    return {
        before: before || [],
        request: request,
        elapsedMs: 0
    };
}

function poll(state, snapshot, excluded) {
    if (!state)
        return { state: null, destination: null, done: true };

    var destination = destinationFor(state.before, snapshot, state.request.application, excluded);
    if (destination !== null)
        return { state: null, destination: destination, done: true };

    var elapsedMs = state.elapsedMs + POLL_INTERVAL_MS;
    if (elapsedMs >= TIMEOUT_MS)
        return { state: null, destination: null, done: true };

    return {
        state: {
            before: state.before,
            request: state.request,
            elapsedMs: elapsedMs
        },
        destination: null,
        done: false
    };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        POLL_INTERVAL_MS: POLL_INTERVAL_MS,
        TIMEOUT_MS: TIMEOUT_MS,
        directoryHintOf: directoryHintOf,
        workspaceNameFor: workspaceNameFor,
        applicationMatches: applicationMatches,
        isTerminalHosted: isTerminalHosted,
        destinationFor: destinationFor,
        begin: begin,
        poll: poll
    };
}
