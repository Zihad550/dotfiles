#!/bin/bash

# update & upgrade system
sudo dnf up -y

# update flatpaks
flatpak update -y

# insomnia for api testing
# sudo dnf install insomnia -y

# install curl,git
sudo dnf install curl git -y

# btop for system monitoringc
sudo dnf install btop -y

# language supports
sudo dnf install gcc g++ golang -y

# neovim
sudo dnf install neovim -y

# gnome extension and gnome-tweaks
sudo dnf install gnome-tweaks gnome-extensions-app -y


# enable fedora workstation repositiories and google chrome
sudo dnf install fedora-workstation-repositories -y
# sudo dnf install google-chrome-stable -y

# install brave browser instead installing flatpak
# sudo dnf install dnf-plugins-core
# sudo dnf config-manager addrepo --from-repofile=https://brave-browser-rpm-release.s3.brave.com/brave-browser.repo
# sudo dnf install brave-browser -y

# github cli
sudo dnf install gh -y

# gimp
# sudo dnf install gimp -y

# bat
sudo dnf install bat -y

# zed
sudo dnf install zed -y

# ufw
sudo dnf install ufw -y
sudo ufw enable
sudo systemctl enable ufw.service
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw deny SSH
sudo ufw allow syncthing


sudo ufw deny SSH
sudo ufw deny 22

# syncthing
sudo dnf install syncthing -y
sudo ufw allow 22000/tcp
sudo ufw allow 8384/tcp
systemctl --user enable syncthing.service

# lazygit
sudo dnf copr enable atim/lazygit -y
sudo dnf install lazygit -y

# vscode
sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
echo -e "[code]\nname=Visual Studio Code\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\nenabled=1\ngpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" | sudo tee /etc/yum.repos.d/vscode.repo > /dev/null
sudo dnf install code -y

# transmission
sudo dnf install transmission -y

# curlie (curl + httpie)
sudo dnf install curlie -y

# uv (python project and package manager written in rust)
sudo dnf install uv -y

# ffuf (fast web fuzzer)
# sudo dnf install ffuf -y

# jq -> json processing tool
# sudo dnf install jq -y

# tealdeer (command line cheatsheet)
sudo dnf install tealdeer -y
    # run this first time to update the cache & run this if missing
tldr --update

# docker desktop
sudo dnf install dnf-plugins-core -y
sudo dnf config-manager addrepo --overwrite --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
curl -O "https://desktop.docker.com/linux/main/amd64/docker-desktop-x86_64.rpm?utm_source=docker&utm_medium=webreferral&utm_campaign=docs-driven-download-linux-amd64"
sudo dnf install ./docker-desktop-x86_64.rpm -y
rm -rf docker-desktop-x86_64.rpm
systemctl --user enable docker-desktop
