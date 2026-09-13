# Bluetooth Page keeps scoped system integrations

The Bluetooth Page ports Omarchy's discovery and device-management experience
without importing its system-wide Bluetooth policy. Adapter power remains owned
by Quickshell because this setup masks `systemd-rfkill` for TLP. New-device
pairing registers a `bluetoothctl` agent only for the active attempt, while
`bluetui` remains available for PIN and confirmation workflows. This avoids an
always-running auto-accept agent and a second owner for persisted radio state.
