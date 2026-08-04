// Round two of the foundation probe for .scratch/launcher/issues/01.
//
//     df-qs-test launcher-probe
//
// Round one answered unknown 3 outright (the matching module loads under both
// QML and node, and agrees with the node tests) and got partway through the
// other two. What it actually established:
//
//   Unknown 1: `Quickshell.Hyprland.GlobalShortcut` exists, and `hyprctl
//   globalshortcuts` lists `launcherprobe:open` -- so registration reaches the
//   compositor. Whether it FIRES is still open, because round one could not
//   observe it: `shortcut.pressed` evaluated to `false`, not to a signal, so
//   `.connect` was never going to work. `pressed` is a bool property shadowing
//   the signal of the same name in JavaScript. The handlers below are declared
//   in the snippet instead, which resolves the signal properly.
//
//   Unknown 2: still open, and weaker evidence than it looked. Round one's YES
//   only proved a QtObject could be constructed -- a `property var x:
//   DesktopEntries.applications` binding constructs fine even when
//   `DesktopEntries` is undefined. The number that mattered was `0
//   applications`, and 0 is what decides whether ticket 04 is small (the API
//   gives names, icons and terminal handling) or large (hand-rolled .desktop
//   parsing plus icon-theme lookup).
//
// Still Qt.createQmlObject rather than static imports, for the same reason as
// round one: a type or signal that does not exist is a compile error for the
// whole file, which would tell us nothing except that the file is broken.
//
// This config is temporary and goes away with ticket 01.

import QtQuick
import Quickshell

ShellRoot {
    id: root

    // Kept alive so the shortcut is still registered when you press the key.
    property var shortcut: null

    function probe(label, source) {
        let object = null;
        let error = "";
        try {
            object = Qt.createQmlObject(source, root);
        } catch (e) {
            error = e.message !== undefined ? e.message : String(e);
        }

        if (object !== null && object !== undefined) {
            console.log("  YES  " + label);
        } else {
            console.log("  no   " + label + (error !== "" ? "  -- " + error.split("\n")[0] : ""));
        }
        return object;
    }

    function field(object, name) {
        try {
            const value = object[name];
            if (value === undefined)
                return "(absent)";
            if (value === null)
                return "(null)";
            return String(value);
        } catch (e) {
            return "(threw)";
        }
    }

    Component.onCompleted: {
        console.log("");
        console.log("=== launcher foundation probe, round two =============================");
        console.log("");

        probeUnknown1();
        probeUnknown2();

        console.log("");
        console.log("=== press the key now ===============================================");
        console.log("Leave this running. See the instructions under unknown 1 above.");
        console.log("");
    }

    // ---- unknown 1: does a registered shortcut actually fire? ---------------

    function probeUnknown1() {
        console.log("-- unknown 1: does the shortcut FIRE --");

        // Two spellings, because `pressed` is a bool property and may also be a
        // signal. If it is a signal, `onPressed` binds to it. If it is only a
        // property, `onPressed` is a compile error and `onPressedChanged` is
        // the handler -- which fires on release too, but proves the same thing.
        const spellings = [
            ["onPressed", 'onPressed: console.log("\\n  *** SHORTCUT FIRED (onPressed) -- unknown 1 is YES ***\\n")'],
            ["onPressedChanged", 'onPressedChanged: console.log("\\n  *** SHORTCUT STATE CHANGED (onPressedChanged) -> " + pressed + " -- unknown 1 is YES ***\\n")']
        ];

        for (let i = 0; i < spellings.length; i++) {
            const object = probe("GlobalShortcut { " + spellings[i][0] + " }",
                'import Quickshell.Hyprland\n'
                + 'GlobalShortcut {\n'
                + '    appid: "launcherprobe"\n'
                + '    name: "open"\n'
                + '    ' + spellings[i][1] + '\n'
                + '}');

            if (object !== null && object !== undefined) {
                root.shortcut = object;
                console.log("       pressed = " + field(object, "pressed")
                    + "  (a bool property, which is why round one's .connect failed)");
                console.log("");
                console.log("       Now make it fire. `hyprctl dispatch global launcherprobe:open`");
                console.log("       will NOT work here -- this setup runs Hyprland's Lua config,");
                console.log("       where hyprctl evaluates the argument as Lua. Pass an");
                console.log("       expression instead:");
                console.log("");
                console.log("         hyprctl dispatch \"hl.dsp.global('launcherprobe:open')\"");
                console.log("");
                console.log("       Then the path that actually matters -- a real keypress. In");
                console.log("       hypr/.config/hypr/lua/bindings/system.lua:");
                console.log("");
                console.log("         o.bind('SUPER + SLASH', 'probe', hl.dsp.global('launcherprobe:open'))");
                console.log("");
                console.log("       then `hyprctl reload` and press SUPER + /.");
                console.log("");
                console.log("       Registering without firing is the trap -- it looks identical");
                console.log("       to success until the key is pressed.");
                return;
            }
        }

        console.log("       The type exists and registers (hyprctl globalshortcuts listed it)");
        console.log("       but neither handler spelling compiles, so nothing here can observe");
        console.log("       a press. Paste the two errors above -- they name the real signal.");
    }

    // ---- unknown 2: is there anything in DesktopEntries? --------------------

    function probeUnknown2() {
        console.log("");
        console.log("-- unknown 2: desktop entries --");

        // Round one could not tell "the singleton is missing" from "it is there
        // and empty", because both leave the binding undefined. This does.
        const holder = probe("DesktopEntries resolves at all",
            'import QtQuick\nimport Quickshell\n'
            + 'QtObject {\n'
            + '    property string kind: typeof DesktopEntries\n'
            + '    property var applications: DesktopEntries.applications\n'
            + '    property string appsKind: typeof DesktopEntries.applications\n'
            + '}');

        if (holder === null || holder === undefined) {
            console.log("       ticket 04 hand-rolls .desktop parsing, icon-theme lookup and");
            console.log("       Terminal=true handling. Size it accordingly.");
            return;
        }

        console.log("       typeof DesktopEntries              = " + field(holder, "kind"));
        console.log("       typeof DesktopEntries.applications = " + field(holder, "appsKind"));

        if (field(holder, "kind") === "undefined") {
            console.log("       -> the singleton is NOT there. Round one's YES was the QtObject");
            console.log("          being constructible, not the API existing. Ticket 04 is the");
            console.log("          large version.");
            return;
        }

        console.log("       XDG_DATA_DIRS = " + Quickshell.env("XDG_DATA_DIRS"));
        console.log("       XDG_DATA_HOME = " + Quickshell.env("XDG_DATA_HOME"));

        report(holder, "at startup");

        // If scanning is asynchronous, an empty model at Component.onCompleted
        // means nothing. Two seconds is generous for a directory walk.
        delayed.holder = holder;
        delayed.start();
    }

    // Every route to a count, because which one works says what shape the model
    // is -- and a wrong route is indistinguishable from an empty model, which is
    // exactly the ambiguity round one fell into.
    function report(holder, when) {
        const applications = holder.applications;
        if (applications === undefined || applications === null) {
            console.log("       " + when + ": applications is " + String(applications));
            return;
        }

        const viaValues = applications.values !== undefined && applications.values !== null
            ? applications.values.length : "(no .values)";
        const viaLength = applications.length !== undefined ? applications.length : "(no .length)";
        let viaRowCount = "(no rowCount)";
        try {
            if (typeof applications.rowCount === "function")
                viaRowCount = applications.rowCount();
        } catch (e) {}

        console.log("       " + when + ": .values.length=" + viaValues
            + "  .length=" + viaLength + "  rowCount()=" + viaRowCount);

        const list = applications.values !== undefined && applications.values !== null
            ? applications.values : applications;
        const count = list !== undefined && list !== null && list.length !== undefined ? list.length : 0;

        for (let i = 0; i < Math.min(3, count); i++) {
            const entry = list[i];
            console.log("       [" + i + "] id=" + field(entry, "id")
                + " name=" + field(entry, "name"));
            console.log("            icon=" + field(entry, "icon")
                + " terminal=" + field(entry, "runInTerminal")
                + " noDisplay=" + field(entry, "noDisplay"));
            console.log("            execute=" + (typeof entry.execute === "function" ? "yes" : "(absent)")
                + " command=" + field(entry, "command"));
        }

        if (count > 0) {
            console.log("       The three that matter for ticket 04: a resolvable `icon`, a");
            console.log("       `runInTerminal` flag, and an `execute()` that honours it.");
        }
    }

    Timer {
        id: delayed

        property var holder: null

        interval: 2000
        onTriggered: {
            root.report(delayed.holder, "after 2s");
            console.log("");
            console.log("       Still 0 after 2s with XDG_DATA_DIRS set means the API is there");
            console.log("       but finds nothing -- an environment problem, not a missing API,");
            console.log("       and it would hit the bar's config too.");
            console.log("");
        }
    }
}
