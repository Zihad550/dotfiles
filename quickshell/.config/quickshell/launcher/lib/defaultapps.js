// The pure half of the Default Apps Provider: the JSON emitted by
// df-default-app, the two catalog levels, and the setter argv.

var ROLE_LABEL = "default apps";

function parseListing(text) {
    if (typeof text !== "string" || text.trim() === "")
        return { roles: [] };

    try {
        var listing = JSON.parse(text);
        return listing && Array.isArray(listing.roles) ? listing : { roles: [] };
    } catch (error) {
        return { roles: [] };
    }
}

function roleFor(listing, key) {
    var roles = listing && Array.isArray(listing.roles) ? listing.roles : [];
    for (var i = 0; i < roles.length; i++) {
        if (roles[i] && roles[i].key === key)
            return roles[i];
    }
    return null;
}

function roleSubtext(role) {
    if (role.stale)
        return "Stale selection: " + role.selection;
    if (role.candidate && role.candidate.name)
        return "Current: " + role.candidate.name;
    return role.description || "No installed candidate";
}

function roleEntry(role, provider) {
    return {
        name: role.name,
        subtext: roleSubtext(role),
        icon: "preferences-system",
        key: "default-app-role:" + role.key,
        provider: provider,
        target: { role: role.key }
    };
}

function candidateEntry(role, candidate, provider) {
    return {
        name: candidate.name,
        subtext: candidate.key === role.resolved ? "Current" : "",
        icon: candidate.icon || "application-x-executable",
        key: "default-app:" + role.key + ":" + candidate.key,
        provider: provider,
        target: { role: role.key, candidate: candidate.key }
    };
}

function rolesFor(listing, provider) {
    var roles = listing && Array.isArray(listing.roles) ? listing.roles : [];
    return roles.map(function (role) { return roleEntry(role, provider); });
}

function candidatesFor(role, provider) {
    if (!role || !Array.isArray(role.candidates))
        return [];
    return role.candidates.map(function (candidate) {
        return candidateEntry(role, candidate, provider);
    });
}

function actionArgv(home, role, candidate) {
    return [home + "/dotfiles/bin/df-default-app", "set", role, candidate];
}

function listArgv(home) {
    return [home + "/dotfiles/bin/df-default-app", "list"];
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ROLE_LABEL: ROLE_LABEL,
        parseListing: parseListing,
        roleFor: roleFor,
        roleSubtext: roleSubtext,
        roleEntry: roleEntry,
        candidateEntry: candidateEntry,
        rolesFor: rolesFor,
        candidatesFor: candidatesFor,
        actionArgv: actionArgv,
        listArgv: listArgv
    };
}
