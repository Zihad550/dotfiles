# Tailscale changes try unprivileged first, elevate through pkexec only on denial

Enabling Tailscale, listing Profiles, switching Profiles, and connecting the
selected Profile all run through `bin/df-tailscale` as the logged-in user
first. Only a recognized permission-denied result retries the identical
operation, verbatim, under `pkexec`, so hyprpolkitagent draws the prompt --
the same reasoning `scripts/tailscale-toggle.sh` already established for the
Quick Settings toggle (its permission-detection wording is reused verbatim in
`bin/df-tailscale`'s `is_permission_denied`). This is the Tailscale
counterpart to [ADR 0028](0028-network-changes-use-networkmanager-polkit.md):
no passwordless sudo rule, no relaxed polkit policy, and `tailscale set
--operator` is never run, so root access stays a per-operation, per-prompt
grant rather than a standing one.

## Why not `tailscale set --operator`

Setting an operator removes the permission boundary entirely for the
configured user, which is a broader and more permanent grant than a Page
whose failures should stay recoverable by canceling a prompt. It also isn't
this repository's call to make on a shared or managed machine.

## Elevation invokes the operation directly, never re-execs this script

`bin/df-tailscale`'s elevated retry is `pkexec tailscale <same argv>` --
never `pkexec df-tailscale ...` and never a wrapper shell script. Only the
one requested Tailscale operation ever runs as root; the classification,
timeout, and locking logic around it all runs unprivileged, before and after
the elevated call.

## Serialization is a cross-process file lock, not a QML guard

Quick Settings instantiates the Tailscale Page once per monitor, and each
holds its own guards against overlapping requests, but those guards live in
one QML singleton per Quickshell process while `df-tailscale` runs as a
separate OS process per invocation. Two elevated retries launched close
together would otherwise raise two overlapping pkexec prompts. The elevated
attempt takes a blocking `flock` on
`${XDG_RUNTIME_DIR:-/tmp}/df-tailscale-pkexec.lock` before calling `pkexec`,
so a second retry queues behind the first rather than prompting twice. Only
the elevated retry is serialized -- the initial unprivileged attempt never
waits on this lock.

## Exit codes 4 and 5 are boundary-verified, not text-guessed

`pkexec` itself reports whether its prompt was dismissed (126) or denied
(127), which is a more reliable signal than pattern-matching stderr, so
`bin/df-tailscale` maps both to exit 4. `timeout` wraps every `tailscale`
invocation, direct or elevated, bounded by `DF_TAILSCALE_TIMEOUT` (default
20s), and maps its own exit 124 to exit 5. `quickshell/.../lib/tailscale.js`
reads these two codes (`classifyExit`) the same way it already reads exit 3
for an unsupported Tailscale version, rather than parsing raw text -- keeping
the cleaned, fixed messages shown to the user decoupled from tailscale's own
wording, which can change and, for a real permission or advice-carrying
failure, includes `Use 'sudo ...'` / `--operator` lines
(`stripPrivilegeAdvice`) never worth showing verbatim.

## Browser authentication is detected, never opened

A Profile that still needs interactive login makes `tailscale up` print a
login URL and then block; `timeout` eventually kills that wait, indistinguishable
from a plain timeout by exit code alone, so `bin/df-tailscale` forwards the
killed call's own output alongside its timeout message rather than discarding
it. `classifyExit` recognizes tailscale's
own "To authenticate, visit" wording ahead of the exit code and classifies it
as `authentication-required`, shown as exactly "This Profile needs
authentication" on that Profile's own Row while every other Row stays usable.
The Page never opens the URL or a browser itself -- authenticating that
Profile happens outside Quick Settings, and the Retry Row re-runs the same
operation once it has been.

## Inline while visible, one notification once not

TailscaleService counts how many Tailscale Page instances currently show
(`visiblePageCount`, incremented and decremented by each Page's own
`active` transitions) rather than trusting a single shared flag, since a
two-monitor session can have one Page open while another just closed. A
failure notifies through `notify-send` only when that count is zero;
otherwise it renders inline and waits for the Retry Row, matching how
`tailscale-toggle.sh` already notifies for the plain on/off toggle.
