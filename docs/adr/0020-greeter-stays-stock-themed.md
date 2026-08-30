> Status: Superseded by [ADR 0024](0024-pinned-omarchy-greeter.md).

# Superseded: The Greeter stays on its stock theme

The Greeter is SDDM, and it is left exactly as SDDM ships it. It does not
follow the active theme, and nothing in the theme pipeline writes to it.

## Why

**The Greeter cannot read the theme data.** It runs before login, as its own
user, so the per-theme files every other surface reads — `~/.config/theme/` in
the user's home — are not its to read. Making it follow the theme means the
theme switcher acquiring a privileged write into `/usr/share/sddm/themes/`,
executed on every theme change.

**The surface is visible for two seconds.** That privileged write would be
bought for the one screen in the session that nobody looks at, and it would put
a root-owned step into the middle of a switcher that is otherwise entirely
unprivileged.

**A greeter that fails to start is a lockout.** The stock theme is the one
configuration upstream tests. Every deviation from it is carried by this repo
on a daily driver whose alternative to a working Greeter is a rescue disk.

## Consequences

Theme switching is unprivileged, and adding a theme means adding theme data —
the Greeter is not a target and never appears in the template list.

Login looks like stock SDDM rather than like the rest of the desktop. That
inconsistency is the accepted cost, and it is the whole of what this decision
buys back.

Replacing the Greeter with a Quickshell greeter — which would unify it with the
Session Lock under one visual language — is out of scope for the same reason,
recorded in `docs/session-lifecycle-spec.md` § Out of Scope. It is worth
revisiting only against a Session Lock that has already proven itself.
