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

// Keep the host-confirmed near-max dead zone unreachable; see
// docs/adr/0008-backlight-avoids-literal-max-raw.md.
function safeMaximum(maximum) {
    if (maximum <= 1)
        return maximum;
    const margin = Math.max(1, Math.round(maximum * 0.03));
    return Math.max(1, maximum - margin);
}

function rawForPercent(percent, maximum) {
    if (!Number.isFinite(maximum) || maximum < 1)
        return 0;
    const clamped = Math.max(0, Math.min(100, percent));
    const safeMax = safeMaximum(maximum);
    if (safeMax <= 1)
        return safeMax;
    return Math.max(1, Math.min(safeMax, Math.round(1 + clamped / 100 * (safeMax - 1))));
}

function percentForRaw(current, maximum) {
    if (!Number.isFinite(maximum) || maximum <= 1)
        return current > 0 ? 100 : 0;
    const safeMax = safeMaximum(maximum);
    if (safeMax <= 1)
        return current > 0 ? 100 : 0;
    const clamped = Math.max(1, Math.min(safeMax, current));
    return Math.round((clamped - 1) / (safeMax - 1) * 100);
}

function initialState() {
    return { available: false, percent: 0, requested: 0, maximum: 0, pendingAdjustment: 0, pendingTarget: null, writeInFlight: false };
}

// Quickshell's JS engine rejects object-spread syntax (`{ ...state }`), so
// state updates go through Object.assign instead.
function withState(state, changes) {
    return Object.assign({}, state, changes);
}

// The newest input mode wins: steps accumulate, while absolute targets replace.
function queueAdjustment(state, step) {
    return withState(state, { pendingAdjustment: state.pendingAdjustment + step, pendingTarget: null, requested: state.percent });
}

// The slider's `requested` value updates immediately so the thumb tracks the
// pointer; `percent` only moves once brightnessctl confirms it.
function queueTarget(state, percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    return withState(state, { pendingTarget: clamped, pendingAdjustment: 0, requested: clamped });
}

// A queued pendingTarget means the drag has already moved past this
// confirmation -- reconciling `requested` to it here would snap the thumb
// backward for one frame before the next write lands it back at that target.
function confirm(state, result) {
    const percent = percentForRaw(result.current, result.maximum);
    return withState(state, {
        available: true,
        percent,
        requested: state.pendingTarget === null ? percent : state.requested,
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

// Mirrors takeAdjustment, but for the slider's absolute target: latest value
// wins, so a rapid drag only ever produces one more write.
function takeAbsolute(state) {
    if (!state.available || state.maximum < 1 || state.pendingTarget === null || state.writeInFlight)
        return null;

    return {
        state: withState(state, { pendingTarget: null, writeInFlight: true }),
        command: writeCommand(rawForPercent(state.pendingTarget, state.maximum)),
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

    // Preserve a newer queued target; otherwise roll back to confirmation.
    return {
        state: withState(state, { writeInFlight: false, requested: state.pendingTarget === null ? state.percent : state.requested }),
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
        queueTarget,
        confirm,
        readFailed,
        takeAdjustment,
        takeAbsolute,
        settleRead,
        settleWrite,
    };
}
