function readCommand() {
    return ["brightnessctl", "--class=backlight", "--machine-readable", "info"];
}

function writeCommand(raw) {
    return ["brightnessctl", "--class=backlight", "--machine-readable", "set", `${raw}`];
}

function parse(line) {
    const fields = String(line).trim().split(",");
    if (fields.length < 5 || fields[1] !== "backlight")
        return null;

    const current = Number.parseInt(fields[2], 10);
    const percent = Number.parseInt(fields[3], 10);
    const maximum = Number.parseInt(fields[4], 10);
    if (!fields[0] || !Number.isInteger(current) || !Number.isInteger(percent)
            || !Number.isInteger(maximum) || maximum < 1 || current < 0)
        return null;

    return { device: fields[0], current, maximum, percent };
}

function rawForPercent(percent, maximum) {
    if (!Number.isFinite(maximum) || maximum < 1)
        return 0;
    const clamped = Math.max(0, Math.min(100, percent));
    return Math.max(1, Math.min(maximum, Math.round(1 + clamped / 100 * (maximum - 1))));
}

function percentForRaw(current, maximum) {
    if (!Number.isFinite(maximum) || maximum <= 1)
        return current > 0 ? 100 : 0;
    const clamped = Math.max(1, Math.min(maximum, current));
    return Math.round((clamped - 1) / (maximum - 1) * 100);
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = { readCommand, writeCommand, parse, rawForPercent, percentForRaw };
}
