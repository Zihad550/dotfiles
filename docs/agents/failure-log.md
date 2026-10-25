# Agent failure log

Mistakes agents made in this repo, and the rule each one produced. Add an entry
when a mistake reaches staging or review. Describe the leak in general terms;
never copy the sensitive value into this file.

## 2026-10-25: work tailnet hostnames in DNS docs

**What happened:** While writing `docs/dns.md`, an agent used the work
tailnet's MagicDNS suffix and a real work host on it as the example domain and
verification query. The values were staged, and they came out before commit
only because the user asked whether any work domains were included.

**Why it slipped:** The agent copied real values from the session as
examples, and no step checked staged content for private hostnames.

**Rule:** Tracked files use placeholder domains: `example.com`,
`example.ts.net`, `host.example.ts.net`, `work.example`. Real tailnet, work
and private hostnames stay in machine-local, untracked config. Before staging,
search the staged diff for `ts.net` and any other internal hostnames, and
replace every real one with a placeholder.
