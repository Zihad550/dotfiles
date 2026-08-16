var WIFI_ICONS = ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"];
var VOLUME_ICONS = ["", "", ""];
var CHARGING_ICONS = ["󰢜", "󰂆", "󰂇", "󰂈", "󰢝", "󰂉", "󰢞", "󰂊", "󰂋", "󰂅"];
var DISCHARGING_ICONS = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"];

function iconAt(values, ratio) {
    var clamped = Math.max(0, Math.min(1, ratio));
    return values[Math.min(values.length - 1, Math.floor(clamped * values.length))];
}

function networkIcon(wiredConnected, wifiAdapterExists, wifiEnabled, wifiConnected, wifiStrength) {
    if (wiredConnected)
        return "󰀂";
    if (!wifiAdapterExists)
        return "";
    if (!wifiEnabled)
        return "󰤭";
    if (!wifiConnected)
        return "󰤮";
    return iconAt(WIFI_ICONS, wifiStrength);
}

function volumeIcon(available, muted, volume) {
    if (!available || muted)
        return "";
    return iconAt(VOLUME_ICONS, volume / 100);
}

function batteryIcon(charging, full, percent) {
    if (full)
        return "󰂅";
    return iconAt(charging ? CHARGING_ICONS : DISCHARGING_ICONS, percent / 100);
}

function batteryTone(charging, percent) {
    if (charging || percent >= 95)
        return "ok";
    if (percent >= 31)
        return "foreground";
    if (percent >= 11)
        return "warn";
    return "error";
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        networkIcon: networkIcon,
        volumeIcon: volumeIcon,
        batteryIcon: batteryIcon,
        batteryTone: batteryTone
    };
}
