// brightnessctl owns the udev rule that makes the backlight writable without
// root; --class=backlight keeps discovery off keyboard/indicator LEDs.
function readCommand() {
    return ["brightnessctl", "--class=backlight", "--machine-readable", "info"];
}

function writeCommand(raw) {
    return ["brightnessctl", "--class=backlight", "--machine-readable", "set", `${raw}`];
}

// --machine-readable prints `name,class,current,NN%,max`.
function parse(line) {
    const fields = String(line).trim().split(",");
    if (fields.length < 5 || fields[1] !== "backlight")
        return null;

    if (!/^\d+$/.test(fields[2]) || !/^\d+%$/.test(fields[3]) || !/^\d+$/.test(fields[4]))
        return null;
    const current = Number.parseInt(fields[2], 10);
    const percent = Number.parseInt(fields[3], 10);
    const maximum = Number.parseInt(fields[4], 10);
    if (!fields[0] || !Number.isSafeInteger(current) || !Number.isSafeInteger(percent)
            || !Number.isSafeInteger(maximum) || maximum < 1 || current > maximum || percent > 100)
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
    return { available: false, percent: 0, maximum: 0, pendingAdjustment: 0, writeInFlight: false };
}

// Quickshell's JS engine rejects object-spread syntax (`{ ...state }`), so
// state updates go through Object.assign instead.
function withState(state, changes) {
    return Object.assign({}, state, changes);
}

function queueAdjustment(state, step) {
    return withState(state, { pendingAdjustment: state.pendingAdjustment + step });
}

function confirm(state, result) {
    return withState(state, {
        available: true,
        percent: percentForRaw(result.current, result.maximum),
        maximum: result.maximum,
    });
}

function readFailed(state) {
    return withState(state, { available: false });
}

function takeAdjustment(state) {
    if (!state.available || state.maximum < 1 || state.pendingAdjustment === 0 || state.writeInFlight)
        return null;

    const target = Math.max(0, Math.min(100, state.percent + state.pendingAdjustment));
    return {
        state: withState(state, { pendingAdjustment: 0, writeInFlight: true }),
        command: writeCommand(rawForPercent(target, state.maximum)),
    };
}

function settleRead(state, exitCode, result) {
    if (exitCode === 0 && result)
        return { state: confirm(state, result), succeeded: true };
    return { state: readFailed(state), succeeded: false };
}

function settleWrite(state, exitCode, result) {
    if (exitCode === 0 && result) {
        const confirmedState = confirm(withState(state, { writeInFlight: false }), result);
        return { state: confirmedState, confirmedPercent: confirmedState.percent, refresh: false };
    }

    return {
        state: withState(state, { writeInFlight: false }),
        confirmedPercent: null,
        refresh: true,
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
        settleRead,
        settleWrite,
    };
}
