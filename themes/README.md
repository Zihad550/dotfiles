# Dotfiles Theme System

This directory contains the theme definitions and templates for the dotfiles.

## Structure

```
themes/
├── templates/              # Template files for theme configs
│   ├── alacritty.toml.tpl
│   ├── btop.theme.tpl
│   ├── eza.yml.tpl
│   ├── ghostty.conf.tpl
│   ├── hyprland.conf.tpl
│   ├── hyprlock.conf.tpl
│   ├── kitty.conf.tpl
│   ├── mako.ini.tpl
│   ├── obsidian.css.tpl
│   ├── swayosd.css.tpl
│   ├── walker.css.tpl
│   └── waybar.css.tpl
├── .config/themes/         # Theme directories with colors.toml
│   ├── rose-pine/
│   │   ├── colors.toml    # Source of truth for theme colors
│   │   └── backgrounds/
│   └── ...
└── bin/
    ├── theme              # Theme switching script
    └── theme-generate     # Theme generation script
```

## Theme Definition

Each theme has a `colors.toml` file that defines the color palette:

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

## Usage

### List available themes
```bash
./bin/theme
```

### Switch to a theme
```bash
./bin/theme <theme-name>
# Example:
./bin/theme rose-pine
```

### Generate a theme manually
```bash
./bin/theme-generate <theme-name>
```

## Adding a New Theme

1. Create a new directory in `themes/.config/themes/<theme-name>/`
2. Create a `colors.toml` file with the theme colors
3. Optionally add `light.mode`, etc.
4. Run `./bin/theme-generate <theme-name>` to generate the configs

## Templates

Templates use the `{{ variable }}` syntax. Available variables:
- `accent` - Primary accent color
- `background` - Main background color
- `foreground` - Main text color
- `cursor` - Cursor color
- `selection_foreground` / `selection_background` - Selection colors
- `color0` through `color15` - Terminal color palette
- Derived: `background_rgb`, `foreground_rgb`, `accent_rgb`, `accent_strip`
