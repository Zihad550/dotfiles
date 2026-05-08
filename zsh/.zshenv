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

########## api keys
# export OPENROUTER_API_KEY=
if command -v pass &>/dev/null; then
    CONTEXT7_API_KEY="$(pass env/context7_api_key)"
    BROWSER_USE_API_KEY="$(pass env/browser_use_test)"
    MISE_GITHUB_TOKEN=$(pass github/personal-access-token-mise)
    # GEMINI_API_KEY="$(pass jehad.logs/gemini-api-key)"
    # GEMINI_API_KEY="$(pass webdev/gemini-api-key)"
    GEMINI_API_KEY="$(pass env/gemini_api_key)"
    OPENROUTER_API_KEY="$(pass env/openrouter-opencode-key)"
    export CONTEXT7_API_KEY BROWSER_USE_API_KEY MISE_GITHUB_TOKEN GEMINI_API_KEY OPENROUTER_API_KEY
fi

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

###### application configs
# export DOTNET_CLI_TELEMETRY_OPTOUT=1 # .net
# export POSTGRES_USER=postgres
# export POSTGRES_DB=postgres
# export GEMINI_SANDBOX=podman # gemini
# export AICHAT_MODEL="gemini:gemini-2.5-flash" # aichat
### portless
# PORTLESS_PORT=80
PORTLESS_HTTPS=1
export PORTLESS_HTTPS
OLLAMA_FLASH_ATTENTION=true                  # ollama
AICHAT_PLATFORM="gemini"                     # aichat
AICHAT_MODEL="gemini:gemini-3-flash-preview" # aichat
# AICHAT_MODEL="gemini:gemini-2.5-flash" # aichat
export OLLAMA_FLASH_ATTENTION AICHAT_PLATFORM AICHAT_MODEL

# docker
# export DOCKER_HOST=unix:///run/user/1000/docker.sock

# PATH Configuration
# dotfiles bin
# export DOTFILES_BIN="$HOME/dotfiles/bin:$HOME/dotfiles/bin/voxtype:$HOME/dotfiles/bin/walker"
# PATH entries are managed by mise (see ~/.config/mise/config.toml [env]._.path)
# because `mise activate zsh` rebuilds PATH on every prompt and would otherwise
# clobber any additions made here.
