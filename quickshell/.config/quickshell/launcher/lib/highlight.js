// Where the highlight goes when the Entries change under it.
//
// Pure and separate for the same reason matching.js is: this is a rule about
// intent, not about drawing, and getting it wrong does not look like a bug. It
// looks like the Launcher preferring something -- which is exactly how it hid.
// The first open after a restart listed no windows for three host rounds, and
// the cause was this rule applied where it did not belong: the highlight
// defaulted to the first application, six windows then arrived above it, the
// highlight followed that application by identity from index 0 to index 6, and
// the view followed the highlight. Nothing was missing and nothing was stale.
//
// Loads under both QML and node -- see the note at the top of matching.js.

// The best match, or nothing when there is nothing to highlight.
function first(entries) {
    return entries.length > 0 ? 0 : -1;
}

// Where the highlight belongs in `entries`, given where it was.
//
// `state` is { pinned, index, entry }:
//   pinned  whether the *user* put the highlight there -- an arrow key. False
//           while it merely defaults to the best match, which is the state an
//           untouched Launcher is in and the one this exists to get right.
//   index   where it was
//   entry   which Entry it was on, for finding it again by identity
//
// Unpinned, the answer is always the best match: there is no intent to
// preserve, and preserving one anyway is how the highlight -- and the view
// behind it -- ends up in the middle of a list nobody has touched.
//
// Pinned, identity wins: an Entry still in the list keeps the highlight even if
// it moved, which is what stops a background window retitling from yanking the
// selection mid-arrow. When it has gone, holding the position is the honest
// fallback -- the list is in the same order, one line of it changed -- clamped
// so a list that shrank cannot leave Enter acting on nothing.
function next(entries, state) {
    if (entries.length === 0)
        return -1;

    if (!state || !state.pinned)
        return first(entries);

    var found = state.entry === null || state.entry === undefined ? -1 : entries.indexOf(state.entry);
    if (found >= 0)
        return found;

    var held = state.index > 0 ? state.index : 0;
    return held < entries.length - 1 ? held : entries.length - 1;
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        first: first,
        next: next
    };
}
