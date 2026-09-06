// The webapps Provider's pure half: recognizing Desktop Entries installed by
// the repo's webapp launchers, building keyless Entries, and the removal argv.
//
// Free of QML types so it loads under a plain JavaScript runtime too
// (tests/launcher/webapps.test.js).

var LAUNCHER_RE = /(?:^|\/)df-launch(?:-special|-or-focus)?-webapp$/;
var URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function commandOf(application) {
    if (!application)
        return [];

    var command = application.command;
    if (typeof command === "string")
        return command.trim() === "" ? [] : command.trim().split(/\s+/);
    if (command && command.length !== undefined)
        return Array.prototype.slice.call(command);
    return [];
}

function launcherOf(application) {
    var command = commandOf(application);
    if (command.length === 0 || typeof command[0] !== "string")
        return null;
    return LAUNCHER_RE.test(command[0]) ? command[0] : null;
}

function isWebapp(application) {
    return launcherOf(application) !== null;
}

// The URL is the first URI argument after the launcher. This handles the
// extra identity/workspace arguments of the special launchers and keeps an
// absolute launcher path out of the displayed URL.
function urlFor(application) {
    if (!isWebapp(application))
        return "";

    var command = commandOf(application);
    for (var i = 1; i < command.length; i++) {
        if (typeof command[i] === "string" && URL_RE.test(command[i]))
            return command[i];
    }
    return "";
}

function entryFor(application, provider) {
    return {
        name: application.name,
        subtext: urlFor(application),
        icon: application.icon,
        provider: provider,
        target: application
    };
}

function textsFor(application, entry) {
    return [entry.name];
}

// Desktop Entry IDs are the application filename without `.desktop`, which
// is exactly the name df-webapp-remove appends when it resolves the entry.
function removeArgv(home, id) {
    return [home + "/dotfiles/bin/df-webapp-remove", String(id), "--force"];
}

// Success is represented by the row disappearing, so only failure produces a
// notification. stderr remains the command's own explanation where present.
function notifyArgv(name, exitCode, stderr) {
    if (exitCode === 0)
        return null;

    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Remove failed: " + name, detail];
}

function catalogOf(applications, provider) {
    var entries = [];
    var texts = [];
    var items = applications || [];

    for (var i = 0; i < items.length; i++) {
        if (!isWebapp(items[i]))
            continue;

        var entry = entryFor(items[i], provider);
        entries.push(entry);
        texts.push(textsFor(items[i], entry)[0]);
    }

    return { entries: entries, texts: texts };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        commandOf: commandOf,
        launcherOf: launcherOf,
        isWebapp: isWebapp,
        urlFor: urlFor,
        entryFor: entryFor,
        textsFor: textsFor,
        catalogOf: catalogOf,
        removeArgv: removeArgv,
        notifyArgv: notifyArgv
    };
}
