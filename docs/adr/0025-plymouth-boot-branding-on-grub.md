# Boot Branding uses pinned Plymouth with GRUB

The Arch targets install Omarchy's pinned Plymouth theme as the static boot
presentation and keep it synchronized with the pinned SDDM Greeter. This is
Boot Branding: it is system-owned and independent of the logged-in Desktop
Theme and Session Lock.

The repository adapts the theme to the existing GRUB and `mkinitcpio` setup.
It inserts `plymouth` after `udev`, or after `systemd` for a systemd hook
chain, and adds one `splash` argument while preserving every other kernel
argument. On systems that build a UKI, it also updates `/etc/kernel/cmdline`,
which is the command-line source used by `mkinitcpio`, and adds
`initramfs_async=0`. Omarchy uses that setting because asynchronous UKI
unpacking can race Plymouth during the early unlock prompt. Unsupported hook
layouts and missing GRUB configuration stop before live files change. The
original boot files are retained in timestamped directories under
`/var/lib/dotfiles/greeter-backups/`.

Boot rebuilds complete before custom SDDM activation. A failed rebuild restores
the backed-up boot files and reports any rollback failure. The setup never
reboots the machine. `df-boot-branding-set` validates and stages custom colors
and a logo, while `df-boot-branding-reset` restores the pinned Plymouth and
Greeter defaults.

The vendored inputs and the deliberate GRUB adaptations are recorded beside
the theme in `setup/common/boot-branding/PROVENANCE.md`.
