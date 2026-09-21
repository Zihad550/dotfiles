function parseDisplays(text) {
    if (typeof text !== "string" || text.trim() === "")
        return [];

    try {
        var monitors = JSON.parse(text);
        if (!Array.isArray(monitors))
            return [];
        return monitors.filter(function (monitor) {
            return monitor && typeof monitor.name === "string" && monitor.name !== "";
        }).map(function (monitor) {
            return {
                name: monitor.name,
                description: typeof monitor.description === "string" ? monitor.description : "",
                enabled: monitor.disabled !== true,
                focused: monitor.focused === true
            };
        });
    } catch (error) {
        return [];
    }
}

function enabledCount(displays) {
    return displays.filter(function (display) { return display.enabled; }).length;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        parseDisplays: parseDisplays,
        enabledCount: enabledCount
    };
}
