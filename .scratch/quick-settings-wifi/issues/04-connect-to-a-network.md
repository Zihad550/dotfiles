# 04 — Connect to a saved or open network

**What to build:** Clicking a network in the Wi-Fi Page joins it. The row narrates the attempt, success drops you back to the Quick Settings rows showing the new network, and failure keeps you on the Page and says why.

**Blocked by:** 03 — the Page.

**Status:** ready-for-agent

- [ ] Clicking an open or already-saved network connects to it
- [ ] The clicked row reads `Connecting…` while it is in flight, and the rest of the list dims
- [ ] A successful connect returns to the Quick Settings rows
- [ ] The Wi-Fi Row then shows the new SSID
- [ ] A failed connect stays on the Page and names the reason on that row
- [ ] Nothing closes the panel mid-attempt

Secured networks you have never joined are 07; enterprise networks are 09.
Until those land, clicking one may fail — that is expected, and 07 is what
makes the failure actionable.

## Success returns, failure stays

Success returns to the rows, where the Wi-Fi Row now shows the network you just
picked. The loop closes where it started, and you can see it worked without
hunting for confirmation.

Failure stays on the Page, because the Page is where the fix is: the other
networks are still listed, and in 07 the password field reopens in place. The
reasons are distinguishable and should be distinguished:

| Reason | Detail text |
| --- | --- |
| secrets required | `Wrong password` (07 reopens the field here) |
| authentication timed out | `Authentication timed out` |
| network disappeared | `Network went away` |
| supplicant failed or disconnected | `Connection failed` |
| unknown | `Connection failed` |

Nothing dismisses the panel mid-attempt. Connecting drops and reacquires the
link, which is the worst possible moment to depend on a notification arriving.

## Manual verification

Host-only. Needs a second network you have already saved — a phone hotspot you
have joined before works.

```bash
df-qs-restart
```

1. **Connect** — open the Page, click a saved network you are not currently on.
   The row reads `Connecting…` and the rest of the list dims.
2. **Success** — the panel returns to the Quick Settings rows, and the Wi-Fi
   Row shows the network you just picked.
3. **Confirm** — it is genuinely connected, not just displayed:

```bash
nmcli -t -f NAME,DEVICE connection show --active
```

**Pass:** the network you picked is listed against your Wi-Fi device.

4. **Failure** — turn the saved network off (switch off the hotspot), then try
   to connect to it. The Page **stays open** and the row names a reason rather
   than silently doing nothing.
5. **No mid-flight dismissal** — during step 1, confirm the panel does not
   flicker or close before the outcome lands.
