import QtQuick
import Quickshell
import Quickshell.Services.UPower

// One threshold watcher for the whole shell. Status Clusters are replicated
// per monitor, so keeping notifications in them would emit one per monitor.
QtObject {
    id: root

    readonly property UPowerDevice battery: UPower.displayDevice
    readonly property bool charging: battery?.state === UPowerDeviceState.Charging
    readonly property int percent: {
        const raw = battery?.percentage ?? 0;
        return Math.round(raw > 1 ? raw : raw * 100);
    }

    property int lastPercent: -1

    onPercentChanged: {
        const previous = lastPercent;
        lastPercent = percent;
        if (previous < 0)
            return;

        if (charging) {
            if (previous < 100 && percent >= 100)
                notify("normal", "Battery Full!");
            else if (previous < 80 && percent >= 80)
                notify("normal", "Battery 80% Full!");
        } else {
            if (previous > 10 && percent <= 10)
                notify("critical", "Very Low Battery");
            else if (previous > 30 && percent <= 30)
                notify("normal", "Low Battery");
        }
    }

    function notify(urgency: string, message: string): void {
        Quickshell.execDetached(["notify-send", "-u", urgency, message]);
    }
}
