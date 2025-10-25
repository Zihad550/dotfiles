#! /bin/bash

# update & upgrade system
sudo dnf up -y

# git
sudo dnf install git -y

# install rustup and setup rust & cargo
sudo dnf install rustup -y

# zsh
sudo dnf install zsh -y
# sudo dnf install zsh-autosuggestions -y
# sudo dnf install zsh-syntax-highlighting -y
sudo usermod -s $(which zsh) $USER

# extra repo
# sudo dnf install --nogpgcheck --repofrompath 'terra,https://repos.fyralabs.com/terra$releasever' terra-release -y

# starship prompt
sudo dnf copr enable atim/starship -y
sudo dnf install starship -y

# setup nushell
# sudo dnf install nushell -y

# install alacritty terminal
# sudo dnf install alacritty -y

# install ghostty terminal
sudo dnf copr enable pgdev/ghostty -y
sudo dnf install ghostty -y

# install stow
sudo dnf install stow -y

# install fzf
sudo dnf install fzf -y

# zoxide
sudo dnf install zoxide -y


# then init all dot files
# 1. init dotfiles
# 2. update-dnf settings
# 3. update gnome-desktop settings
# 4. set fonts
# 2. run dnfs.sh
# 3. run flatpaks.sh
# 4. tool.sh

# snapd
sudo dnf install snapd -y
sudo ln -s /var/lib/snapd/snap /snap

# install rust and cargo
rustup-init -y
