# Calendar Panel provenance

The calendar arithmetic and panel behavior are adapted from Omarchy
`4.0.0.alpha` at commit
`83881e979b35468c3e7d60b171e319ede61a88fd`.

## Upstream source boundary

- `shell/plugins/panels/clock/Model.js` →
  `quickshell/.config/quickshell/dotfiles/modules/lib/calendar.js` for date
  keys, leap dates, locale week ordering, and month grids.
- `shell/plugins/panels/clock/BarWidget.qml` →
  `quickshell/.config/quickshell/dotfiles/modules/Clock.qml` for the clock
  entry point and popup handoff.
- `shell/plugins/panels/clock/Panel.qml` →
  `quickshell/.config/quickshell/dotfiles/modules/CalendarPanel.qml` for the
  read-only six-week view.

The adapted source is distributed under the MIT license:

Copyright (c) David Heinemeier Hansson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Local adaptations

- The model is a standalone JavaScript module loaded by this repository's
  QML and tested under Node. It does not import Qt or read the source checkout.
- `Clock.qml` keeps the existing `ddd, dd. MMM hh:mm AP` label, 8.75 pixel
  center offset, and minute-precision `SystemClock`.
- `CalendarPanel.qml` uses this shell's `PopupWindow`, `HyprlandFocusGrab`,
  `Theme`, and locale APIs instead of Omarchy's panel, popout, settings, and
  widget frameworks.
- The panel opens at the current month, uses six fixed rows, marks today, and
  leaves day cells display-only. It refreshes the current month whenever it
  opens.

## Omitted upstream behavior

This port does not include clock-format cycling, the timezone selector,
Omarchy IPC and plugin registration, persisted panel settings, or the
Memento Mori life-progress feature. No installed runtime path depends on the
ignored `resources/omarchy` checkout.
