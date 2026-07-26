import QtQuick
import Quickshell
import Quickshell.Services.UPower
import qs

// waybar: "battery", format "{icon} {capacity}%", on-click `elephant menu system`,
// tooltip "{power}W↓ {capacity}%", plus notify-send events at 30/10/80/100.
BarItem {
    id: root

    readonly property UPowerDevice battery: UPower.displayDevice
    readonly property bool charging: battery?.state === UPowerDeviceState.Charging
    readonly property bool full: battery?.state === UPowerDeviceState.FullyCharged

    // UPower reports 0-100 over DBus but quickshell normalises some values to
    // 0.0-1.0; accept either so the reading is never off by 100x.
    readonly property int percent: {
        const raw = battery?.percentage ?? 0;
        return Math.round(raw > 1 ? raw : raw * 100);
    }

    readonly property var chargingIcons: ["󰢜", "󰂆", "󰂇", "󰂈", "󰢝", "󰂉", "󰢞", "󰂊", "󰂋", "󰂅"]
    readonly property var dischargingIcons: ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"]

    property int lastPercent: -1

    text: {
        if (!battery?.isLaptopBattery)
            return "";
        if (full)
            return "󰂅";
        const icons = charging ? chargingIcons : dischargingIcons;
        const index = Math.min(icons.length - 1, Math.floor(percent / 100 * icons.length));
        return `${icons[index]} ${percent}%`;
    }

    tooltipText: {
        const watts = Math.round(battery?.changeRate ?? 0);
        return charging ? `${watts}W↑ ${percent}%` : `${watts}W↓ ${percent}%`;
    }

    onClicked: Quickshell.execDetached(["elephant", "menu", "system"])

    // Reimplements waybar's battery "events" block.
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
