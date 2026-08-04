# 07 — Join a secured network with a password

**What to build:** Clicking a secured network you have never joined expands that row into a masked field. Typing the password and confirming joins it, and a wrong password is retried where you already are.

**Blocked by:** 02 — the host probe, whose results decide how the field gets
keyboard input. 04 — connecting.

**Status:** ready-for-agent

- [ ] Clicking a secured network you have not saved opens a masked field on its row
- [ ] The typed password is never rendered in clear text
- [ ] Confirming connects using the typed key
- [ ] A wrong password keeps you on the Page, says so, and reopens the field
- [ ] Escape, or clicking another row, abandons the field and clears what was typed
- [ ] Quick Settings does not hold keyboard focus once dismissed

## 02 decides how this is built

Nothing in the bar has ever accepted a keystroke — its window never asks for
keyboard focus, whereas the Launcher asks explicitly because it needs typing.
02 establishes whether the panel's existing focus grab is enough on its own, or
whether the bar's window must request keyboard focus too.

**If it must, request it only while Quick Settings is shown** and give it back
on dismiss. A bar that permanently holds keyboard focus is a bar that can take
keystrokes from whatever you are actually working in — which is why the last
acceptance criterion exists.

## Which networks prompt, and when

Prompt **up front** for a network that is secured, unsaved, and uses a
pre-shared key. All three are known before the click, so attempting a connect
that is certain to fail — and making someone wait for the failure — buys
nothing.

Prompt **again on a secrets failure**, which is the case the first rule cannot
see: a saved network whose stored password is wrong or was never kept. Same
field, opened from 04's failure handler. This is also what makes retrying a
typo free, because you are already standing where the field is.

## The secret

The password is handed to NetworkManager directly rather than through a
command, so it never becomes a process argument — which matters in a repo that
ships a Launcher Provider whose entire job is displaying running command lines.

What is left is this ticket's own hygiene: never log it, and clear it on
confirm, on abandon, and when the Page closes. A password still sitting in
memory on a property after the panel shuts is the only leak this design can
still have, and criterion 5 is what catches it.

## Manual verification

Host-only. Needs a secured network you have **not** saved — a phone hotspot
with a fresh name is the easy way.

```bash
df-qs-restart
```

1. **Open** — click the Wi-Fi Row, then the hotspot's row. A field appears on
   that row.
2. **Masked** — type. Only dots appear, never characters.
3. **Wrong password** — enter a wrong one and confirm. The Page **stays**, the
   row says the password was wrong, and the field is open again ready to retype.
4. **Right password** — enter the correct one. It connects, and the panel
   returns to the rows showing the hotspot.
5. **Abandon clears it** — reopen the Page, click a secured row, type a few
   characters, press Escape. Reopen that row: **the field is empty**.
6. **Focus released** — dismiss Quick Settings, then type into a terminal.
   Every keystroke lands in the terminal.

```bash
hyprctl activewindow | grep -i class
```

**Pass:** your terminal, not the bar.
