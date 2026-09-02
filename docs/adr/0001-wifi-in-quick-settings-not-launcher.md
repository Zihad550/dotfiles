# Wi-Fi lives in Quick Settings, not the Launcher

Tickets 16 and 19 moved every picker in this repo *into* the Launcher and deleted the scripts and menus that had done the job before. Wi-Fi deliberately goes the other way: joining a network is a Quick Settings page in the bar, reached with the mouse from the row that already shows the connection.

## Why

The consolidation those tickets performed was about pickers that answer a *query* — you know what you want, you type part of its name, you act on it. Choosing a Wi-Fi network is not that. The candidates are a short list you did not author and cannot predict, you pick by signal strength and recognition rather than by name, and the state you are acting on is already displayed in the bar two centimetres from where the list opens.

The Launcher also cannot show what this needs while it is doing it: a connection attempt runs for several seconds and fails in six distinguishable ways, and the Launcher's model is to close on a primary action. Staying open to narrate a network transition is not what it is for.

## Consequences

- GitHub issue #34, the designed but unbuilt Launcher Wi-Fi Provider, is closed as `wontfix`.
- There is exactly one front door for joining a network, so no shared service was extracted. If a second surface is ever wanted, the logic in the Quick Settings page has to come out into a singleton first (`TailscaleService` is the shape).
- `nmtui` is retained, not as a leftover but as the deliberate boundary: `connectWithPsk()` covers PSK security only, so WPA-Enterprise, static addressing and VPNs hand off to it.
