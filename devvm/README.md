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

It also clones the skills repo to `~/dev/src/github.com/Zihad550/skills`, the
host's path, so any VM can edit it. devvm can't mount it: a VM mounts only its
project folder. The daily update below pulls it, fast-forward only, so local
commits or conflicting edits leave it alone. To push, save a GitHub
token once with `devvm secret set github` (a fine-grained one, limited to the
repos VMs may push to), then run `devvm secret use github` in each project
folder. devvm's proxy puts the token into GitHub requests, and the VM sees only
a placeholder.

On the first interactive shell, `setup/devvm/setup-skills` installs Node and the
skills CLI with mise, then runs `setup/common/setup-skills --skills-only` inside
the VM. It installs your own skills from the local skills checkout. Claude and
Codex get writable skill folders in the VM's home, separate from devvm's
read-only agent store. Each shell restores these links if devvm replaced them;
subsequent shells skip installation. Failed installations retry next time.
Host settings, logins and imported plugins keep devvm's existing behavior;
`--skills-only` copies skills into those folders so relative CLI symlinks cannot
break, and leaves the imported Claude plugins alone.

The first interactive shell of each day, including an automatic entry, starts
`setup/devvm/update-daily` in the background. It runs the `update` hook (see
[Hooks](#hooks)): pull `/opt/dotfiles` and the skills checkout, fast-forward
only, then rerun `setup-skills` to refresh the VM's skills. Dotfiles changes
apply from the next shell. The day uses the VM's date, and a host-triggered
`update` counts for it. A failed pull is only logged; a failed refresh is
retried on the next shell. Other shells skip while one runs, without waiting
for it. Its log is `~/.local/state/dotfiles/devvm/update-daily.log`.

To refresh skills now, or set them up before using an agent without opening an
interactive shell, run `df-devvm-update --hook update` on the host, or inside
the VM:

```bash
bash /opt/dotfiles/setup/devvm/run-hook update
```

Existing VMs get the same from the host command, which pulls their
`/opt/dotfiles` first; it replaces the old read-only skill links and installs
the startup hooks without changing host copies, and adds the daily hook. New
images get
the first-shell hook once these dotfiles changes are published and the shell
layer is rebuilt. Skill updates are per VM; the host's daily update no longer
copies skills into them.

Put it below a project's layer (`--layers docker,shell,mamacrm`), or give it to
every new VM with `devvm setup --layers shell`.

`shell.policy` allows crates.io and its subdomains for Cargo registry access,
and the mise, Node and npm hosts needed to install skills inside the VM.

## Updating from the host

`bin/df-devvm-update` updates every VM in `devvm ls`, from each VM's folder:

1. `devvm tools update` moves it to the newest shared tools (agents and
   toolchains). The tools are mounted, so nothing on the VM's disk changes.
2. In VMs with the `shell` layer, it runs the `update` and `apt-upgrade` hooks
   over ssh, so dotfiles, skills and Ubuntu packages are current without
   opening a shell in the VM. A failed hook doesn't skip the next one. VMs
   without the `shell` layer, such as a `base` one, get no hooks; only `--full`
   refreshes their packages.

A VM that was stopped is stopped again, and a VM whose folder is gone is
skipped. A VM that devvm says "was deleted or replaced" fails until you run
`devvm adopt` in its folder (see [mamacrm](#mamacrm)).

`df-devvm-update --full` first runs `devvm rebuild base --force`, which builds
base again from the newest Ubuntu packages. Then, instead of step 1, it runs
`devvm update --force`, which remakes each VM from its image's new build. That
picks up layer changes and resets the packages `apt-upgrade` patched in place,
but loses everything outside the VM's home and project folders, such as
mamacrm's Docker database.

It ends with `devvm upgrade --check` and prints a notice when a newer devvm is
out. devvm itself is never upgraded automatically, so a release that changes
how VMs or images behave waits until you run `devvm upgrade`.

The host's daily update runs `df-devvm-update` after syncing devvm's agent
settings (arch-desktop's `df-update-daily`), and passes `--full` until a run
of it succeeds each month. That run records the month in
`~/.local/state/dotfiles/devvm-full.last-triggered`; write the current month
(`date +%Y-%m`) there to skip this month's rebuild.

## Hooks

A hook is a script in this repo at `setup/devvm/hooks/<name>`, run inside a
shell-layer VM by `setup/devvm/run-hook <name>`. `run-hook` pulls
`/opt/dotfiles` first, so a hook added or changed on the host runs in its
pushed version; a failed pull still runs the checked-out one. Hooks get
`DOTFILES_DIR`. Names are lowercase letters, digits and `-`.

From the host, `df-devvm-update --hook <name>` runs one hook in every
shell-layer VM, starting stopped VMs and stopping them again, without the tools
update. Inside a VM, run `bash /opt/dotfiles/setup/devvm/run-hook <name>`.
VMs made before `run-hook` existed pull `/opt/dotfiles` once to get it.

| Hook | Does |
| --- | --- |
| `update` | Pulls the skills checkout, reruns `setup-skills`, and marks the day done for `update-daily`. A run already in progress makes it skip. |
| `apt-upgrade` | Runs `apt-get update` and `apt-get upgrade` with sudo, without prompts, keeping changed config files. The next `devvm update` resets the VM to its image's packages. |

## Automatic entry

When the `DEVVM_AUTO_ENTER` switch below is on, interactive zsh shells enter an
existing VM when opened in its project or when `cd`, zoxide or `wt switch` moves
into it. This includes Herdr panes: the shell hook runs inside each pane, without
a Herdr plugin. Scripts and non-interactive shells do not route, and shells
inside a VM never start another VM.

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

`DEVVM_AUTO_ENTER` in `zsh/.config/zsh/.zshrc` is the global switch: `1` is on,
and anything else, including the current `0`, is off. Change it to `1` to turn
automatic entry on for new shells and Herdr panes, or run
`export DEVVM_AUTO_ENTER=1` to turn it on in the current shell.
`devvm-auto-enter` obeys the switch too, and does nothing while it is off.
Creating `~/.config/devvm/no-auto-enter` also disables automatic entry globally,
whatever the switch says. To disable a folder and its descendants, create
`.devvm-no-auto` in that folder. These are marker files, never executable
configuration. With the switch on, remove the marker and run
`devvm-auto-enter`, or open a new shell, to resume entry.

Once the pane has entered the VM, typing `claude` or `codex` runs that VM's
agent. Commands started directly by a non-interactive tool stay explicit; the
hook does not redirect scripts or background jobs. For VS Code Remote-SSH,
`df-devvm-auto code /path/to/project` opens that folder in its existing VM,
starting it first. It fails when no VM exists. Other editors keep their normal
launch behavior; use the VM terminal when they have no Remote-SSH integration.

### Manual verification in Herdr

With `DEVVM_AUTO_ENTER=1`, use a project with an existing VM, such as mamacrm:

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

The alias's size (6 CPUs, 16 GiB memory, 100 GiB disk) applies only when it
creates the VM. To resize an existing one, run
`devvm size --cpus 6 --memory 16 --disk 100` in `~/dev/work/mamacrm`; it takes
effect on the VM's next start.

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

## arch-desktop

`arch-desktop` is the main project: its host checkout is mounted into the VM
at the same path. The other two repos are cloned inside the VM: `shell`
provides dotfiles at `/opt/dotfiles` (also linked as `~/dotfiles`), and
`arch-desktop.sh` clones the archive to `~/dotfiles-archive`.

```zsh
devvm-arch-desktop
```

The shortcut uses `${ARCH_DESKTOP_DIR:-$HOME/arch-desktop}` and creates the VM
with `--layers shell,arch-desktop --tools node --agents claude`, two CPUs
and 4 GiB of memory. It opens the existing VM on later runs. To use another
checkout without the shortcut:

```bash
cd /path/to/arch-desktop
devvm --here --layers shell,arch-desktop --tools node --agents claude --cpus 2 --memory 4
```

The clones are independent of the host's dotfiles and archive checkouts; host
edits to those repos are not visible in the VM. Update them with
`git -C ~/dotfiles pull --ff-only` and
`git -C ~/dotfiles-archive pull --ff-only`. The dotfiles clone is shallow and
also supplies the VM's live shell configuration. `/opt/dotfiles` is part of
the image and is replaced by `devvm update`; commit and push its work first.
The archive lives in the persistent VM home. To push from either clone,
save a GitHub token on the host with `devvm secret set github`, then enable
it for the project with `devvm secret use github`.

This remains an Ubuntu coding VM; it does not run the Arch desktop installers
or provide a Hyprland session. An existing VM needs
`devvm layer add shell arch-desktop` from the main checkout to add these layers.

## changing a layer

Changing a layer script rebuilds that image and every image built on it. To
move an existing VM onto the new build, run `devvm update`. It keeps the VM's
home folder but not the rest of its disk, so the database in its Docker is lost;
seed it again with `mise run dind-reset`.

`shell` sits under every image that uses it, so changing `shell.sh` rebuilds
them all. When `devvm layer add` remade the mamacrm VM, the files the layer
writes (`~/.zshenv`, the zsh wrapper, the `~/.bashrc.d` scripts) came from the
new image, and the rest of the home folder (mise installs, `~/go/bin`) stayed.
