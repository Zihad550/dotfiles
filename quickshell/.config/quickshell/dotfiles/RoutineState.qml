pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

Singleton {
    id: root

    readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || `${Quickshell.env("HOME")}/.local/state`
    readonly property string stateDir: `${root.stateHome}/dotfiles`
    readonly property string path: `${root.stateDir}/daily-routine.json`
    property var routine: []
    property var days: ({})
    property string today: dateKey()
    property bool loaded: false
    property bool directoryReady: false
    readonly property bool ready: root.loaded && root.directoryReady
    readonly property var todayItems: (root.days[root.today]?.items ?? []).filter(
        item => root.routine.some(task => task.id === item.id))

    onReadyChanged: {
        if (root.ready)
            root.ensureToday();
    }

    function dateKey(date): string {
        date = date || new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function ensureToday(): void {
        if (!root.ready)
            return;
        root.today = root.dateKey();
        const days = Object.assign({}, root.days);
        const dates = Object.keys(days).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort();
        const last = dates.length > 0 ? dates[dates.length - 1] : "";
        let changed = false;

        if (last && last < root.today) {
            const parts = last.split("-").map(Number);
            const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
            date.setDate(date.getDate() + 1);
            while (root.dateKey(date) <= root.today) {
                const key = root.dateKey(date);
                days[key] = {
                    items: root.routine.map(item => ({ id: item.id, text: item.text, completed: false }))
                };
                changed = true;
                date.setDate(date.getDate() + 1);
            }
        }
        if (!days[root.today]) {
            days[root.today] = {
                items: root.routine.map(item => ({ id: item.id, text: item.text, completed: false }))
            };
            changed = true;
        }

        if (!changed)
            return;
        root.days = days;
        root.save();
    }

    function add(text: string): void {
        const label = text.trim();
        if (!root.ready || !label)
            return;
        root.ensureToday();
        const item = { id: `${Date.now()}-${Math.random()}`, text: label };
        root.routine = root.routine.concat([item]);
        const days = Object.assign({}, root.days);
        days[root.today] = {
            items: days[root.today].items.concat([{ id: item.id, text: item.text, completed: false }])
        };
        root.days = days;
        root.save();
    }

    function toggle(id: string): void {
        if (!root.ready)
            return;
        root.ensureToday();
        if (!root.routine.some(item => item.id === id))
            return;
        const days = Object.assign({}, root.days);
        days[root.today] = {
            items: days[root.today].items.map(item => item.id === id
                ? { id: item.id, text: item.text, completed: !item.completed }
                : item)
        };
        root.days = days;
        root.save();
    }

    function remove(id: string): void {
        if (!root.ready)
            return;
        root.ensureToday();
        root.routine = root.routine.filter(item => item.id !== id);
        root.save();
    }

    function save(): void {
        try {
            file.setText(JSON.stringify({ version: 2, routine: root.routine, days: root.days }));
        } catch (error) {
            console.warn("daily routine: could not save", root.path, error);
        }
    }

    Timer {
        interval: 60000
        running: true
        repeat: true
        onTriggered: root.ensureToday()
    }

    Process {
        command: ["mkdir", "-p", root.stateDir]
        running: true
        onExited: (code) => {
            root.directoryReady = code === 0;
            if (!root.directoryReady)
                console.warn("daily routine: could not create", root.stateDir);
        }
    }

    FileView {
        id: file
        path: root.path
        printErrors: false

        onLoaded: {
            try {
                const parsed = JSON.parse(file.text());
                root.today = root.dateKey();
                if (parsed.version === 2 && Array.isArray(parsed.routine)
                    && parsed.days && typeof parsed.days === "object" && !Array.isArray(parsed.days)) {
                    root.routine = parsed.routine;
                    root.days = parsed.days;
                } else if (Array.isArray(parsed.items)) {
                    const items = parsed.items.filter(item => typeof item.id === "string"
                        && typeof item.text === "string" && typeof item.doneOn === "string");
                    root.routine = items.map(item => ({ id: item.id, text: item.text }));
                    const days = {};
                    // The old format only remembered each item's last completed date.
                    for (const item of items) {
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(item.doneOn) || item.doneOn === root.today)
                            continue;
                        if (!days[item.doneOn])
                            days[item.doneOn] = { items: [], partial: true };
                        days[item.doneOn].items.push({ id: item.id, text: item.text, completed: true });
                    }
                    days[root.today] = {
                        items: items.map(item => ({ id: item.id, text: item.text, completed: item.doneOn === root.today }))
                    };
                    root.days = days;
                    root.save();
                }
            } catch (error) {
                console.warn("daily routine: could not read", root.path, error);
            }
            root.loaded = true;
        }
        onLoadFailed: root.loaded = true
    }
}
