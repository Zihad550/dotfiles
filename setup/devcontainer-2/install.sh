#!/usr/bin/env bash

sudo apt update -y
sudo apt upgrade -y

sudo apt install -y zsh eza fzf ripgrep neovim trash-cli bat bubblewrap socat git-delta
curl https://mise.run | sh
# sudo add-apt-repository -y ppa:jdxcode/mise
# sudo apt update -y
# sudo apt install -y mise

$HOME/dotfiles/setup/devcontainer-2/stow
mise trust
$HOME/dotfiles/setup/devcontainer-2/tools

sudo chsh -s $(which zsh) $USER

curl -sS https://starship.rs/install.sh | sh

echo "now logout and log back in"
