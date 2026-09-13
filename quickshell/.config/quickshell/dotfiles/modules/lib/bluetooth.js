function deviceLabel(device) {
    if (!device) return "";
    return String(device.deviceName || device.name || "").trim();
}

function toArray(values) {
    if (!values) return [];
    if (Array.isArray(values)) return values.slice();
    var result = [];
    var length = Number(values.length || 0);
    for (var index = 0; index < length; index++) result.push(values[index]);
    return result;
}

function isUuidLike(value) {
    var text = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
        || /^[0-9a-f]{32}$/i.test(text)
        || /^0x[0-9a-f]{4,32}$/i.test(text);
}

function isAddressLike(value) {
    return /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(String(value || "").trim());
}

function normalizedAddress(value) {
    return String(value || "").toLowerCase().replace(/[^0-9a-f]/g, "");
}

function deviceRow(device) {
    var battery = Number(device.battery || 0);
    return {
        address: String(device.address || ""),
        label: deviceLabel(device),
        icon: String(device.icon || ""),
        connected: !!device.connected,
        paired: !!(device.paired || device.bonded || device.trusted),
        batteryAvailable: !!device.batteryAvailable,
        batteryPercent: Math.round(battery > 1 ? battery : battery * 100),
    };
}

function hasSecondaryActions(row) {
    return !!row && (row.connected || row.paired);
}

function deviceGroups(devices) {
    var groups = { connected: [], paired: [], available: [] };
    for (var device of toArray(devices)) {
        var label = deviceLabel(device);
        if (!device || !label || isUuidLike(label) || isAddressLike(label)) continue;
        var row = deviceRow(device);
        if (row.connected) groups.connected.push(row);
        else if (row.paired) groups.paired.push(row);
        else groups.available.push(row);
    }
    for (var key in groups)
        groups[key].sort(function(left, right) { return left.label.localeCompare(right.label); });
    return groups;
}

function withActionState(values, address, patch) {
    var next = {};
    for (var key in values || {}) next[key] = values[key];
    if (!address) return next;
    if (!patch) {
        delete next[address];
        return next;
    }
    var current = next[address] || { pending: "", failed: "", error: "", deadline: 0 };
    next[address] = {
        pending: patch.pending !== undefined ? patch.pending : current.pending,
        failed: patch.failed !== undefined ? patch.failed : current.failed,
        error: patch.error !== undefined ? patch.error : current.error,
        deadline: patch.deadline !== undefined ? patch.deadline : current.deadline,
    };
    return next;
}

function hasPendingActions(values) {
    for (var address in values || {})
        if (values[address].pending) return true;
    return false;
}

function expirePendingActions(values, now) {
    var next = values;
    for (var address in values || {}) {
        var state = values[address];
        if (!state.pending || state.deadline > now) continue;
        next = withActionState(next, address, {
            pending: "",
            failed: state.pending,
            error: "Bluetooth did not confirm the requested change.",
            deadline: 0,
        });
    }
    return next;
}

function nodeText(node) {
    var properties = node && node.ready && node.properties ? node.properties : {};
    return [
        node ? node.name : "",
        node ? node.description : "",
        node ? node.nickname : "",
        properties["node.name"],
        properties["node.description"],
        properties["device.name"],
        properties["device.description"],
        properties["device.product.name"],
        properties["device.alias"],
        properties["api.bluez5.address"],
        properties["bluez5.address"],
    ].join(" ").toLowerCase();
}

function usableSink(node) {
    return node && node.isSink && !node.isStream;
}

function bluetoothSinkForDevice(nodes, device) {
    var sinks = toArray(nodes).filter(usableSink);
    var address = normalizedAddress(device && device.address);
    if (address) {
        var addressMatch = sinks.find(function(node) {
            return normalizedAddress(nodeText(node)).indexOf(address) !== -1;
        });
        if (addressMatch) return addressMatch;
    }
    var label = deviceLabel(device).toLowerCase();
    if (!label) return null;
    return sinks.find(function(node) { return nodeText(node).indexOf(label) !== -1; }) || null;
}

if (typeof module !== "undefined") {
    module.exports = {
        deviceLabel,
        isUuidLike,
        isAddressLike,
        normalizedAddress,
        deviceRow,
        hasSecondaryActions,
        deviceGroups,
        withActionState,
        hasPendingActions,
        expirePendingActions,
        bluetoothSinkForDevice,
    };
}
