#!/usr/bin/env bash

# sudo apt update -y
# sudo apt upgrade -y

# sudo apt install -y stow
# eza trash-cli zsh
curl https://mise.run | sh
$HOME/dotfiles/setup/devcontainer/stow
mise trust
$HOME/dotfiles/setup/devcontainer/tools

# sudo chsh -s $(which zsh) $USER

echo "now logout and log back in"
