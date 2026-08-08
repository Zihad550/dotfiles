import QtQuick

// The half of the Provider interface that says "I am reached by being
// entered, not by a prefix": `nested`, the enter()/leave() pair that drives
// it, and the reset that drops it when the Launcher closes. Launcher.qml's
// `nestedProvider` hands the entire pool to whichever Provider sets
// `nested`, saving/restoring the Query across the way in and out.
//
// Inherited rather than copied into each Provider, so changing what
// "entered" means doesn't mean editing nine files.
//
// `active` is required, not defaulted: a Provider bound to nothing would
// carry `entered` into a later session and reopen the Launcher already
// inside itself. A subtype with its own dismiss work declares its own
// `onActiveChanged` and calls leave() from it, overriding this handler
// rather than adding to it.
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
