import QtQuick
import Quickshell
import Quickshell.Services.Pam
import "lib/lockstate.js" as LockState

// The PAM conversation and the password field's state, held once for the whole
// lock rather than once per screen.
//
// Every screen gets its own LockSurface. With a conversation each, each would
// count its own failures while faillock counted them all -- so the number on
// the screen you happened to type on would be the only true one, and a password
// half-typed before you looked at the other monitor would be gone.
//
// The hoist follows Omarchy's shell/plugins/lock/Service.qml, read at revision
// 83881e979b35468c3e7d60b171e319ede61a88fd, which keeps this state out of its
// lock view for the same reason. Its fingerprint conversation is not ported: no
// box this repo configures has the hardware.
//
// A plain component, not a Singleton, for the reason Theme.qml gives: it is
// reached from two config roots, and a singleton resolves through only one.
QtObject {
    id: root

    property var state: LockState.initial()

    readonly property bool authenticating: state.phase === LockState.AUTHENTICATING

    signal unlocked()

    // Deliberately not `LockState.initial()` at the call site: re-locking must
    // not carry the previous lock's attempt count or error onto the screen.
    function reset(): void {
        if (pam.active)
            pam.abort();
        root.state = LockState.reset(root.state);
    }

    function edit(text: string): void {
        root.state = LockState.edit(root.state, text);
    }

    function submit(): void {
        const next = LockState.begin(root.state);
        if (next === root.state)
            return;

        root.state = next;

        // start() failing is a broken stack, not a wrong password -- there is
        // no verdict to report, so it must not read as one.
        if (!pam.start())
            root.state = LockState.errored(root.state);
    }

    // PAM asks for the password on its own schedule: the prompt can arrive
    // before or after start() returns, so both paths funnel here and the
    // guards make a duplicate call harmless.
    function answerPrompt(): void {
        if (!root.authenticating || !pam.active || !pam.responseRequired)
            return;
        pam.respond(root.state.pending);
    }

    property PamContext conversation: PamContext {
        id: pam

        // The lock's own PAM service, with its own lockout policy and its own
        // faillock tally -- see setup/arch-workstation/setup-packages/setup-lock-pam.
        config: "df-lock"
        user: Quickshell.env("USER") || Quickshell.env("LOGNAME")

        onResponseRequiredChanged: root.answerPrompt()
        onPamMessage: root.answerPrompt()

        onCompleted: result => {
            root.state = result === PamResult.Success
                ? LockState.succeed(root.state)
                : LockState.fail(root.state);

            if (root.state.phase === LockState.UNLOCKED)
                root.unlocked();
        }

        onError: root.state = LockState.errored(root.state)
    }
}
