// Shared timing for Bar panel toggles. Keep this small so the click-through
// guard can be exercised without constructing a Wayland window in Node.
var REOPEN_SUPPRESSION_MS = 250;

function shouldSuppressReopen(lastCleared, now) {
    var elapsed = Number(now) - Number(lastCleared);
    return elapsed >= 0 && elapsed < REOPEN_SUPPRESSION_MS;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        REOPEN_SUPPRESSION_MS: REOPEN_SUPPRESSION_MS,
        shouldSuppressReopen: shouldSuppressReopen,
    };
}
