#!/usr/bin/env bash

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y stow neovim zsh
~/dotfiles/scripts/stow/stow-base

~/dotfiles/setup/arch-hyprland/ai-tools

sudo chsh -s $(which zsh) vscode

echo "now logout and log back in"
