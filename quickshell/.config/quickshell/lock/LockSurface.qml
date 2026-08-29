import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Services.Pam
import "lib/lockstate.js" as LockState

// What a locked screen looks like and what typing into it does: the blurred
// wallpaper, the clock, the password field, and the PAM conversation behind
// it. It knows nothing about session locks -- it is an Item, so the real lock
// surface and the probe window can both host it. That is what makes the
// appearance safe to iterate on (docs/session-lifecycle-spec.md).
//
// Layout and the shrink-to-fit password dots are ported from Omarchy's
// shell/plugins/lock/LockView.qml, read at revision
// 83881e979b35468c3e7d60b171e319ede61a88fd. Its fingerprint affordance is not
// ported: no box this repo configures has the hardware.
Item {
    id: root

    // False in the probe until it has focus, and false in the real lock until
    // the compositor reports the surface Secure -- keystrokes before that are
    // not guaranteed to be exclusive to the lock.
    property bool inputEnabled: true

    // The probe sets this false so a background it cannot see is not decoded.
    property bool loadWallpaper: true

    // Not `state`: Item already has one, and shadowing it would put the
    // password field's phase in the same name as QML's state machine.
    property var auth: LockState.initial()

    readonly property bool authenticating: auth.phase === LockState.AUTHENTICATING

    signal unlocked()

    function reset(): void {
        if (pam.active)
            pam.abort();
        root.auth = LockState.reset(root.auth);
        field.text = "";
    }

    function focusField(): void {
        field.forceActiveFocus();
    }

    function submit(): void {
        const next = LockState.begin(root.auth);
        if (next === root.auth)
            return;

        root.auth = next;
        field.text = "";

        // start() failing is a broken stack, not a wrong password -- there is
        // no verdict to report, so it must not read as one.
        if (!pam.start())
            root.auth = LockState.errored(root.auth);
    }

    // PAM asks for the password on its own schedule: the prompt can arrive
    // before or after start() returns, so both paths funnel here and the
    // guards make a duplicate call harmless.
    function answerPrompt(): void {
        if (!root.authenticating || !pam.active || !pam.responseRequired)
            return;
        pam.respond(root.auth.password);
    }

    Theme {
        id: theme
    }

    PamContext {
        id: pam

        // The lock's own PAM service, with its own lockout policy and its own
        // faillock tally -- see setup/arch-hyprland/setup-packages/setup-lock-pam.
        config: "df-lock"
        user: Quickshell.env("USER") || Quickshell.env("LOGNAME")

        onResponseRequiredChanged: root.answerPrompt()
        onPamMessage: root.answerPrompt()

        onCompleted: result => {
            root.auth = result === PamResult.Success
                ? LockState.succeed(root.auth)
                : LockState.fail(root.auth);

            if (root.auth.phase === LockState.UNLOCKED)
                root.unlocked();
        }

        onError: root.auth = LockState.errored(root.auth)
    }

    Rectangle {
        anchors.fill: parent
        color: theme.background

        Image {
            id: wallpaper

            anchors.fill: parent
            // The same file swaybg draws and hyprlock used, so locking does
            // not change the picture -- only its focus.
            source: root.loadWallpaper ? `file://${Quickshell.env("HOME")}/.config/theme/background` : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            sourceSize.width: width
            sourceSize.height: height
        }

        MultiEffect {
            anchors.fill: wallpaper
            source: wallpaper
            autoPaddingEnabled: false
            blurEnabled: root.loadWallpaper && wallpaper.status === Image.Ready
            blur: 1.0
            blurMax: 128
            blurMultiplier: 1.25
            contrast: -0.08
        }

        Rectangle {
            anchors.fill: parent
            color: theme.scrim
        }

        // Anything landing on the surface belongs to the field; there is
        // nothing else here to click.
        MouseArea {
            anchors.fill: parent
            onClicked: root.focusField()
        }

        Text {
            id: clock

            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: fieldFrame.top
            anchors.bottomMargin: theme.clockGap

            text: Qt.formatDateTime(clockTick.now, "HH:mm")
            color: theme.foreground
            font.family: theme.fontFamily
            font.pixelSize: theme.clockFontSize
        }

        Rectangle {
            id: fieldFrame

            anchors.centerIn: parent
            width: theme.fieldWidth
            height: theme.fieldHeight
            radius: theme.fieldRadius
            color: theme.fieldBackground
            border.width: theme.outlineThickness
            border.color: LockState.statusIsError(root.auth) ? theme.error : theme.accent
            clip: true

            TextInput {
                id: field

                anchors.fill: parent
                anchors.margins: theme.outlineThickness + 18

                horizontalAlignment: TextInput.AlignHCenter
                verticalAlignment: TextInput.AlignVCenter
                echoMode: TextInput.Password
                passwordCharacter: "●"
                passwordMaskDelay: 0
                // Enabled throughout, read-only while PAM is in flight: a
                // disabled TextInput drops active focus, and with nothing
                // focused the host never sees Escape -- which, under a hung
                // PAM, is a probe holding the keyboard with no way out.
                enabled: root.inputEnabled
                readOnly: !LockState.acceptsInput(root.auth)
                color: theme.foreground
                selectionColor: theme.selection
                selectedTextColor: theme.foreground
                font.family: theme.fontFamily
                // Shrink the dots once the password outgrows the field, so
                // every keystroke stays visible rather than clipping silently.
                font.pixelSize: text.length > 0
                    ? Math.max(1, Math.floor(theme.dotFontSize * dotScale))
                    : theme.fieldFontSize
                font.letterSpacing: text.length > 0 ? theme.dotSpacing * dotScale : 0
                // Shown only over typed characters, and never during a check:
                // an empty field is already saying "Enter Password", and a
                // caret blinking under "Checking…" reads as still typeable.
                cursorVisible: activeFocus && !readOnly && text.length > 0
                cursorDelegate: Rectangle {
                    width: 2
                    color: theme.foreground
                    visible: field.cursorVisible
                }

                readonly property real dotScale: dotMetrics.advanceWidth > 0
                    ? Math.min(1, (field.width - 4) / dotMetrics.advanceWidth)
                    : 1

                onTextChanged: root.auth = LockState.edit(root.auth, text)
                onAccepted: root.submit()

                // Escape and Ctrl-U clear the field -- but an Escape on an
                // already-empty field is left unaccepted so it reaches the
                // host, which is how the probe hands the keyboard back.
                Keys.onPressed: event => {
                    const clearing = event.key === Qt.Key_Escape
                        || (event.modifiers & Qt.ControlModifier && event.key === Qt.Key_U);
                    if (!clearing || field.readOnly || field.text.length === 0)
                        return;

                    field.text = "";
                    event.accepted = true;
                }

                // Measures the mask at full size; dotScale compares it against
                // the field to decide how far the dots have to shrink.
                TextMetrics {
                    id: dotMetrics

                    font.family: theme.fontFamily
                    font.pixelSize: theme.dotFontSize
                    font.letterSpacing: theme.dotSpacing
                    text: "●".repeat(field.text.length)
                }
            }

            Text {
                anchors.fill: field
                visible: field.text.length === 0

                text: LockState.statusText(root.auth)
                color: LockState.statusIsError(root.auth) ? theme.error : theme.placeholder
                font.family: theme.fontFamily
                font.pixelSize: theme.fieldFontSize
                font.italic: LockState.statusIsError(root.auth)
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                elide: Text.ElideRight
            }
        }
    }

    Timer {
        id: clockTick

        property date now: new Date()

        interval: 1000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: now = new Date()
    }

    onInputEnabledChanged: refocus()

    function refocus(): void {
        if (inputEnabled)
            Qt.callLater(focusField);
    }

    Component.onCompleted: refocus()
}
