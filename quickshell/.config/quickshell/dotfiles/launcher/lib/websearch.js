// The web search Provider's pure half: which Queries leave the machine, what
// URL they become, and how they're opened.
//
// Free of QML types so it loads under a plain JS runtime too (tests/launcher/websearch.test.js).
//
// Not ranked, and that's the whole design: a corpus holding the Query itself
// would score highest for everything typed (a haystack equal to the needle
// gets max quality and min length penalty), so a search row would flood
// above real matches. This Provider produces Entries directly and
// Launcher.qml appends them after the merged pool -- nothing here is scored,
// so nothing here needs to be comparable to anything else.

var ICON = "applications-internet";

var ENGINE_NAME = "Google";
var ENGINE_URL = "https://www.google.com/search?q=%TERM%";

var SEARCH_PREFIX = "Search: ";
var OPEN_PREFIX = "Open: ";

// A dotted name whose last label is alphabetic, or a dotted-quad address.
// Requiring more than "contains a dot": "1.5" and "3.14" contain a dot and
// are things the calculator should answer, not offers to open as websites.
function isHost(host) {
    var labels = host.split(".");
    if (labels.length < 2)
        return false;

    var numeric = 0;
    for (var i = 0; i < labels.length; i++) {
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(labels[i]))
            return false;
        if (/^[0-9]+$/.test(labels[i]))
            numeric++;
    }

    // An address: four labels, every one a number.
    if (numeric === labels.length)
        return labels.length === 4;

    return /^[a-z]{2,}$/i.test(labels[labels.length - 1]);
}

// Whether a Query is a link rather than something to search for: no
// whitespace, an http/https scheme if one is present, and a host that looks
// like a host. A Query with a space in it is prose, which the search row is for.
function looksLikeLink(query) {
    if (typeof query !== "string")
        return false;

    var text = query.trim();
    if (text === "" || /\s/.test(text))
        return false;

    var rest = text;
    var scheme = text.indexOf("://");
    if (scheme >= 0) {
        var named = text.slice(0, scheme).toLowerCase();
        if (named !== "http" && named !== "https")
            return false;
        rest = text.slice(scheme + 3);
    }

    // The authority is everything before the path, query or fragment.
    var authority = rest.split(/[\/?#]/)[0];

    var userinfo = authority.lastIndexOf("@");
    if (userinfo >= 0)
        authority = authority.slice(userinfo + 1);

    var host = authority.replace(/:[0-9]*$/, "");
    if (host === "")
        return false;

    // The one host that gets to be named rather than dotted: this machine.
    if (host.toLowerCase() === "localhost")
        return true;

    return isHost(host);
}

// https unless the Query said otherwise: "github.com" means the website,
// and defaulting to http would hand it a redirect at best.
function linkFor(query) {
    var text = query.trim();
    if (text.indexOf("://") >= 0)
        return text;
    return "https://" + text;
}

// encodeURIComponent, not concatenation: a Query carrying `&` or `#` would
// otherwise truncate the search at the browser, reading as the Launcher
// having dropped half of what was typed.
function searchUrlFor(query) {
    return ENGINE_URL.replace("%TERM%", encodeURIComponent(query.trim()));
}

// None or one Entry.
//
// `hasLocalAnswer` narrows the search row: this is the Provider of last
// resort, so it produces a row only when nothing else answered. A *link*
// doesn't wait for that -- typing a URL is unambiguous.
//
// No Entry Key: a search is never the same search twice (the Query is part
// of what it is), so there's nothing for Frecency to accumulate against.
function entriesFor(query, hasLocalAnswer, provider) {
    if (typeof query !== "string" || query.trim() === "")
        return [];

    if (looksLikeLink(query)) {
        var link = linkFor(query);
        return [{
            name: OPEN_PREFIX + link,
            subtext: "open in browser",
            icon: ICON,
            provider: provider,
            target: { url: link }
        }];
    }

    if (hasLocalAnswer)
        return [];

    return [{
        name: SEARCH_PREFIX + query.trim(),
        subtext: ENGINE_NAME,
        icon: ICON,
        provider: provider,
        target: { url: searchUrlFor(query) }
    }];
}

// One argv element for the URL, so a `&` in it is data, not shell syntax.
// [] for no URL, not a bare `xdg-open`: xdg-open with no argument opens a
// file manager, not a no-op.
function openArgv(url, prefix) {
    if (typeof url !== "string" || url === "")
        return [];

    var argv = ["xdg-open", url];
    if (!prefix || prefix.length === 0)
        return argv;

    return prefix.concat(argv);
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ICON: ICON,
        ENGINE_NAME: ENGINE_NAME,
        ENGINE_URL: ENGINE_URL,
        isHost: isHost,
        looksLikeLink: looksLikeLink,
        linkFor: linkFor,
        searchUrlFor: searchUrlFor,
        entriesFor: entriesFor,
        openArgv: openArgv
    };
}
