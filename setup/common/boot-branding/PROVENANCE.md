# Pinned Omarchy Plymouth provenance

The vendored Plymouth theme is copied from Omarchy `4.0.0.alpha` at commit
`83881e979b35468c3e7d60b171e319ede61a88fd`.

## Upstream source paths

- `default/plymouth/{bullet,entry,lock,logo,preview-unlock,progress_bar,progress_box}.png`
- `default/plymouth/logos/oma.png`
- `default/plymouth/omarchy.plymouth`
- `default/plymouth/omarchy.script`
- `etc/plymouth/plymouthd.conf`

The theme is copied here so setup and recovery do not depend on the ignored
`resources/omarchy` checkout. The files remain byte-for-byte pinned assets.

## Local adaptations

- The theme is installed for GRUB and the repository's existing `mkinitcpio`
  hook chain; Omarchy's Limine integration is not imported.
- `plymouth` is selected through the package's `plymouth-set-default-theme`
  command, then `mkinitcpio -P` and `grub-mkconfig` rebuild the current boot
  artifacts.
- Hook and kernel-argument changes are staged before installation and backed up
  under `/var/lib/dotfiles/greeter-backups/` before a rebuild.
- `df-boot-branding-set` owns the validated recoloring and SDDM synchronization;
  `df-boot-branding-reset` restores these pinned files.
