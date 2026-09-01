# The Network Page is an adaptation of pinned Omarchy sources

The complete Network Page ports Omarchy `4.0.0.alpha` at commit
`83881e979b35468c3e7d60b171e319ede61a88fd`, but adapts its interface to the
repository's Quick Settings components instead of importing Omarchy's plugin
host and UI framework. Unchanged helpers are vendored with provenance and
digest pins, adapted sources are covered by behavioral tests, and neither
runtime nor setup depends on the ignored `resources/omarchy` checkout; upstream
refreshes remain deliberate, manual, and reviewable.

Only the unprivileged status, band, password, QR, and speed-test helpers remain
vendored under repository-owned names. DNS is intentionally reimplemented
through NetworkManager and its existing polkit policy, so the port adds no
Omarchy-named system files or feature-specific refresh/reset commands.
