#!/usr/bin/env bash

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y stow neovim
# eza trash-cli zsh
$HOME/dotfiles/setup/devcontainer/stow
$HOME/dotfiles/setup/devcontainer/tools

# sudo chsh -s $(which zsh) $USER

echo "now logout and log back in"
