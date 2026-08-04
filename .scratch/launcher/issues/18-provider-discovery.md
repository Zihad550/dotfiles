# 18 — Provider discovery

**What to build:** A way to see what the Launcher can actually do. Replaces the old hidden-menu list, which had a different job — here nothing is unreachable, so this is for remembering capabilities rather than reaching them.

**Blocked by:** 11 — Prefix routing.

**Status:** done

- [x] A prefix lists every available Provider with its own prefix and a short description
- [x] Selecting a Provider switches the Query to it
- [x] Providers appear here automatically, without being registered in a second place
- [x] A Provider can mark itself as not worth listing, without becoming unreachable

## Notes

Implemented as `lib/providerlist.js` + `modules/ProviderList.qml`, behind `?` --
walker's own character for this (`walker/.config/walker/config.toml:51-53`), kept
rather than chosen, per spec story 44.

Checkbox 2 has two shapes, because "switch the Query to it" is not one move:

- a Provider with a `prefix` gets the Query set to that prefix;
- a Provider without one gets `enter()`d, which sets `nested` and hands it the
  whole `activePool` -- the mechanism ticket 12 built for the directories
  chooser, reused unchanged.

The list is every Provider in `routable`, which is 20; `listable: false` on the
list itself takes it to 19 Entries. Thirteen of those have no prefix --
applications, windows, workspaces, processes, systemd, dev servers, zellij, the
four menus, themes and backgrounds -- so all thirteen are reached by entering.
For the ones already in the default pool the list originally cleared the Query
instead (an empty Query *is* the default pool), but that showed the whole pool
again, which made their Entry pointless. Selecting one now isolates it: only
its own Entries, back returns to "?". `reachOf` therefore has no third shape: a
listable Provider with neither a prefix nor an enter() is a programming error,
never a silent return to the default pool.

That error is caught at load, by `providerlist.js`'s `problems()` next to
`Routing.problems()` in Launcher.qml's `Component.onCompleted`. It has to be:
`reachOf` hands such a Provider to `enter()`, which throws out of `reach()` --
and with `after: "stay"` and no try around `action.invoke`, that is an Entry
which silently does nothing and skips its own `Frecency.record`, so it never
learns to rank better either. The first pass gave the shim to only six of the
thirteen, and the five that were left (workspaces, processes, systemd, dev
servers, zellij) were dead Entries until the check named them.

Once nine Providers held that shim byte for byte, it became
`modules/NestableProvider.qml` -- `active`, `entered`, `nested`, enter() and
leave(), inherited rather than copied, so changing what "entered" means is one
edit. Workspaces overrides `onActiveChanged` because it has its own dismiss
work (cancel the rename prompt), and so repeats the `leave()`.

The same review round moved the `entries`/`texts`/`keys`/`owners` loop that
themes, backgrounds, directories and this list all held identically into
`lib/catalog.js`'s `ownedCatalog`, beside the `keyedCatalog` ticket 16 put
there. A lib module cannot import another, so each Provider's QML wires it to
its own `entryFor`/`textsFor` -- which is also how the tests call it.

This ticket also moved themes and backgrounds (ticket 15) out of `pool`. They
have no prefix, so entering is the only way to reach them -- and being alone in
`activePool` is what makes `layout: "preview"` legal for them, which restores the
thumbnails the walker menus already had (`dotfiles_themes.lua`'s `FindPreview`)
and ticket 15's port had dropped.

Consequence, deliberate: typing a theme or background name into the unrouted
Launcher no longer finds it. This matches walker, which excludes both menus from
`providers.default` entirely.
