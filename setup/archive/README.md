# Archive

Setup scripts retired from every box's `init` but kept as a working
reference instead of deleted — an **Archived Script**, see `CONTEXT.md` and
`docs/adr/0011-archived-setup-scripts-kept-not-deleted.md` for why. Nothing
here is sourced or `run_step`'d by any init; each script is kept in step with
the conventions of the live script it was extracted from, not frozen as it
was when retired.

## Inventory

| Component | Retired from | Reason |
| --- | --- | --- |
| [`setup-docker`](setup-docker) | `setup/common/` | Rootful Docker installer, superseded everywhere by `setup-rootless-docker` once arch-hyprland went rootless too (#95). |
| [`setup-ufw`](setup-ufw) | `arch-hyprland/setup-packages/` | The `ufw-docker`/`docker0`-DNS rules a rootful box needed; dropped along with rootful Docker (#95). |
