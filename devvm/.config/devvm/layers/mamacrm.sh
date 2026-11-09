#!/usr/bin/env bash
# One VM for the whole mamacrm folder (frontend, backend and their worktrees):
# --layers docker,shell,mamacrm. devvm's base brings mise and runs node and go
# as shared tools; each repo's mise.toml installs its own tools. See
# devvm/README.md.
set -euo pipefail

if ! command -v docker &>/dev/null; then
    echo "mamacrm: docker is missing; create the VM with --layers docker,shell,mamacrm" >&2
    exit 1
fi

sudo apt-get update
# gcc, make, git and curl come with devvm's base.
sudo apt-get install -y --no-install-recommends postgresql-client
