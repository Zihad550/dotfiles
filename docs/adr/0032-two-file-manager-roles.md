# Two file-manager roles, not one

Making `SUPER+B` and `SUPER+F` follow selectable defaults raised the question of
what "default file manager" means here. It is split into two Default App Roles:
the **System Directory Handler**, the desktop application other applications get
when they ask the system to open a directory, and the **Preferred File Manager**,
the application `SUPER+F` opens for interactive browsing. They are chosen
independently and neither writes the other.

## Why

**A terminal file manager cannot be an XDG handler honestly.** `SUPER+F` launches
Yazi through `bin/df-launch-tui`
(`hypr/.config/hypr/lua/bindings/apps.lua:25`), which is `ghostty -e yazi`. To
make Yazi the `inode/directory` handler we would have to ship a synthetic desktop
entry wrapping it in a terminal — and every application that asks the system to
open a folder would then get a terminal, including ones that pass a file
manager a path expecting a graphical window. One role would force a choice
between breaking `SUPER+F` and breaking folder-opening everywhere else.

**Omarchy does not answer this.** It makes only the browser selectable;
`omarchy-launch-nautilus:5` hardcodes `nautilus --new-window`. "Like Omarchy"
therefore settles the browser and says nothing about what a configurable
file-manager role is, which is why the question needed deciding rather than
copying.

**Independence over convenience.** The considered alternative was one visible
choice that quietly sets both when the selected application can fill both roles.
Rejected: it makes selecting Nautilus for `SUPER+F` silently change how every
other application opens folders, which is exactly the invisible coupling the
split exists to prevent. An explicit "set both" Action stays available as a
later addition, deliberately not built now.

## Consequences

- The picker shows three roles, not two. Selecting a graphical application for
  one file-manager role leaves the other untouched.
- The Preferred File Manager falls back to the System Directory Handler when its
  selection is stale; the System Directory Handler falls back to the live XDG
  `inode/directory` handler.
- Only applications with a desktop entry are offered for the System Directory
  Handler. Yazi is offered for the Preferred File Manager alone.
- `yazi` is installed by `setup/arch-devbox/packages/pacman-apps:30` and by no
  workstation package set, so `SUPER+F` is broken on a fresh workstation today.
  Declaring Yazi as the workstation's Preferred File Manager requires adding the
  package there.
