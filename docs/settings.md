# Desktop Settings

Run `df-settings`, choose **Settings** in the application launcher, click the Settings header action in Quick Settings, or press **Super + Alt + I**. The app runs inside the Shared Shell and creates its window only while open. Its colors follow the active dotfiles theme.

The sidebar groups seven pages into Style, Setup, and Panels:

| Page | Controls |
| --- | --- |
| Appearance | Desktop theme, image picker for wallpaper |
| Windows | Inner and outer gaps, borders, corner radius, animations, dimming, blur, shadows |
| Keyboard & Mouse | XKB keyboard layouts, pointer sensitivity, pointer focus, natural touchpad scrolling |
| Displays | Existing display arrangement and output panels, Quick Settings brightness |
| Default Apps | Installed candidates from the desktop role registry |
| Tailscale DNS | Domains answered by Tailscale DNS; add or remove one (asks for your password through polkit) |
| Bar & Panels | Bar height, workspace/clock/keyboard-layer/voice indicators, 24-hour time; links to sound, Wi-Fi, Bluetooth, and power panels |

Settings save as you change them; the pointer speed slider saves when you release it, and the keyboard layout when you press Enter or leave the field. **Ctrl+K** or **Ctrl+F** focuses the sidebar search; **Ctrl+W**, **Escape**, and the close button close the app. The refresh button reads the current desktop state again. The status line reports failures; controls, including closing the app, are disabled while a change is running. If the window is closed some other way mid-change, a failure arrives as a notification. A theme marked “download” uses the existing theme installer and needs network access.

You can open a page directly with `df-settings appearance`, `windows`, `input`, `displays`, `defaults`, `tailscale`, or `panels`.

## Persistence

`df-settings-control` validates a fixed set of preferences and writes `$XDG_STATE_HOME/dotfiles/settings.json` (default `~/.local/state/dotfiles/settings.json`). It is machine-local state, kept out of the stowed `~/.config` so it never lands in the repo. It generates `hypr-settings.lua` beside it. Hyprland loads that override after the hand-maintained configuration; only preferences changed in the app become overrides. A **Reset** button appears beside each overridden preference; it removes the override, and for compositor preferences runs `hyprctl reload` to restore the hand-maintained value. Changes use `hyprctl eval` because this repo uses Hyprland's Lua configuration API. Failed compositor changes restore the previous generated override (or remove it if none existed) and leave the JSON unchanged; if Hyprland accepted the change but saving failed, the app reloads Hyprland to undo it. The app reads live options when opened; a gap value represents the top edge, and changing it sets all four edges equally. Invalid entries in a hand-edited `settings.json` are ignored, both by the app and by Quickshell, and named on the status line; the app refuses to save until they are fixed or removed.

Quickshell watches the JSON for bar changes, so toggling bar modules and changing its height or clock format needs no restart. The status cluster stays accessible so Quick Settings can always be reopened. Themes, wallpaper, and application roles use their existing `df-*` commands and existing persistence. Tailscale DNS lists `/etc/dotfiles/tailscale-dns-domains` and adds a domain through `setup/common/add-tailscale-dns-domain`, the same installer `df-tailscale-dns` uses: the domain is validated unprivileged first, then the installer runs under `pkexec`. **Remove** runs `setup/common/remove-tailscale-dns-domain` under `pkexec` for a domain already in the list; see [Local DNS policy](dns.md#remove-domains-or-undo).

To return all preferences to the hand-maintained settings at once, close the app, remove `settings.json` and `hypr-settings.lua` from the directory above, and run `hyprctl reload`. Quickshell falls back to its original bar defaults when the JSON disappears.

## Installation and verification

The files belong to the existing `quickshell` and `hypr` stow packages. After installing the changes with the repo's normal stow workflow, run `df-qs-restart` and `hyprctl reload` once to register the window, gear action, and shortcut. No additional daemon or Omarchy installation is required.

Backend checks: `python3 -m unittest discover -s tests/dotfiles -p test_settings.py`. These validate persistence, rejected values, compositor failures, live option parsing, and generated Lua without changing the running desktop.

Runtime check: `python3 -m unittest discover -s tests/quickshell -p test_settings_runtime.py`. This opens the app with Qt's offscreen renderer, visits every page, and verifies the first save updates both disk and the live preferences singleton. It uses a temporary home, configuration and state directory and cannot change the running desktop.
