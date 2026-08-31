# gh-dash review-tab verification

The `C` binding is a host check because the devcontainer has no live Herdr
session and cannot prove that a tab was created, focused, and populated.

Run `gh-dash` from a pane in the active Herdr session, select an open pull
request, and press `C`. The binding should create and focus a tab named
`PR-<number>`, switch to that pull request with Worktrunk, and start OpenCode
with the review prompt.

In the new tab, run this copy-pasteable check:

```bash
set -eu
test "${HERDR_ENV:-}" = 1
test -n "${HERDR_WORKSPACE_ID:-}"
test -n "${HERDR_TAB_ID:-}"
test -n "${HERDR_PANE_ID:-}"
command -v herdr jq wt opencode >/dev/null
herdr pane process-info --current
herdr pane read "$HERDR_PANE_ID" --lines 30
```

Pass means the newly focused tab is labelled `PR-<number>`, `wt switch`
reaches the requested PR worktree, and the pane shows OpenCode running with
`review-pr-for-this-branch`. A successful source-text test is not a substitute
for this host check.
