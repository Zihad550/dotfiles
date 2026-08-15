import QtQuick
import Quickshell.Services.UPower
import qs

// waybar: "battery", format "{icon} {capacity}%", on-click `elephant menu system`,
// tooltip "{power}W↓ {capacity}%". BatteryService owns threshold notifications
// once for the whole shell; this component is instantiated once per monitor.
//
// The click no longer opens the system menu -- those entries live in Quick
// Settings now (QuickSettings.powerActions); `elephant menu system` died with
// elephant itself (ticket 19).
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
}
