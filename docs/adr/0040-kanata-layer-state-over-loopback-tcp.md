# Kanata layer state comes from its loopback TCP server

The Bar's Layer Indicator and Layer Guide (issue #155) need the layer Kanata
has actually activated. Decision: the system unit starts Kanata with
`-p 127.0.0.1:5829`, and the Shared Shell reads it through
`bin/df-kanata-layers`, a bash `/dev/tcp` relay run by `KanataService`.

## Why

**Kanata's own state, not inference.** Watching key-downs or polling the
service cannot tell a tap from a hold. Kanata's `LayerChange` events and
`CurrentLayerName` snapshot are the remapper's own answer.

**No `cmd` actions.** Having the keymap run a shell command on layer changes
would need a `cmd`-enabled Kanata running commands as root, just to update a
label.

**A helper process, not a socket type.** Quickshell's `Socket` is a Unix socket
only. The relay keeps the protocol handling in QML, and its exit code (3 when
`kanata.service` is inactive) separates a stopped Kanata from lost state
without touching the Quick Settings refresh path.

**Snapshot first.** A layer is shown only after a `CurrentLayerName` reply on
the current connection, and is dropped as soon as the connection ends, so a
restart, a reload, or a Shared Shell restart never leaves a stale layer on
screen.

## Consequences

Any local process can reach the port. The protocol can change layers, act on
virtual keys, and reload configs, but not run commands. That is acceptable on a
single-user workstation. A failed connection never affects remapping. An
existing install must rerun `setup/common/setup-kanata` to add the port.
