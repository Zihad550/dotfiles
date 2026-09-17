# The Webapps Provider is a management surface, not a second application pool

The Launcher has a `webapps` Provider reached from the `?` provider list. It
installs Webapps and lists installed Webapps for removal; it is deliberately
absent from the default pool and does not launch anything.

## Why

**A Webapp is already an application Entry.** `df-webapp-install` creates a
Desktop Entry, so the Applications Provider remains the one place that
launches it. Adding those same rows to the default pool would make every
Webapp appear twice and would make a destructive Action one ordinary Query
away.

**Management needs a distinct, deliberate surface.** Entering `webapps` from
the `?` list makes the destructive verb and its `remove` footer visible before
Return is pressed. The provider stays open after a successful removal, while
the live Desktop Entries model removes the row when the desktop file goes.

**This is not the redundant directory Provider rejected by ADR 0009.** That
decision rejected a second source for the same directory Entries. The Webapps
Provider has a different purpose and a different catalog: it selects only
Desktop Entries whose command runs a repo webapp launcher, shows the URL, and
offers removal. It does not duplicate the Applications Provider's launch
surface in the default pool.

**The live Desktop Entries model is the source.** Quickshell already watches
the application directories and owns parsing, names, icons, commands, and
IDs. Scanning those directories again would create a second source of truth
and would require separate refresh plumbing.

**Removal delegates to the existing CLI.** The provider runs
`df-webapp-remove <desktop-entry-id> --force`, never `--forget`. The CLI owns
the rules for deleting the desktop file and only the fetched icon, while the
tracked Webapp package manifest remains untouched and reinstalls the Webapp
on the next setup run.

**Installation delegates to the existing CLI.** A permanent first row opens
two prompts in the Launcher's Query field, one for the name and one for the
URL. The provider runs `df-webapp-install <name> <url>` and stays open. The CLI
owns URL normalization, icon discovery, Desktop Entry creation, and recording
the app in the active machine profile's package manifest. The live Desktop
Entries model adds the installed app to the list.

**Entries are keyless.** The Applications Provider's Desktop Entry ID is a
valid launch identity, but using it here would make a removal action teach
Frecency about an application Entry that no longer exists. The management
rows therefore carry no Entry Key.

## Consequences

- `webapps` is routable and listable from `?`, but absent from `pool`.
- The install row remains available when no Webapps are installed.
- Ordinary packaged applications and keybound special Webapps are excluded by
  the launcher-command predicate.
- Success is silent: the disappearing row is the report. A failed CLI process
  produces a critical notification containing its stderr.
- Installing or removing a desktop file outside the Launcher is reflected by
  the same live model without a provider-owned directory scan.
