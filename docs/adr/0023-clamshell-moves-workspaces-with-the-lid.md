# Clamshell Mode follows Hyprland output evacuation

When the lid closes while an external display is active, the Hyprland switch
handler enters Clamshell Mode: it disables the internal output through a
temporary monitor rule and keeps the session awake. Hyprland evacuates the
internal output's workspaces to the surviving external output. Opening the lid
removes the temporary rule and restores the saved monitor layout. A lid close
without an external display remains the normal lock-before-suspend path.

The compositor owns workspace placement during output removal, so the helper
does not guess workspace IDs or maintain a second placement state machine. A
monitor-event watcher retries the same reconciliation after hotplug, reload,
and resume races. This is a deliberate follow-up to the Session Lock's
inhibitor work, not part of the lock's Secure-state contract.
