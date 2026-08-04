import QtQuick

// The half of the Provider interface that says "I am reached by being entered,
// not by a prefix": `nested`, the enter()/leave() pair that drives it, and the
// reset that drops it when the Launcher closes.
//
// Launcher.qml's `nestedProvider` hands the entire pool to whichever Provider
// sets `nested`, and its `onNestedProviderChanged` saves and restores the Query
// across the way in and out. Directories.qml built that for its open-with
// chooser; every Provider without a prefix now reuses it, because
// lib/providerlist.js's reachOf has no shape for a Provider that has neither.
//
// Inherited rather than copied: nine Providers held these same four members
// byte for byte, so changing what "entered" means meant editing nine files.
//
// `active` is required, not defaulted: a Provider bound to nothing would carry
// `entered` into a later session and reopen the Launcher already inside itself.
// A subtype with its own dismiss work declares `onActiveChanged` and calls
// leave() from it -- that overrides this handler rather than adding to it.
QtObject {
    id: nestable

    required property bool active
    onActiveChanged: {
        if (!nestable.active)
            nestable.leave();
    }

    property bool entered: false
    readonly property bool nested: nestable.entered

    function enter(): void {
        nestable.entered = true;
    }

    function leave(): void {
        nestable.entered = false;
    }
}
