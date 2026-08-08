import QtQuick
import Quickshell
import "../lib/matching.js" as Matching

// The applications Provider: installed desktop entries, matched on their name.
// Quickshell.DesktopEntries already handles .desktop parsing, icon lookup and
// Terminal=true, so there's none of that here.
//
// The Provider interface (which properties a Provider may/must expose, and
// the Entry/Action shapes) is documented in docs/launcher-spec.md under
// "Interface: Provider" -- this file is the canonical example.
NestableProvider {
    id: root

    readonly property string label: "applications"
    readonly property string description: "Installed applications"

    // 0 is never legitimate here (unlike the windows Provider), so this lets
    // the window say "still waiting" rather than "no matches".
    readonly property bool ready: root.catalog.entries.length > 0

    // A binding, not a Component.onCompleted snapshot: DesktopEntries
    // populates asynchronously (0 entries at load, then the full list a
    // second or two later), and a snapshot would give a permanently empty
    // Launcher with nothing to explain it.
    readonly property var catalog: {
        const applications = DesktopEntries.applications.values.filter(application => !application.noDisplay);

        // No sub-line: the comment/generic name are noise next to a name that
        // already says what the thing is (the windows Provider needs one; this
        // doesn't).
        const entries = applications.map(application => ({
            name: application.name,
            subtext: "",
            icon: application.icon,
            // The desktop entry id: stable across restarts, so it's a valid Entry Key.
            key: application.id,

            provider: root,
            target: application
        }));

        // Match on name alone -- folding in comment/generic name would inflate
        // the haystack and skew score()'s length tie-break toward terser entries.
        return {
            entries: entries,
            corpus: Matching.prepare(entries.map(entry => entry.name), entries.map(entry => entry.key))
        };
    }

    readonly property string home: Quickshell.env("HOME")

    // Runs the application in its own systemd unit under app.slice rather than
    // as a child of this process: it outlives `df-qs-restart launcher`, can't
    // starve the compositor/bar under session.slice, and the OOM killer /
    // `uwsm stop` act on it individually.
    readonly property var launchPrefix: ["uwsm-app", "--"]

    // ghostty is the repo's fallback when TERMINAL isn't set (matches what
    // NetworkItem/BluetoothItem already hardcode in the bar).
    readonly property string terminal: Quickshell.env("TERMINAL") || "ghostty"

    // Exec line as an argv array, field codes stripped. The string-split
    // branch would mangle a quoted argument -- untested so far, since no
    // installed entry's Exec has one.
    function commandOf(application) {
        const command = application.command;
        if (command === undefined || command === null)
            return [];
        if (typeof command === "string")
            return command.split(" ").filter(part => part !== "");
        if (command.length !== undefined)
            return Array.prototype.slice.call(command);
        return [];
    }

    // Desktop entries aren't shell input, so a leading `~` (as in the webapp
    // entries df-webapp-install writes) doesn't expand on its own; this
    // handles that one case rather than routing exec through a shell.
    function expandHome(part) {
        if (part === "~")
            return root.home;
        if (part.startsWith("~/"))
            return root.home + part.slice(1);
        return part;
    }

    // Primary only: a secondary action would just launch a second copy, and
    // desktop actions ("New Private Window") are a list, not a single Action.
    readonly property var actions: ({
        primary: {
            label: "launch",
            invoke: entry => root.launch(entry)
        }
    })

    // The primary Action.
    function launch(entry): void {
        const application = entry.target;
        const argv = root.commandOf(application);

        // Fallback: execute() can't take a launch prefix, so this loses
        // launchPrefix's process isolation -- but launching unscoped still
        // beats not launching.
        if (argv.length === 0) {
            console.warn("launcher: no command for", entry.name, "-- launching unscoped");
            application.execute();
            return;
        }

        // A Terminal=true entry names a command, not a window -- without a
        // terminal wrapping it, the process exits immediately with nothing
        // visible (e.g. yazi). Wrapped before launchPrefix, so systemd tracks
        // the terminal (the window that actually exists), not the bare command.
        const command = argv.map(root.expandHome);
        const wrapped = application.runInTerminal ? [root.terminal, "-e"].concat(command) : command;

        Quickshell.execDetached(root.launchPrefix.concat(wrapped));
    }
}
