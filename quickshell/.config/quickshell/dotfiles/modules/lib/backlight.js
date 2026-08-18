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

    if (!/^\d+$/.test(fields[2]) || !/^\d+%$/.test(fields[3]) || !/^\d+$/.test(fields[4]))
        return null;
    const current = Number.parseInt(fields[2], 10);
    const percent = Number.parseInt(fields[3], 10);
    const maximum = Number.parseInt(fields[4], 10);
    if (!fields[0] || maximum < 1 || current > maximum || percent > 100)
        return null;

    return { current, maximum };
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

function initialState() {
    return { available: false, percent: 0, maximum: 0, pendingAdjustment: 0 };
}

function queueAdjustment(state, step) {
    return {
        available: state.available,
        percent: state.percent,
        maximum: state.maximum,
        pendingAdjustment: state.pendingAdjustment + step,
    };
}

function confirm(state, result) {
    return {
        available: true,
        percent: percentForRaw(result.current, result.maximum),
        maximum: result.maximum,
        pendingAdjustment: state.pendingAdjustment,
    };
}

function readFailed(state) {
    return {
        available: false,
        percent: state.percent,
        maximum: state.maximum,
        pendingAdjustment: state.pendingAdjustment,
    };
}

function takeAdjustment(state) {
    if (!state.available || state.maximum < 1 || state.pendingAdjustment === 0)
        return null;

    const target = Math.max(0, Math.min(100, state.percent + state.pendingAdjustment));
    return {
        state: {
            available: state.available,
            percent: state.percent,
            maximum: state.maximum,
            pendingAdjustment: 0,
        },
        command: writeCommand(rawForPercent(target, state.maximum)),
    };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        readCommand,
        writeCommand,
        parse,
        rawForPercent,
        percentForRaw,
        initialState,
        queueAdjustment,
        confirm,
        readFailed,
        takeAdjustment,
    };
}
