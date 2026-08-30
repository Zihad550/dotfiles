# Clamshell Mode moves workspaces with the internal display

When the lid closes while an external display is active, the Hyprland switch
handler enters Clamshell Mode: it moves normal workspaces from the internal
output, disables that output, and keeps the session awake. Opening the lid
restores the saved monitor layout and only the workspaces moved by the close
transition. A lid close without an external display remains the normal
lock-before-suspend path.

The workspace move happens before the output is disabled because the monitor
teardown is the irreversible part of the transition. The moved workspace IDs
are kept in a small state file so the open path can restore the user's exact
pre-clamshell placement rather than assuming that every workspace belongs on a
particular output. This is a deliberate follow-up to the Session Lock's
inhibitor work, not part of the lock's Secure-state contract.
