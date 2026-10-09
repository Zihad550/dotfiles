function activeProvider(context) {
    if (!context.visible || !Array.isArray(context.activePool) || context.activePool.length !== 1)
        return null;

    var provider = context.activePool[0];
    return context.affectedProviders.indexOf(provider) >= 0 ? provider : null;
}

function transition(previous, context) {
    var provider = activeProvider(context);
    return {
        provider: provider,
        access: provider !== null && provider !== previous
    };
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        activeProvider: activeProvider,
        transition: transition
    };
}
