# 08 — Disconnect and forget

**What to build:** Right-clicking a network in the Wi-Fi Page offers the destructive actions — disconnect from the one you are on, forget one you have saved. Left-click still only ever connects.

**Blocked by:** 04 — connecting.

**Status:** ready-for-agent

- [ ] Right-clicking the connected network offers Disconnect
- [ ] Right-clicking a saved network offers Forget
- [ ] Right-clicking a network that is neither shows no menu at all
- [ ] Choosing Disconnect drops the link and the Wi-Fi Row updates
- [ ] Choosing Forget removes the saved profile
- [ ] Left-clicking the connected network still does not disconnect it

## Why right-click

Left-click stays purely "connect" so neither destructive action can be reached
by the click made forty times a week. Disconnecting the network you are using
and forgetting the one you rely on are both bad outcomes from a slipped
pointer, and they sit on rows immediately adjacent to the ones you click all
the time.

The cost is discoverability — right-click is invisible until someone tries it.
Accepted deliberately: these are rare actions, and `nmtui` remains for anyone
who never finds them.

Offer only what applies, rather than a menu of greyed-out items. A row that is
neither connected nor saved has nothing to offer and should show nothing.

Failures follow the pattern 04 established — reported on the row, on the Page,
rather than through a notification.

## Manual verification

Host-only.

```bash
df-qs-restart
```

1. **Disconnect** — open the Page, right-click the network you are on. A menu
   offers Disconnect and, since it is saved, Forget. Choose Disconnect.

```bash
nmcli -t -f NAME,DEVICE connection show --active
```

**Pass:** nothing listed against your Wi-Fi device, and the Wi-Fi Row reads
`Disconnected`.

2. **No menu** — right-click a network that is neither saved nor connected.
   Nothing appears.
3. **Forget** — right-click a saved network you are not on, choose Forget:

```bash
nmcli -f NAME connection show | grep -i "<ssid>"
```

**Pass:** no output. Use a network you can rejoin — this deletes the stored
password.

4. **Left-click unchanged** — reconnect, then left-click the connected network.
   It does **not** disconnect.
