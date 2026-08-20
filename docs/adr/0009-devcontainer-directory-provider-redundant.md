# A devcontainer directory-listing Provider is redundant with the local Directory Index

Issue #88 asked whether a Launcher Provider could list directories from the
devcontainer host over SSH, the way the Directories Provider lists the local
filesystem. Mechanically it's straightforward — a `Process` running
`ssh <host> find ...` with a `StdioCollector`, the same shape as
`DirectoryIndex.qml`'s local scanner, reusing `DevcontainerRoutingState`'s
host resolution. It isn't being built.

## Why

**The three trees a remote listing would cover are bind mounts, not copies.**
`setup/devcontainer/.devcontainer/devcontainer.json` mounts
`~/dotfiles`, `~/dev` and `~/.agents` with `type=bind`, at the same absolute
path, under the same `jehad` user — exactly the set `directories.js` calls
`MIRRORED`. A bind mount means the container's view of those directories and
the host's are the same underlying files, not a synced or independently
populated remote copy. `ssh devcontainer.devpod find ~/dev` and `find ~/dev`
run on the host return the same paths, modulo nothing — there's no
container-only directory to discover inside a bind mount by definition. SSH
adds a network round-trip, a dependency on the routing toggle
(`docs/adr/0002-devcontainer-routing-toggle.md` — off means no SSH), and,
first call after enabling the toggle, a devpod container-boot latency, to
learn something a local `find` already knows for free.

**The one real gap is a scoping choice in the local index, not a reachability
problem.** `~/.agents` is in `MIRRORED` but never appears in the local
Directory Index: `directoryindex.js`'s `ROOTS` is `["dotfiles", "dev"]`, and
`inScope()` separately drops any top-level dot-directory before `ROOTS` is
even consulted. That's a local scan exclusion, verified by reading
`~/.agents` from inside the devcontainer itself — it's an ordinary populated
directory (`skills/`, `.skill-lock.json`), not something SSH would reveal and
local listing can't. Widening `ROOTS`/`inScope` closes it directly, with none
of the machinery a remote provider needs.

**Duplicate entries would violate the Entry Key contract.** Had a remote
provider been built anyway, its entries would carry the same absolute path as
`key` that the local Directories Provider already uses for the same
directory (`directories.js`'s `entryFor`) — two Providers' entries sharing one
Frecency bucket and looking identical in the list, which `CONTEXT.md`'s Entry
Key definition doesn't anticipate and nothing downstream is built to merge.

**The only non-redundant case is out of scope for this ticket.** A directory
that exists solely inside the container's own filesystem — outside
`dotfiles`/`dev`/`.agents`, e.g. something cloned to a container-private path
— genuinely isn't visible from the host, and only that case would justify
SSH. Nothing in issue #88 or the current workflow asks for browsing the
container's private filesystem; it's a narrower, different feature and not
scoped here.

## Consequences

- No SSH-backed directory Provider is built. `docs/launcher-spec.md`'s
  Provider list is unchanged.
- If `~/.agents` (or another dot-prefixed root) should be reachable from the
  Directories Provider, that's a small follow-up to `directoryindex.js`'s
  `ROOTS`/`inScope`, filed separately — no ADR needed, it's additive scope,
  not a reversed decision.
- If a real need for browsing the container's private, non-mounted
  filesystem ever shows up, it starts as its own spec — a different feature
  from "mirror the mounted trees" and not a resurrection of this one.
