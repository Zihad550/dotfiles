# One-off fixes

Opt-in workarounds for a specific machine or piece of hardware. No box's
`init` runs them; each folder holds its own installer and README.

| Fix | Purpose |
| --- | --- |
| [`intel-full-rgb`](intel-full-rgb/README.md) | Forces Full RGB on Intel DP-1 at boot to fix washed-out colors. |
| [`input-no-suspend`](input-no-suspend/README.md) | Keeps chosen microphones awake so recordings skip the power-up spike. |
