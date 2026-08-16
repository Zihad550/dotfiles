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

module.exports = { hasAvailablePort, availableSinkNames };
