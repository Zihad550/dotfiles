#!/usr/bin/env bash

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y stow neovim zsh
~/dotfiles/scripts/stow/stow-base
~/dotfiles/setup/arch-hyprland/ai-tools
rm -rf ~/.config/zsh/.zshrc
ln -snf "$HOME/dotfiles/setup/devpod-ubuntu/.zshrc" ~/.config/zsh/.zshrc

sudo chsh -s $(which zsh) $USER

echo "now logout and log back in"
