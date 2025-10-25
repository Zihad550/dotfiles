# How to setup script
# 1. run "snap list" to list all snap packages installed
# 2. updated the scripts to remove all of them

echo "Removing snap packages"

sudo snap remove --purge firefox
sudo snap remove --purge snap-store
sudo snap remove --purge gnome-3-38-2004
sudo snap remove --purge gnome-42-2204

sudo snap remove --purge gtk-common-themes
sudo snap remove --purge snapd-desktop-integration
sudo snap remove --purge bare
sudo snap remove --purge core20
sudo snap remove --purge core22
sudo snap remove --purge snapd

echo "Now removing snapd"
sudo apt remove --autoremove snapd

# in order to disable auto installing snap
echo "Creating nosnap pref file"
sudo -H gedit /etc/apt/preferences.d/nosnap.pref

echo "add the below contents to the file"
echo "Package: snapd
Pin: release a=*
Pin-Priority: -10"
# Package: snapd
# Pin: release a=*
# Pin-Priority: -10

echo "update packages with sudo apt update"
