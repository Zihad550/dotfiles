#!/usr/bin/env bash

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y zsh eza fzf ripgrep trash-cli bat bubblewrap socat git-delta software-properties-common starship lazygit stow

# rename batcat to bat
mkdir -p ~/.local/bin && ln -s /usr/bin/batcat ~/.local/bin/bat

# mise
sudo add-apt-repository -y ppa:jdxcode/mise
sudo apt update -y
sudo apt install -y mise

# neovim
sudo add-apt-repository ppa:neovim-ppa/unstable -y
sudo apt update -y
sudo apt install -y make gcc ripgrep fd-find tree-sitter-cli unzip git xclip neovim

$HOME/dotfiles/setup/devcontainer/stow
mise trust
$HOME/dotfiles/setup/devcontainer/tools

sudo chsh -s $(which zsh) $USER

echo "now logout and log back in"
