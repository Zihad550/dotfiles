# The Session Lock holds its own sleep inhibitor

The Session Lock takes a logind delay inhibitor itself, locks when logind
announces sleep, and releases the inhibitor once it reports Secure. Omarchy —
which this port otherwise follows closely — instead runs an external watcher
that monitors logind over D-Bus and drives its shell over IPC under a computed
time budget. We diverge because that machinery exists to span two processes, and
here the thing holding the inhibitor and the thing that must become Secure are
the same process.

## Why

**The upstream's complexity is a bridge, not a safety feature.** Its sleep path
derives a budget from logind's own inhibit window, clamps every IPC call to what
remains of it, polls the shell for a Secure reply, and re-requests on unreadable
answers. Every one of those is a consequence of asking another process a
question that might not be answered. Owning the inhibitor inside the lock makes
"am I Secure yet" a local property, and the entire apparatus has nothing left to
do.

**Importing it anyway would import the cure without the disease.** The failure
it defends against — the shell not answering in time — cannot occur when there
is no call. Carrying the code would leave a future reader unable to tell which
of its guards were load-bearing.

**The inhibit window still has to be raised, for a reason unrelated to
topology.** A delay inhibitor is a timer, not a promise: logind suspends when
the window expires whether the session is Secure or not, and the default window
is too short when closing the lid also reconfigures displays. That drop-in is
imported unchanged, along with the upstream's assertion on its value.

## Consequences

The lid is where this decision is most likely to show strain, since lid
transitions can stall compositor IPC while the lock is trying to secure. The
upstream's clamshell synchronisation addresses that and is deliberately not
imported, because it is wired into the external script this ADR declines. If the
lid path proves unreliable, the fix is to address it in-process — not to adopt
the external shape wholesale.

Should the lock ever move out of the process holding the inhibitor, this
decision reverses and the upstream's design becomes correct again.
