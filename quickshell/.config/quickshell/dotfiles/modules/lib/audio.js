function hasAvailablePort(sink) {
    const ports = Array.isArray(sink?.ports) ? sink.ports : [];
    return ports.length === 0 || ports.some(port => port?.availability !== "not available");
}

function availableSinkNames(sinks) {
    if (!Array.isArray(sinks))
        return [];

    return sinks
        .filter(sink => sink && typeof sink.name === "string" && sink.name !== "" && hasAvailablePort(sink))
        .map(sink => sink.name);
}

function enabledChannelVolume(volumes, channels, savedVolumes) {
    const enabled = Array.from(volumes).filter((volume, index) => savedVolumes[channels[index]] === undefined);
    return enabled.length ? enabled.reduce((sum, volume) => sum + volume, 0) / enabled.length : 0;
}

function setEnabledChannelVolume(volumes, channels, savedVolumes, volume) {
    const current = enabledChannelVolume(volumes, channels, savedVolumes);
    return Array.from(volumes, (value, index) => {
        if (savedVolumes[channels[index]] !== undefined)
            return 0;
        return current > 0 ? Math.min(1, value * volume / current) : volume;
    });
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = { hasAvailablePort, availableSinkNames, enabledChannelVolume, setEnabledChannelVolume };
}
