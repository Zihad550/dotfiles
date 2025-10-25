#! /bin/bash

# do step - 0
# reboot
# step - 2

cd ~/dotfiles

# remove dnfs
. scripts/fedora/remove-dnfs.sh

sudo dnf up -y

# install stow
sudo dnf install stow -y

# 1. link/stow directories
# link fonts
stow fonts

# link ghostty terminal
stow ghostty

# link git
stow git

# link kanata
stow kanata

# link nushell
# stow nushell

# link nvim
stow nvim

# link zsh
stow zsh

# link zed
stow zed

# 2.  update dnf settings
. scripts/fedora/update-dnf-settings.sh

# 3. install scripts
. scripts/fedora/init.sh

# 4. update gnome desktop settings
. scripts/gnome-desktop/set-gnome-hotkeys.sh
. scripts/gnome-desktop/set-gnome-settings.sh

# 5. set fonts
. scripts/set-fonts/set-fonts.sh

# 6. add user to groups
. scripts/fedora/groups.sh

# restart
echo "Do you want to restart? [y/N] "
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
then
    shutdown -r now
fi
