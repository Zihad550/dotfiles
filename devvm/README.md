# devvm layers

Image layers for [devvm](https://devvm.dev/docs/using/customizing/#your-own-layers).
`scripts/stow/stow-base` and `setup/arch-workstation/stow` link
`layers/` to `~/.config/devvm/layers`. Only that
folder is managed: the rest of `~/.config/devvm` is devvm's state, such as agent
logins.

## shell

The host's shell for any VM. `shell.sh` adds CLI tools (ripgrep, fd, bat, eza,
fzf, jq, delta, lazygit, zoxide, neovim, trash-cli, tree, unzip) and zsh,
starship and atuin, then clones this repo to `/opt/dotfiles` and links
`~/.config/zsh`, starship and atuin to it. `git -C /opt/dotfiles pull` in the
VM updates them.

`~/.zshenv` and `~/.config/zsh-devvm/.zshrc` wrap the real files: they keep Go
in devvm's `~/go` and add devvm's `(devvm)` prompt prefix and blocked-request
notice, which devvm only ships for bash. devvm always opens bash, so
`~/.bashrc.d/zz-zsh.sh` hands interactive shells to zsh; `bash -c` from agents
and scripts stays bash. The first zsh start downloads zinit's plugins from
GitHub, which devvm's base policy allows.

Ubuntu names Ghostty's terminfo entry only `ghostty`, so the layer links
`xterm-ghostty` to it. Without that, zsh in Ghostty draws typed letters twice.

Put it below a project's layer (`--layers docker,shell,mamacrm`), or give it to
every new VM with `devvm setup --layers shell`.

## Automatic entry

Interactive zsh shells enter an existing VM when opened in its project or when
`cd`, zoxide or `wt switch` moves into it. This includes Herdr panes: the shell
hook runs inside each pane, without a Herdr plugin. Reload the host shell after
updating dotfiles to enable it. Scripts and non-interactive shells do not route,
and shells inside a VM never start another VM.

`bin/df-devvm-auto` reads `devvm ls --json`, chooses the nearest enclosing VM
folder, and uses `devvm host --here --no-input` to start it if needed. That
command requires an existing VM, so this path cannot create one. Lookup ignores
git boundaries: mamacrm's nested repos and worktrees use the mamacrm VM. A
worktree outside a VM's mounted folder stays on the host unless it has its own
VM; the parent VM cannot reach a sibling folder that it does not mount.
Lookup runs only when the shell directory changes, with a three-second limit;
a lookup failure leaves the shell on the host.

The VM opens at the same directory, with a `(devvm)` prompt. A temporary shell
wrapper preserves its existing zsh configuration, or uses bash if zsh is absent,
and works with older images without rebuilding them. Inside the VM, moving
outside its project folder ends the VM shell and changes the host shell to that
directory if it exists on the host. `exit` or Ctrl+D returns to the host at the
original directory. After returning, automatic entry pauses for that project
until you leave its folder; `devvm-auto-enter` explicitly enters it again.
Exiting the shell leaves the VM running.

To disable automatic entry globally, set `DEVVM_AUTO_ENTER=0` in your shell
configuration, or create `~/.config/devvm/no-auto-enter`. To disable a folder
and its descendants, create `.devvm-no-auto` in that folder. These are marker
files, never executable configuration. Remove the marker and run
`devvm-auto-enter`, or open a new shell, to resume entry.

Once the pane has entered the VM, typing `claude` or `codex` runs that VM's
agent. Commands started directly by a non-interactive tool stay explicit; the
hook does not redirect scripts or background jobs. For VS Code Remote-SSH,
`df-devvm-auto code /path/to/project` opens that folder in its existing VM,
starting it first. It fails when no VM exists. Other editors keep their normal
launch behavior; use the VM terminal when they have no Remote-SSH integration.

### Manual verification in Herdr

Use a project with an existing VM, such as mamacrm:

1. Open a new Herdr pane in the project. The prompt must show `(devvm)`, and
   `pwd` must show the same project path. A stopped VM should start.
2. Move into a nested repo or worktree. It must stay in the same VM. Move above
   the VM's root with `cd ..` (repeat as needed). The shell must return to the
   host at that directory.
3. Enter the project again, then use `exit`. The host prompt must remain usable
   in that project. Run `devvm-auto-enter` to enter again.
4. On the host, create `.devvm-no-auto` in the project, then leave and re-enter
   its directory. The shell must stay on the host. Remove the marker afterward.
5. Open a directory without a VM. It must stay on the host, and `devvm ls`
   must list the same VMs as before the test.

## mamacrm

One VM over the whole `~/dev/work/mamacrm` folder, so the frontend, the backend
and all their worktrees share it. The worktrees' `.git` files point at absolute
paths inside that folder, and devvm mounts it at the same path, so git works in
each of them. Vite's `/api` proxy reaches the backend on `localhost:6175`, and
one compose stack (Postgres, Redis, pgAdmin) serves every worktree.

`mamacrm.sh` adds psql; devvm's base already has git, curl, jq, gcc and make.
It needs the `docker` layer below it, and the VM gets `shell` too:
`--layers docker,shell,mamacrm`. The backend's Go tools (migrate, tparse,
golangci-lint, gofumpt) aren't in the image: `mise run project-init` builds
them in the VM with `go install`, into `~/go/bin`, which devvm puts on PATH.
mise comes with devvm's base, which also activates it and trusts the repos'
`mise.toml` files.

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
mise install
mise x -- just tools::install::gofumpt  # tools::install's check also wants gofumpt
mise run project-init                   # just tools::install: tparse, golangci-lint, migrate, psql

cd ../frontend
mise install
```

Then `mise run dev` (`mrd`) in each.

If devvm says the folder "was deleted or replaced" after a reboot, run
`devvm adopt` in it. btrfs can give `/home` a new device number at boot, and
devvm identifies the folder partly by that.

The VM's home is `/home/USER.guest`, so `~` in the
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
home folder but not the rest of its disk, so the database in its Docker is lost;
seed it again with `mise run dind-reset`.

`shell` sits under every image that uses it, so changing `shell.sh` rebuilds
them all. When `devvm layer add` remade the mamacrm VM, the files the layer
writes (`~/.zshenv`, the zsh wrapper, the `~/.bashrc.d` scripts) came from the
new image, and the rest of the home folder (mise installs, `~/go/bin`) stayed.
