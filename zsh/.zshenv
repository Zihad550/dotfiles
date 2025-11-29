#!/usr/bin/env bash
## env vars to set on login, zsh settings in !/.zshrc
# read first

# default programs
export EDITOR='nvim'
export TERMINAL='ghostty'
# export EDITOR='zeditor --wait'
export Current=catppuccin-mocha
export MANPAGER='nvim +Man!'
export GPG_TTY=$(tty)

# follow XDG base dir specification
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"

# keys
export CONTEXT7_API_KEY="$(pass env/context7_api_key)"
export BROWSER_USE_API_KEY="$(pass env/browser_use_test)"

# bootstrap .zshrc to ~/.config/zsh/.zshrc, any other zsh config files can also reside here
export ZDOTDIR="$XDG_CONFIG_HOME/zsh"

# starship config dir
export STARSHIP_CONFIG="$XDG_CONFIG_HOME/starship/starship.toml"

# node max heap size to 8 gigs
export NODE_OPTIONS="--max-old-space-size=8192"

# go
export GOPATH="$XDG_DATA_HOME/go"
export GOBIN="$GOPATH/bin"
export GOMODCACHE="$XDG_CACHE_HOME/go/mod"

# moving other files and some other vars
export CARGO_HOME="$XDG_DATA_HOME/cargo"
# export CARGO_BIN="$CARGO_HOME/bin"
# export DENO_INSTALL="$(mise where deno)"
# export BUN_INSTALL="$(mise where bun)"

# uv tools
export UV_HOME="$XDG_DATA_HOME/../bin"

# pnpm
export PNPM_HOME="$XDG_DATA_HOME/pnpm"

# rust
export RUSTUP_HOME="$XDG_DATA_HOME/rustup"

# docker
export DOCKER_CONFIG="$XDG_CONFIG_HOME/docker"

# npm
export NPM_CONFIG_USERCONFIG="$XDG_CONFIG_HOME/npm/npmrc"

# .net
export DOTNET_CLI_TELEMETRY_OPTOUT=1

# postgres
export POSTGRES_USER=postgres
export POSTGRES_DB=postgres

# ollama
export OLLAMA_FLASH_ATTENTION=true

# dotfiles bin
export DOTFILES_BIN="$HOME/dotfiles/bin"

# gemini
# export GEMINI_SANDBOX=podman

# PATH Configuration
# export PATH="$BUN_INSTALL/bin:$DOTFILES_BIN:$PATH:$GOBIN:$CARGO_BIN:$PNPM_HOME:$UV_HOME:$DENO_INSTALL/bin"
export PATH="$DOTFILES_BIN:$GOBIN:$CARGO_BIN:$PNPM_HOME:$UV_HOME:$PATH"
