# 02 — Host probe: keyboard focus and duplicate SSIDs

**What to build:** Nothing. Two facts that cannot be established without a compositor, and that decide how 05 is built.

**Blocked by:** None — can start immediately.

**Status:** needs-info — waiting on host results.

- [ ] Known whether a `PopupWindow` under `HyprlandFocusGrab` receives keystrokes
- [ ] If it does not, known whether `WlrLayershell.keyboardFocus: OnDemand` on the bar fixes it
- [ ] Known whether `WifiDevice.networks` collapses one SSID advertised by several access points

## Why these two

**Keyboard focus.** `Bar.qml` is a `PanelWindow` that sets no `keyboardFocus`,
so it defaults to `WlrKeyboardFocus.None` — nothing in the bar has ever
accepted a keystroke. The Launcher sets `OnDemand` explicitly
(`Launcher.qml:60`) precisely because it needs typing. Whether the focus grab
alone is enough for a popup, or the layer surface must also ask, decides
whether 05 is a `TextInput` or a `TextInput` plus focus juggling on every
open and close. If `OnDemand` turns out to be required it must be set only
while the panel is shown — a bar that permanently takes focus would interfere
with every application.

**Duplicate SSIDs.** An office or home mesh advertises one SSID from several
access points. If the model surfaces each one, the Page shows three identical
rows and needs to dedupe by name keeping the strongest. If it already collapses
them, that code should not be written.

## Manual verification

Write this to `quickshell/.config/quickshell/test/shell.qml`:

```qml
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Networking

ShellRoot {
    PanelWindow {
        id: panel
        anchors { top: true; left: true; right: true }
        implicitHeight: 40
        color: "#222"

        // The question: is this line needed for the TextInput below to work?
        // Comment it out for run 1, uncomment for run 2.
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

        TextInput {
            anchors.centerIn: parent
            width: 300
            color: "white"
            font.pixelSize: 16
            focus: true
            onTextChanged: console.log("PROBE typed:", text)
        }
    }

    readonly property var wifi: Networking.devices.values
        .find(d => d.type === DeviceType.Wifi) ?? null

    Component.onCompleted: {
        if (!wifi) { console.log("PROBE no wifi device"); return; }
        wifi.scannerEnabled = true;
    }

    Timer {
        interval: 6000
        running: true
        onTriggered: {
            const names = wifi.networks.values.map(n => n.name);
            console.log("PROBE total networks:", names.length);
            console.log("PROBE names:", JSON.stringify(names));
            const dupes = names.filter((n, i) => names.indexOf(n) !== i);
            console.log("PROBE duplicate SSIDs:", JSON.stringify(dupes));
            wifi.scannerEnabled = false;
        }
    }
}
```

**Run 1** — with the `keyboardFocus` line commented out:

```bash
df-qs-test
```

Click the black strip at the top, then type `hello`.

**Pass/fail is the point, not pass:** if `PROBE typed: hello` appears, the
focus grab is enough and 05 needs no focus work. If nothing appears, keyboard
focus must be asked for.

**Run 2** — uncomment the `keyboardFocus` line, `Ctrl-C`, run `df-qs-test`
again, click and type.

**Pass:** `PROBE typed: hello` appears. That confirms `OnDemand` is the fix and
05 sets it only while the panel is shown.

**Both runs** print the SSID lines after ~6s. Record all three:

```
PROBE total networks: 12
PROBE names: ["MyWiFi","MyWiFi","Neighbour",…]
PROBE duplicate SSIDs: ["MyWiFi"]
```

**Empty `duplicate SSIDs`** → the model already collapses access points, and
the Page needs no dedupe. **Non-empty** → the Page dedupes by name, keeping the
strongest.

Paste all output back; delete the test config afterwards.
