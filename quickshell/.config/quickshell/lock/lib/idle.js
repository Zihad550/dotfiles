var DIM = "dim";
var LOCK = "lock";
var BLANK = "blank";
var SUSPEND = "suspend";
var STAGES = [DIM, LOCK, BLANK, SUSPEND];

function initial(timings) {
    var normalized = {};
    var previous = -1;

    STAGES.forEach(function(stage) {
        var value = timings && timings[stage];
        if (value === null || value === undefined) {
            normalized[stage] = null;
            return;
        }
        if (typeof value !== "number" || !isFinite(value) || value < 0)
            throw new Error(stage + " timing must be a non-negative number or null");
        if (value < previous)
            throw new Error("enabled Stage timings must follow configured order");
        normalized[stage] = value;
        previous = value;
    });

    return { timings: normalized, fired: [] };
}

function advance(state, elapsedSeconds, inhibited) {
    if (inhibited)
        return { state: state, entered: [], exited: [] };

    var entered = STAGES.filter(function(stage) {
        var timeout = state.timings[stage];
        return timeout !== null && timeout <= elapsedSeconds
            && state.fired.indexOf(stage) === -1;
    });
    if (entered.length === 0)
        return { state: state, entered: [], exited: [] };

    return {
        state: { timings: state.timings, fired: state.fired.concat(entered) },
        entered: entered,
        exited: []
    };
}

function resetOnActivity(state) {
    if (state.fired.length === 0)
        return { state: state, entered: [], exited: [] };

    return {
        state: initial(state.timings),
        entered: [],
        exited: state.fired.slice().reverse()
    };
}

if (typeof module !== "undefined")
    module.exports = { DIM, LOCK, BLANK, SUSPEND, STAGES, initial, advance, resetOnActivity };
