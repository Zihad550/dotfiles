// A real JavaScript array from a QML model's `values`.
//
// `values` is a QML *sequence*, not a JS Array -- `Array.isArray()` returns
// false for it even though it has `length`, indexing, `map` and `filter`, so
// an `Array.isArray` guard silently misreads a populated model as empty.
// This checks for the shape actually needed (a numeric `length`) instead.
//
// Callers pass the model through optional chaining (`Hyprland.toplevels?.values`)
// so a renamed or absent model arrives here as undefined and costs an empty
// list rather than a broken binding.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/sequence.test.js).
function listOf(values) {
    if (values === undefined || values === null || typeof values.length !== "number")
        return [];

    var out = [];
    for (var i = 0; i < values.length; i++)
        out.push(values[i]);
    return out;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        listOf: listOf
    };
}
