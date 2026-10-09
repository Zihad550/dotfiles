import QtQuick
import Quickshell
import Quickshell.Io
import "../lib/matching.js" as Matching
import "../lib/defaultapps.js" as DefaultApps

// The Default Apps Provider is a two-level browser. It stays out of the
// default pool and is reached from the "?" Provider list because changing a
// Role Selection is configuration, not a normal Launcher Query.
NestableProvider {
    id: root

    required property bool catalogSelected
    readonly property ProviderRetention retention: ProviderRetention {
        selected: root.catalogSelected
        onRefreshRequested: root.refresh()
    }

    readonly property string label: DefaultApps.ROLE_LABEL
    readonly property string description: "Choose the app for a desktop role"
    readonly property bool ready: true
    readonly property string home: Quickshell.env("HOME")

    required property bool active
    onActiveChanged: {
        if (!root.active) {
            root.selectedRole = "";
            root.listingText = "";
            root.leave();
        }
    }

    property string listingText: ""
    readonly property var listing: DefaultApps.parseListing(root.listingText)
    property string selectedRole: ""
    readonly property var selected: DefaultApps.roleFor(root.listing, root.selectedRole)

    readonly property var catalog: {
        if (!retention.retained)
            return Matching.emptyCatalog();
        if (root.selected !== null) {
            const entries = DefaultApps.candidatesFor(root.selected, root);
            return {
                entries: entries,
                corpus: Matching.prepare(entries.map(entry => entry.name), entries.map(entry => entry.key))
            };
        }

        const entries = DefaultApps.rolesFor(root.listing, root);
        return {
            entries: entries,
            corpus: Matching.prepare(entries.map(entry => entry.name), entries.map(entry => entry.key))
        };
    }

    readonly property var actions: root.selected === null
        ? ({
            primary: {
                label: "choose",
                invoke: entry => root.chooseRole(entry),
                after: "stay"
            },
            back: {
                label: "back",
                invoke: () => root.leave()
            }
        })
        : ({
            primary: {
                label: "set",
                invoke: entry => root.setCandidate(entry)
            },
            back: {
                label: "back",
                invoke: () => root.selectedRole = "",
                after: "stay"
            }
        })

    function chooseRole(entry): void {
        root.selectedRole = entry.target.role;
    }

    function setCandidate(entry): void {
        Quickshell.execDetached(DefaultApps.actionArgv(root.home,
            entry.target.role, entry.target.candidate));
    }

    function refresh(): void {
        finder.request();
    }

    // QtObject has no default property to nest a child into.
    readonly property ListingProcess finder: ListingProcess {
        id: finder
        retained: retention.retained
        command: DefaultApps.listArgv(root.home)

        stderr: StdioCollector {}

        onSettled: output => root.listingText = output
    }
}
