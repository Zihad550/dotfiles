echo "install flatpak"
sudo apt -y install flatpak

echo "Install the Software Flatpak plugin"
sudo apt -y install gnome-software-plugin-flatpak

echo "Add the Flathub repository"
flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

echo "Please reload"