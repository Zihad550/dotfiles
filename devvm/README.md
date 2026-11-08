# devvm layers

Image layers for [devvm](https://devvm.dev/docs/using/customizing/#your-own-layers).
`scripts/stow/stow-base` links `layers/` to `~/.config/devvm/layers`. Only that
folder is managed: the rest of `~/.config/devvm` is devvm's state, such as agent
logins.

## mamacrm

One VM over the whole `~/dev/work/mamacrm` folder, so the frontend, the backend
and all their worktrees share it. The worktrees' `.git` files point at absolute
paths inside that folder, and devvm mounts it at the same path, so git works in
each of them. Vite's `/api` proxy reaches the backend on `localhost:6175`, and
one compose stack (Postgres, Redis, pgAdmin) serves every worktree.

`mamacrm.sh` adds CLI tools (ripgrep, fd, bat, eza, fzf, jq, delta, lazygit,
zoxide, trash-cli, tree, gcc, make, unzip), mise from its PPA, and psql. It
needs the `docker` layer below it. The backend's Go tools (migrate, tparse,
golangci-lint, gofumpt) aren't in the image: `mise run project-init` builds
them in the VM with `go install`, into `~/go/bin`, which the layer puts on PATH.

node and go are devvm shared tools, which also bring the network rules for npm,
the Go module proxy and their downloads. devvm only detects them from files at
the folder's top level, so the VM is created with `--tools node,go`. Inside a
repo, its `mise.toml` takes over: `mise install` adds the node or go version it
pins, plus just, biome, caddy, fallow, redis and stripe-cli.

`mamacrm.policy` allows mise's version lists and the APIs the backend calls.
When an install or call fails, run `devvm network log` to see what was blocked.

```bash
devvm-mamacrm   # zsh alias: creates the VM on first run, opens it after
```

The shell opens in the mamacrm folder. Once per VM:

```bash
cd backend
mise trust && mise install
mise x -- just tools::install::gofumpt  # tools::install's check also wants gofumpt
mise run project-init                   # just tools::install: tparse, golangci-lint, migrate, psql

cd ../frontend
mise trust && mise install
```

Then `mise run dev` in each. The VM's home is `/home/USER.guest`, so `~` in the
VM doesn't lead to the project; it stays at its host path.

The database is the VM's own: compose runs in the VM's Docker, so seed it once
with `mise run dind-reset` in `backend/`. `dind-seed-users` alone fails on an
empty `tier` table.

Use the backend's `127.0.0.1` (dind) mise tasks, since compose runs in the
VM's own Docker. The frontend's `proxy` and `tailscale` tasks need host sudo
and Tailscale, so run them on the host.

devvm treats each repo and worktree as a project of its own. Plain `devvm`
inside `frontend/` or a worktree makes a new VM for it, so use `devvm-mamacrm`,
or `devvm --parent` from a subfolder.

Everything in the folder is writable from the VM, including every repo's
`config.yaml` and `.env.local`. Linux hosts get no `.git` protection, so the VM
can also change any repo's `.git/hooks` and `.git/config`, which run on the
host. Check them before running git hooks on the host.

## changing a layer

Changing a layer script rebuilds that image and every image built on it. To
move an existing VM onto the new build, run `devvm update`. It keeps the VM's
home folder, so the `~/.bashrc.d` file the layer writes reaches only new VMs.
`devvm update --clean-home` replaces the home folder with the image's.
