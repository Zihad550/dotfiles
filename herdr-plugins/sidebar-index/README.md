# Sidebar Index

This plugin reports each Space and Agent's one-based position as sidebar metadata. It numbers only positions 1–9, which match Herdr's indexed shortcuts. Add the tokens below to Herdr's expanded sidebar layouts to show them.

```toml
[ui.sidebar.spaces]
rows = [["state_icon", "$space_index", "workspace"], ["branch", "git_status"]]

[ui.sidebar.agents]
rows = [["state_icon", "workspace", "tab"], ["$agent_index", "agent"]]
```

These `rows` replace the layouts for their sections, so the examples retain Herdr's usual state, workspace, tab, branch, and Git status fields.

The plugin refreshes on startup and workspace, tab, and agent lifecycle events. Run `herdr plugin action invoke dotfiles.sidebar-index.refresh` to refresh manually. Run `herdr plugin action invoke dotfiles.sidebar-index.clear` before unlinking it to remove its metadata.

Space indices follow Herdr's expanded worktree grouping: at the group's first occurrence, show its main checkout followed by its linked worktrees. A group requires at least two workspaces sharing a `worktree.repo_key`, including a main checkout. Ungrouped workspaces retain their list order. Herdr's workspace `number` is not the position in this grouped order.

The existing native `switch_workspace = "prefix+shift+1..9"` binding follows this order while groups are expanded. When a group is collapsed, Herdr changes its shortcut targets to match the visible entries. The plugin cannot read the client's group expansion state, so its labels continue to show expanded positions. Keep groups expanded when using the labels as shortcut hints.

Agent indices follow `herdr agent list` order, which matches the default `spaces` panel sort; Herdr 0.8.2 does not expose the rendered Agent panel order to plugins, so `ui.agent_panel_sort = "priority"` can make the labels differ from the shortcuts. Positions after 9 are left unnumbered.
