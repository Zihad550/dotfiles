# Audit host agent data before copying it to DevVM

Run `df-devvm-audit` to inspect the current user's Claude Code, Codex and
OpenCode settings and sessions. It checks the usual home directories plus
`CLAUDE_CONFIG_DIR`, `CODEX_HOME` and OpenCode's XDG locations. Use repeated
`--root PATH` arguments to replace these defaults, for example to inspect a
project's `.claude` directory or another custom location.

```sh
df-devvm-audit
df-devvm-audit --agent codex
df-devvm-audit --agent none --json > /tmp/agent-audit.json
df-devvm-audit --root "$HOME/.claude/projects" --agent none
```

The script reads files locally and reports paths and finding categories, never
matching values or content excerpts. Treat the report itself as private because
its paths can identify projects. By default it sends only aggregate counts and
fixed category names to Claude through `df-harness`, the same tool-disabled,
nonpersistent helper used by `df-commit-message`. The audit selects Claude's
`opus` alias, which follows the latest Opus version supported by your Claude Code
installation/provider, unless your Claude configuration remaps that alias.
Agent advice adds interpretation;
it does not inspect or approve individual files. `--agent none` runs without an
agent or network calls. The configured agent CLI still uses its normal account,
provider and user configuration.

Checks cover common token formats, private keys, credential assignments,
authenticated URLs, references to sensitive files, credential filenames, and
executable settings such as hooks and MCP commands. All matches are candidates
for local review: examples and placeholder credentials can also match. A reference
to `.env` does not mean its contents were exposed. Arbitrary private data and
unrecognized credential formats can pass these checks undetected.

File symlinks are read, so settings linked into a dotfiles repo are inspected.
Directory and broken symlinks, databases (including OpenCode sessions), binary
files and unreadable paths are reported as uninspected. Dependency/cache directories named
`node_modules`, `.git`, `cache` or `__pycache__` are excluded and reported.
Files over 32 MiB have only their prefix inspected and are marked incomplete.
Files may change during a scan; stop agents first when you need a stable snapshot.
The scanner neither changes data nor moves anything into DevVM. Exit status 0
means the report completed, including when findings exist; 1 means the agent
adviser failed. Local results are still printed if that happens.

Review actual credentials locally and exclude them from a history migration.
Review executable settings separately because importing them can cause code to
run. Copy only the project's relevant history into the VM, keeping the host copy
independent. Avoid a writable host mount or two-way history sync. An unflagged
file is not certified safe to copy.

`devvm agent import` copies supported settings and logins into DevVM's store,
excluding history. `devvm history import` restores a VM history export; it does
not collect the host's sessions. See [DevVM's agent documentation](https://devvm.dev/docs/using/coding-agents/).
