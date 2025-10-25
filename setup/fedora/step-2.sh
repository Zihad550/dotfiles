#! /bin/bash
# to run . dotfiles/scripts/fedora/start.sh
cd ~/dotfiles

# 5. install apps
. scripts/fedora/dnfs.sh
. scripts/fedora/flatpaks.sh
. scripts/fedora/snaps.sh
. scripts/fedora/tool.sh

# restart
echo "Do you want to restart? [y/N] "
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
then
    shutdown -r now
fi
