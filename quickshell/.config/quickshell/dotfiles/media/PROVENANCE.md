# Omarchy media port

Source: Omarchy commit `9c5482c58dbe4974de337450754885083c91eada`.
The MIT license is included in LICENSE.

The service, model, and widget come from `shell/plugins/services/media/`.
Service.qml and MediaModel.js are unchanged. BarWidget.qml changes only its
imports. Ui contains the upstream BarWidget, PopupCard, Button, BorderSurface,
BorderOverlay, and PanelSeparator components. Commons contains their upstream
Style, Color, Border, BorderGeometry, and Util dependencies.

The user chose to preserve Omarchy's appearance and behavior, including its
different targeting for global play/pause and explicitly targeted popup
buttons. These components are vendored so installation does not depend on
the ignored resources checkout. Keep upstream logic intact when updating.

## Local integration

- Imports point to qs.media.Ui and qs.media.Commons.
- Color reads the existing dotfiles Theme palette instead of Omarchy's theme
  files. Omarchy's style defaults, typography, spacing, controls, and border
  rendering are retained.
- Style omits the watcher for Omarchy's window-gap toggle file. Initial
  compositor geometry and fontconfig discovery remain upstream behavior.
- modules/Media.qml places the artwork, transport controls, and player list
  beside the calendar in the Calendar Panel. The panel owns focus and outside
  click dismissal. shell.qml owns one service across monitors and translates
  its OSD messages into the existing dotfiles OSD.
- The service is gated on the arch-workstation profile. The Calendar Panel
  shows its controls whenever that service is available.
- Existing media keys route through the service on the workstation. Other
  profiles retain their playerctl behavior.
- setup-media applies the upstream video MIME associations without replacing
  unrelated application defaults.

Browser downloads, screen-recording integration, Omarchy's plugin registry,
and its theme-management machinery are excluded. No ADR is needed for this
reversible port; this document records its scope and adaptation boundary.

## Verification

Run `node --test tests/dotfiles/media.test.js` for player selection and action
targeting scenarios using the actual service functions. The isolated
`media-probe.qml` beside shell.qml renders mock track data, transport controls,
and player selection, then exits after six seconds. Run it with its own D-Bus
session to avoid discovering live players:

```sh
QT_QPA_PLATFORM=wayland dbus-run-session -- quickshell -p quickshell/.config/quickshell/dotfiles/media-probe.qml
```
