pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    property string profile: "default"
    readonly property var profiles: [
        { id: "default", label: "Default", detail: "Original hold times", icon: "󰌌" },
        { id: "laptop", label: "Laptop", detail: "Hold times +10 ms", icon: "󰌢" }
    ]
    property bool loadingProfile: false
    property string profileError: ""
    property bool installed: false
    property bool active: false
    property bool changing: false
    property bool refreshing: false
    readonly property bool busy: root.changing || root.refreshing || root.loadingProfile

    function refresh(): void {
        if (root.busy)
            return;
        root.refreshing = true;
        statusProcess.running = true;
        root.loadingProfile = true;
        profileStatusProcess.running = true;
    }

    function toggle(): void {
        if (root.busy || !root.installed)
            return;
        root.changing = true;
        toggleProcess.command = ["systemctl", root.active ? "stop" : "start", "kanata.service"];
        toggleProcess.running = true;
    }

    function selectProfile(profile: string): void {
        if (root.busy || !root.installed || root.profile === profile)
            return;
        if (!root.profiles.some(item => item.id === profile))
            return;
        root.changing = true;
        toggleProcess.command = ["df-kanata-profile", profile];
        toggleProcess.running = true;
    }

    Process {
        id: profileStatusProcess

        command: ["df-kanata-profile", "current"]
        stdout: StdioCollector {
            id: profileOutput
            waitForEnd: true
        }
        stderr: StdioCollector {
            id: profileStderr
            waitForEnd: true
        }
        onExited: exitCode => {
            if (exitCode === 0) {
                root.profile = profileOutput.text.trim();
                root.profileError = "";
            } else {
                const error = profileStderr.text.trim() || "Could not read the Kanata profile.";
                // Refresh runs on a timer; report each distinct failure once.
                if (error !== root.profileError)
                    Quickshell.execDetached(["notify-send", "-u", "critical", "Kanata", error]);
                root.profileError = error;
            }
            root.loadingProfile = false;
        }
    }

    Component.onCompleted: root.refresh()

    Process {
        id: statusProcess

        command: ["systemctl", "show", "kanata.service", "--property=LoadState,ActiveState"]
        stdout: StdioCollector {
            id: statusOutput
            waitForEnd: true
        }
        stderr: StdioCollector {}
        onExited: exitCode => {
            const lines = statusOutput.text.trim().split("\n");
            root.installed = exitCode === 0 && lines.includes("LoadState=loaded");
            root.active = root.installed && lines.includes("ActiveState=active");
            root.refreshing = false;
        }
    }

    Process {
        id: toggleProcess

        stderr: StdioCollector {
            id: toggleError
            waitForEnd: true
        }
        onExited: exitCode => {
            root.changing = false;
            if (exitCode !== 0)
                Quickshell.execDetached(["notify-send", "-u", "critical", "Kanata",
                    toggleError.text.trim() || "Could not change the Kanata service state."]);
            root.refresh();
        }
    }
}
