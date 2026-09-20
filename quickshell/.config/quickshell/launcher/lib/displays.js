function parseListing(text) {
    if (typeof text !== "string" || text.trim() === "")
        return [];

    try {
        var displays = JSON.parse(text);
        return Array.isArray(displays) ? displays.filter(function (display) {
            return display && typeof display.name === "string" && display.name !== "";
        }) : [];
    } catch (error) {
        return [];
    }
}

function entryFor(display, provider) {
    var state = display.enabled ? "On" : "Off";
    var description = typeof display.description === "string" ? display.description.trim() : "";
    return {
        name: display.name,
        subtext: description === "" ? state : state + " · " + description,
        icon: "video-display",
        key: "display:" + display.name,
        provider: provider,
        target: display
    };
}

function textsFor(display, entry) {
    var texts = [entry.name];
    if (display.description)
        texts.push(display.description);
    texts.push(display.enabled ? "on enabled" : "off disabled");
    return texts;
}

function listArgv(home) {
    return [home + "/dotfiles/bin/df-hypr-close-display", "list"];
}

function toggleArgv(home, name) {
    return [home + "/dotfiles/bin/df-hypr-close-display", "toggle", name];
}

function failureArgv(name, stderr, exitCode) {
    var detail = typeof stderr === "string" ? stderr.trim() : "";
    if (detail === "")
        detail = "exit " + exitCode;
    return ["notify-send", "--urgency=critical", "Display toggle failed: " + name, detail];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseListing: parseListing,
        entryFor: entryFor,
        textsFor: textsFor,
        listArgv: listArgv,
        toggleArgv: toggleArgv,
        failureArgv: failureArgv
    };
}
