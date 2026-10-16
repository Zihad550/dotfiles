# Dotfiles Theme System

This directory holds the built-in theme and the templates every theme is
rendered through. The other themes live in
[Zihad550/dotfiles-themes](https://github.com/Zihad550/dotfiles-themes) and are
downloaded on demand. See `docs/adr/0039-themes-download-from-a-separate-pack.md`.

## Where themes live

Lookup order; the first root holding `<name>/colors.toml` wins
(`df-theme-dir <name>`):

| Root | Contents |
|---|---|
| `~/.local/share/dotfiles/themes/` | third-party themes from `df-theme-install` (one git clone each) |
| `~/dotfiles-themes/` | partial, sparse clone of `dotfiles-themes`; only picked themes are checked out |
| `themes/builtin/` (this repo) | `kanagawa`, the default; works offline |

`~/.config/theme` symlinks to the active theme's directory. Generated files are
written next to that theme's `colors.toml`; the pack repo ignores them.

## Commands

```bash
df-theme-set                 # current theme + installed and downloadable themes
df-theme-set <name>          # apply; downloads it from the pack if needed
df-theme-set default         # kanagawa
df-theme-list                # installed<TAB>name<TAB>dir<TAB>root / available<TAB>name
df-theme-fetch --sync        # clone the pack index, or fetch it and fast-forward
df-theme-fetch <name>        # check out one pack theme without applying it
df-theme-install <git-url>   # add a third-party (e.g. Omarchy) theme
df-theme-remove <name>       # drop a pack or third-party theme
df-theme-refresh [--apply]   # regenerate every installed theme
```

The Launcher's Themes picker shows installed themes first, then the pack's
others as "Not installed". Picking one runs `df-theme-set`, which downloads it.
Opening the picker also syncs the pack in the background, which is how
installed pack themes pick up upstream fixes (reapply to see them).

Machines set up before the pack: `df-theme-set` runs `df-theme-migrate` first.
It drops the old `~/.config/themes`, moves third-party themes to the user
root, and relinks `~/.config/theme` to the same theme (downloading it if it
moved to the pack). After pulling, run `df-theme-set` once.

## Theme Definition

`colors.toml` uses either the ANSI names:

```toml
accent = "#56949f"
cursor = "#cecacd"
foreground = "#575279"
background = "#faf4ed"
selection_foreground = "#575279"
selection_background = "#dfdad9"

color0 = "#f2e9e1"
color1 = "#b4637a"
# ... color2 through color15
```

or Omarchy's semantic names (`red`, `bright_blue`, `muted`, `selection`,
`mode = "light"`, ...). `df-theme-generate` maps the semantic names onto the
ANSI ones the same way Omarchy's `omarchy-theme-color` does.

## Omarchy themes

`df-theme-install https://github.com/<owner>/omarchy-<name>-theme` strips the
`omarchy-`/`-theme` affixes, copies `preview.png` and `backgrounds/`, and
renders the configs from these templates. It drops the theme's `*.lua` files,
`vscode.json` and symlinks, since those run code or reach outside the theme.

## Adding a Theme

Add `<name>/colors.toml` to the `dotfiles-themes` repo, plus optional
`light.mode`, `icons.theme`, `neovim.lua`, `vscode.json` and
`obsidian-border-theme.json`. Push it; the picker lists it after its next
index fetch.

## Templates

Templates use the `{{ variable }}` syntax. Available variables:
- `accent` - Primary accent color
- `background` - Main background color
- `foreground` - Main text color
- `cursor` - Cursor color
- `selection_foreground` / `selection_background` - Selection colors
- `color0` through `color15` - Terminal color palette
- Derived: `background_rgb`, `foreground_rgb`, `accent_rgb`, `accent_strip`
