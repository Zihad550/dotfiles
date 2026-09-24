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

Space indices follow `herdr workspace list` order. Grouped or collapsed worktrees can make that differ from the visible row position. Agent indices follow `herdr agent list` order, which matches the default `spaces` panel sort; Herdr 0.8.2 does not expose the rendered Agent panel order to plugins, so `ui.agent_panel_sort = "priority"` can make the labels differ from the shortcuts. Positions after 9 are left unnumbered.
