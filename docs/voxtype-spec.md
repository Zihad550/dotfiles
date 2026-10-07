# Voxtype integration

Status: implemented in the repository. Live microphone and text-insertion checks remain to be run on each machine.

## Settled scope

- Enable Voxtype installation and configuration by default in both `arch-workstation` and `arch-devbox` setup.
- Setup reruns preserve downloaded models and user settings.
- Each machine records from its own microphone and inserts text into its own graphical session. Remote microphone transport is outside this change.
- Adapt the existing partial import using `resources/omarchy` at commit `65c0f330` as the reference.
- Keep `small.en` with English as the initial model and language.
- Use F9 press/release for push-to-talk and Super+Ctrl+X for recording toggle. Remove the obsolete Super+Shift+V stop binding.
- The existing bar indicator opens `voxtype configure` on left-click and the local config in an editor on right-click.
- Store starter defaults in the repository. On first setup, seed a regular local config; subsequent setup runs preserve it. Machine-specific model and hardware choices must not modify repository defaults.
- Adopt Omarchy's recording behavior: pause media during recording and leave audible feedback disabled. Do not add a settings migration for existing local configs.
- Attempt Vulkan setup on a new installation with an installed Vulkan ICD. Preserve backend choices when Voxtype was already installed. Restore CPU operation if GPU setup or service startup fails.
- Package, model-download, and service failures fail the setup step so it can be retried.

## Configuration migration

Both profiles previously stowed `~/.config/voxtype/config.toml`. `setup/common/voxtype/seed-config` detaches either a whole-directory or file symlink into local files. Regular local configs are left alone. A missing config is copied from `voxtype/.config/voxtype/config.toml`. Both stow entrypoints call the initializer instead of stowing Voxtype, and the standalone installer calls it as well.

When an existing symlink points to repository defaults, it receives the updated defaults on pull before being detached. There is no extra compatibility logic for the old feedback settings.

## Previous integration

Both profiles stow the Voxtype config, but neither runs the installer. The installer lives under the workstation setup directory. The shared Hyprland bindings retain a stop-on-release binding but no active start binding. The shared Quickshell bar already displays recording and transcription states.

The existing config selects `small.en`, English, and audible feedback. Omarchy selects `base.en`, English, and media pausing. Omarchy also attempts Vulkan acceleration and uses a status follower that terminates when its parent exits.

## Implementation and provenance

Both profile installers run `setup/common/setup-voxtype` after their package-repository setup. The Shared Setup Script installs `wtype`, `wl-clipboard`, `python`, and `voxtype-bin`, seeds configuration, downloads the configured Whisper model, and installs and restarts the user service. It explicitly checks that the service is enabled and active because upstream setup does not propagate every systemctl failure. After each restart it waits up to 30 seconds of polling for `voxtype status` to report `idle`; the service's `Type=simple` can report active before initialization finishes. Before restarting, it stops the service and removes the configured runtime state file so a stale `idle` from a crashed daemon cannot satisfy the check. Python's TOML parser resolves both `auto` and custom state paths without rewriting configuration. Disabled state reporting fails setup because the bar and recording controls require it. A failed startup or readiness timeout follows the same CPU recovery policy.

The integration adapts Omarchy's installer, recording bindings, configuration controls, and status follower at [commit 65c0f330](https://github.com/basecamp/omarchy/tree/65c0f330). It retains this repository's `small.en` model and Quickshell bar module. The status follower directly execs `setpriv --pdeathsig TERM voxtype status --follow --extended --format json`, and the bar reads the returned `class` field.

CLI behavior was checked against [Voxtype's setup source](https://github.com/peteonrails/voxtype/blob/6d2fc6ddbf791ac00d6a54dc002664010c16b100/src/setup/mod.rs) and [service setup](https://github.com/peteonrails/voxtype/blob/6d2fc6ddbf791ac00d6a54dc002664010c16b100/src/setup/systemd.rs). `--download --no-post-install` preserves an existing config and skips a valid downloaded Whisper model. This installer targets Whisper; switching to another transcription engine is outside its download contract.

Vulkan ICD presence does not prove that transcription works on the GPU. Setup recovers from GPU-switch or service-start failures; failures during actual transcription still require the live check below and, if needed, manual CPU selection.

## Existing-machine rollout

After transferring or pulling these repo changes, run the following as your normal user in a terminal inside each machine's Hyprland session. Both Arch profiles use the same commands. Their existing setup must already have configured the Omarchy package repository.

```sh
cd ~/dotfiles
bash setup/common/setup-voxtype
hyprctl reload
df-qs-restart dotfiles
systemctl --user status voxtype.service --no-pager
```

If `voxtype-bin` is unavailable to pacman, refresh the repo configuration and package databases first:

```sh
bash setup/arch-workstation/setup-omarchy-repos
sudo pacman -Syu
bash setup/common/setup-voxtype
```

Do not run the entire profile installer just to add dictation. No remote microphone transport is configured.

## Live verification

1. Focus a text field, hold F9, say a short sentence, and release. Confirm the text appears and the recording/transcription indicator returns to idle.
2. Start and stop another recording with Super+Ctrl+X. Confirm Super+Ctrl+V still opens clipboard history.
3. Play media and record again. With the starter defaults, media pauses during recording and audible feedback is off.
4. While the indicator is visible, left-click it to open `voxtype configure`; right-click to edit the local config. Configuration is also always available from a terminal through `voxtype configure`.
5. Rerun the standalone installer. Confirm local settings and downloaded models remain intact.

For startup or transcription failures, inspect `journalctl --user -u voxtype.service -n 100 --no-pager`. To select CPU explicitly:

```sh
sudo voxtype setup gpu --disable
voxtype setup systemd
systemctl --user restart voxtype.service
```

## Automated verification

`tests/setup/voxtype.test.js` exercises fresh configuration, both stow symlink layouts, preservation of local settings, setup reruns, package/download/service failures, GPU fallback, and actual Lua binding registration with and without Voxtype available. Run it with `node --test tests/setup/voxtype.test.js`.
