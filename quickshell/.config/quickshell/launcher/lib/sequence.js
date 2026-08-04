// A real JavaScript array from a QML model's `values`.
//
// One function, shared by every Provider that reads an ObjectModel --
// Windows.qml (Hyprland.toplevels, ToplevelManager.toplevels) and
// Workspaces.qml (Hyprland.workspaces). It lived in both of those as a
// private copy until ticket 16's review; the copies were identical down to
// the comment, which is the shape of a thing that wanted one home.
//
// **This is the line the first two host runs died on**, so it is worth being
// explicit: `values` is a QML *sequence*, not a JS Array. `Array.isArray()`
// returns **false** for it, even though it has `length`, indexing, `map` and
// `filter` and behaves like an array everywhere else -- which is exactly why
// the bar's `Hyprland.workspaces.values.filter(…)` works and an
// `Array.isArray` guard silently reported zero windows against a model whose
// `rowCount()` was 8.
//
// So the check is for the shape actually needed -- something with a numeric
// length -- and the copy makes everything downstream a real array. Callers
// pass `Model.values` through optional chaining (`Hyprland.toplevels?.values`)
// so a renamed or absent model arrives here as undefined and costs an empty
// list rather than a broken binding.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/sequence.test.js). A QML sequence is not reproducible under
// node, but the property this defends is: an array-*like* -- an object with a
// numeric length and integer keys -- is exactly what QML hands JavaScript,
// and it is what Array.isArray rejects. The tests use one.
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
