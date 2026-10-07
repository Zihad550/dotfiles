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

function sharedChannelVolume(volumes, channels, savedVolumes) {
    const enabled = Array.from(volumes).filter((volume, index) => savedVolumes[channels[index]] === undefined);
    const levels = enabled.length ? enabled : Array.from(channels, channel => savedVolumes[channel]).filter(volume => volume !== undefined);
    return levels.length ? levels.reduce((sum, volume) => sum + volume, 0) / levels.length : 0;
}

function setEnabledChannelVolume(volumes, channels, savedVolumes, volume) {
    return Array.from(volumes, (value, index) => savedVolumes[channels[index]] === undefined ? volume : 0);
}

function toggleSpeakerChannel(volumes, channels, savedVolumes, channel) {
    const nextSaved = Object.assign({}, savedVolumes);
    if (!Array.from(channels).includes(channel))
        return { volumes: Array.from(volumes), savedVolumes: nextSaved };

    const volume = sharedChannelVolume(volumes, channels, savedVolumes);
    if (nextSaved[channel] === undefined)
        nextSaved[channel] = volume;
    else
        delete nextSaved[channel];
    return { volumes: setEnabledChannelVolume(volumes, channels, nextSaved, volume), savedVolumes: nextSaved };
}

function sinkChannelVolumes(sink) {
    if (typeof sink?.channel_map !== "string" || !sink.volume)
        return null;
    const volumes = sink.channel_map.split(",").map(channel => sink.volume[channel]?.value / 65536);
    return volumes.length && volumes.every(volume => Number.isFinite(volume) && volume >= 0) ? volumes : null;
}

function channelVolumesMatch(actual, requested) {
    return actual?.length === requested.length && requested.every((volume, index) =>
        volume === 0 ? actual[index] === 0 : Math.abs(actual[index] - volume) < 0.02);
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = { hasAvailablePort, availableSinkNames, sharedChannelVolume, setEnabledChannelVolume, toggleSpeakerChannel, sinkChannelVolumes, channelVolumesMatch };
}
