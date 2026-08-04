// The web search Provider's pure half: which Queries leave the machine, what
// URL they become, and how they are opened.
//
// Deliberately free of QML types so the same file loads under a plain
// JavaScript runtime, which is where its tests run
// (tests/launcher/websearch.test.js) -- the same arrangement as matching.js,
// and for the same reason.
//
// **This Provider is not ranked, and that is its whole design.** The Launcher's
// scorer cannot express "below everything": a haystack equal to the needle
// carries the largest quality score there is *and* the smallest length penalty,
// so a corpus holding the Query itself would rank first for every Query typed.
// A search row above Firefox for "fir" is precisely the flooding checkbox 5
// forbids. So this Provider produces Entries directly and Launcher.qml appends
// them after the merged pool, which is what elephant's `Score: 1` meant in a
// flat pool (resources/elephant/internal/providers/websearch/setup.go:279 --
// that checkout is deleted with ticket 19).
// Nothing here is scored, so nothing here is comparable to anything else --
// which leaves "one scorer, one scale" intact rather than bending it.
//
// The engine is elephant's default and this machine never overrode it: there
// was no websearch.toml in elephant/.config/elephant/ (deleted with ticket
// 19), so the Go defaults are what has been in use -- Google, `xdg-open`,
// "Search: " as the row's prefix (websearch/setup.go:100-110).

var ICON = "applications-internet";

var ENGINE_NAME = "Google";
var ENGINE_URL = "https://www.google.com/search?q=%TERM%";

// What a Query is called in the row that offers to search for it.
var SEARCH_PREFIX = "Search: ";
var OPEN_PREFIX = "Open: ";

// Whether a host is one worth opening.
//
// Two shapes: a dotted name whose last label is alphabetic, or a dotted-quad
// address. Elephant asks only that the host contain a dot
// (websearch/setup.go:392), which is one character short of enough here --
// "1.5" and "3.14" contain a dot, are things this Launcher's calculator is
// meant to answer, and would otherwise both be offered as websites. That is the
// one place this deviates from the port, and it deviates by being narrower.
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

    // An address: four labels, every one of them a number.
    if (numeric === labels.length)
        return labels.length === 4;

    return /^[a-z]{2,}$/i.test(labels[labels.length - 1]);
}

// Whether a Query is a link rather than something to search for.
//
// Elephant's rule (websearch/setup.go:246-249 -- deleted with ticket 19): no
// whitespace in it, an http or
// https scheme once one is assumed, and a host that looks like a host. A Query
// with a space in it is prose, and prose is what the search row is for.
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

    // The authority is everything before the path, the query or the fragment.
    var authority = rest.split(/[\/?#]/)[0];

    var userinfo = authority.lastIndexOf("@");
    if (userinfo >= 0)
        authority = authority.slice(userinfo + 1);

    var host = authority.replace(/:[0-9]*$/, "");
    if (host === "")
        return false;

    // Named rather than dotted, and the one host that gets to be: the machine
    // this is running on. Elephant carried the same exception.
    if (host.toLowerCase() === "localhost")
        return true;

    return isHost(host);
}

// The URL a link Query opens. https unless it said otherwise -- a Query typed
// as "github.com" means the website, and defaulting to http would hand it a
// redirect at best.
function linkFor(query) {
    var text = query.trim();
    if (text.indexOf("://") >= 0)
        return text;
    return "https://" + text;
}

// The URL a search Query opens.
//
// encodeURIComponent, not concatenation: a Query carrying `&` or `#` would
// otherwise truncate the search at the browser, which reads as the Launcher
// having dropped half of what was typed. Elephant reached the same place with
// url.QueryEscape.
function searchUrlFor(query) {
    return ENGINE_URL.replace("%TERM%", encodeURIComponent(query.trim()));
}

// The Entries for a Query. None or one.
//
// `hasLocalAnswer` is whether anything else in the Launcher answered this
// Query, and it is what makes the search row narrow: this is the Provider of
// last resort, so it produces a row only when nothing else did. That is the
// ticket's own sentence -- "a Query that has no local answer sent out to the
// browser" -- rather than a rule invented here.
//
// A *link* does not wait for that, and the asymmetry is deliberate. Typing a
// URL is unambiguous, and elephant scored it above everything for the same
// reason (websearch/setup.go:257 -- deleted with ticket 19).
//
// **No Entry Key.** A search is never the same search twice -- the Query is
// part of what it is -- so there is nothing for Frecency to accumulate against,
// and fabricating identity would teach the store that searching is what this
// machine does most. Leaving the field off is the whole of opting out; see the
// note in Applications.qml.
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

// The argv that opens a URL, launch prefix included.
//
// One argv element for the URL, so a `&` in it is data rather than shell
// syntax. Elephant had to shell-escape here because it builds a command line
// for `sh -c` (websearch/setup.go:215 -- deleted with ticket 19); nothing does
// that on this path.
//
// [] for no URL, rather than a bare `xdg-open`: xdg-open with no argument is
// not a no-op, it opens a file manager.
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
