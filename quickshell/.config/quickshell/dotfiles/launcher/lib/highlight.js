// Where the highlight goes when the Entries change under it.
//
// Pure and separate because this is a rule about intent, not drawing, and
// getting it wrong doesn't look like a bug -- it looks like a preference,
// which is exactly how a real defect hid: the highlight defaulted to the
// first application, six windows then arrived above it, and following the
// highlighted Entry by identity dragged the highlight (and view) down with them.
//
// Loads under both QML and node -- see the note at the top of matching.js.

function first(entries) {
    return entries.length > 0 ? 0 : -1;
}

function hasKey(entry) {
    return entry !== null && entry !== undefined
        && entry.key !== null && entry.key !== undefined;
}

function keyedIndexOf(entries, entry) {
    if (!hasKey(entry))
        return -1;

    return entries.findIndex(candidate =>
        candidate.provider === entry.provider && candidate.key === entry.key);
}

// Where the highlight belongs in `entries`, given where it was.
// `state` is { pinned, index, entry }:
//   pinned  whether the *user* put it there (an arrow key), vs. defaulting
//   index   where it was
//   entry   which Entry it was on, for finding it again
//
// Pinned keyed Entries follow Provider + Entry Key, or reset if gone.
// Keyless Entries retain object identity, then the clamped position.
function next(entries, state) {
    if (entries.length === 0)
        return -1;

    if (!state || !state.pinned)
        return first(entries);

    var found = keyedIndexOf(entries, state.entry);
    if (found < 0)
        found = state.entry === null || state.entry === undefined ? -1 : entries.indexOf(state.entry);
    if (found >= 0)
        return found;
    if (hasKey(state.entry))
        return first(entries);

    var held = state.index > 0 ? state.index : 0;
    return held < entries.length - 1 ? held : entries.length - 1;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        first: first,
        next: next
    };
}
